import { NextRequest, NextResponse } from "next/server";
import {
  checkHandleInCache,
  getCachedHandles,
  getCacheStatus,
  isCacheValid,
} from "@/lib/twitter-engagement-cache";

const LOG_PREFIX = "[verify-engagement]";

interface VerifyEngagementRequest {
  xHandle: string;
  tweetId: string;
  action: "comment" | "quote";
}

/** Same as cache: strip @, trim, NFKC, lowercase so BeraWallah matches berawallah. */
function normalizeHandle(handle: string): string {
  const s = handle.replace(/^@/, "").trim();
  return (s.normalize("NFKC") || s).toLowerCase();
}



/**
 * Verify if the user has quoted the given tweet.
 * ONLY checks cache - never fetches from API (data should be prefetched).
 */
async function verifyQuote(
  xHandle: string,
  tweetId: string
): Promise<{ verified: boolean; error?: string; debug?: { fetchedCount: number; normalizedLookup: string } }> {
  const normalized = normalizeHandle(xHandle);
  console.log(`${LOG_PREFIX} verifyQuote xHandle=${xHandle} tweetId=${tweetId} normalized=${normalized} (cache-only check)`);

  // Only check cache - never fetch
  if (!isCacheValid(tweetId, "quote")) {
    return {
      verified: false,
      error: "Engagement data is still loading or expired. Please wait for refresh.",
    };
  }

  const verified = checkHandleInCache(tweetId, "quote", normalized);
  const cachedHandles = getCachedHandles(tweetId, "quote");
  const count = cachedHandles?.size ?? 0;
  console.log(`${LOG_PREFIX} verifyQuote cache check: verified=${verified} cachedUsersCount=${count}`);

  const debug =
    process.env.NODE_ENV === "development"
      ? { fetchedCount: count, normalizedLookup: normalized }
      : undefined;
  return { verified, ...(debug && { debug }) };
}


/**
 * Verify if the user has replied (commented) on the given tweet.
 * ONLY checks cache - never fetches from API (data should be prefetched).
 */
async function verifyComment(
  xHandle: string,
  tweetId: string
): Promise<{ verified: boolean; error?: string; debug?: { fetchedCount: number; normalizedLookup: string } }> {
  const normalized = normalizeHandle(xHandle);
  console.log(`${LOG_PREFIX} verifyComment xHandle=${xHandle} tweetId=${tweetId} normalized=${normalized} (cache-only check)`);

  // Only check cache - never fetch
  if (!isCacheValid(tweetId, "comment")) {
    return {
      verified: false,
      error: "Engagement data is still loading or expired. Please wait for refresh.",
    };
  }

  const verified = checkHandleInCache(tweetId, "comment", normalized);
  const cachedHandles = getCachedHandles(tweetId, "comment");
  const count = cachedHandles?.size ?? 0;
  console.log(`${LOG_PREFIX} verifyComment cache check: verified=${verified} cachedUsersCount=${count}`);

  const debug =
    process.env.NODE_ENV === "development"
      ? { fetchedCount: count, normalizedLookup: normalized }
      : undefined;
  return { verified, ...(debug && { debug }) };
}

/**
 * POST /api/social/twitter/verify-engagement
 * Body: { xHandle, tweetId, action: "comment" | "quote" }
 * Verifies if the connected X user has commented on or quoted the given tweet.
 */
export async function POST(req: NextRequest) {
  try {
    const body: VerifyEngagementRequest = await req.json();
    const { xHandle, tweetId, action } = body;

    if (!xHandle?.trim()) {
      return NextResponse.json({ error: "xHandle is required" }, { status: 400 });
    }
    if (!tweetId?.trim()) {
      return NextResponse.json({ error: "tweetId is required" }, { status: 400 });
    }
    if (!action || !["comment", "quote"].includes(action)) {
      return NextResponse.json(
        { error: "action must be one of: comment, quote" },
        { status: 400 }
      );
    }

    const tid = tweetId.trim();
    const handle = xHandle.trim();

    console.log(`${LOG_PREFIX} POST action=${action} tweetId=${tid} xHandle=${handle} normalized=${normalizeHandle(handle)}`);

    let result: { verified: boolean; error?: string; lastRefreshedAt?: number; nextRefreshAt?: number };
    if (action === "comment") {
      result = await verifyComment(handle, tid);
    } else {
      result = await verifyQuote(handle, tid);
    }

    // Include cache timestamps in response
    const status = getCacheStatus(tid, action);
    if (status.lastRefreshedAt && status.nextRefreshAt) {
      result.lastRefreshedAt = status.lastRefreshedAt;
      result.nextRefreshAt = status.nextRefreshAt;
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[API] Error in verify-engagement:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 }
    );
  }
}
