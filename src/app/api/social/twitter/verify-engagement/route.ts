import { NextRequest, NextResponse } from "next/server";
import {
  checkHandleInCache,
  getCachedHandles,
  getCacheStatus,
  isCacheValid,
} from "@/lib/twitter-engagement-cache";
import { TWEETS_TO_VERIFY } from "@/config/tweetsToVerify";

const LOG_PREFIX = "[verify-engagement]";

const baseUrl =
  process.env.USER_API_URL ||
  process.env.USER_API_BASE_URL ||
  process.env.USERDB_API_URL;
const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;

/** PP awarded per action type */
const POINTS = { quote: 250, comment: 100 } as const;

interface VerifyEngagementRequest {
  xHandle: string;
  tweetId: string;
  action: "comment" | "quote";
  /** Wallet address for crediting PP and checking quest completion */
  address?: string;
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
 * Body: { xHandle, tweetId, action: "comment" | "quote", address?: string }
 * Verifies if the connected X user has commented on or quoted the given tweet.
 * If address is provided and verification succeeds, credits PP (250 for quote, 100 for comment)
 * and marks the quest complete to prevent re-verification.
 */
export async function POST(req: NextRequest) {
  try {
    const body: VerifyEngagementRequest = await req.json();
    const { xHandle, tweetId, action, address } = body;

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
    const addr = address?.trim() || null;

    console.log(`${LOG_PREFIX} POST action=${action} tweetId=${tid} xHandle=${handle} address=${addr ? addr.substring(0, 10) + "..." : "none"}`);

    let result: {
      verified: boolean;
      error?: string;
      lastRefreshedAt?: number;
      nextRefreshAt?: number;
      alreadyCompleted?: boolean;
      pointsEarned?: number;
    };

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

    // If engagement verified and address provided, credit PP and mark quest complete
    if (result.verified && addr && baseUrl && apiKey) {
      const tweetConfig = TWEETS_TO_VERIFY.find((t) => t.id === tid);
      if (!tweetConfig) {
        console.warn(`${LOG_PREFIX} No config for tweet ${tid}, skipping PP credit`);
        return NextResponse.json(result, { status: 200 });
      }

      const questId = action === "comment" ? tweetConfig.commentQuestId : tweetConfig.quoteQuestId;
      const taskId = action === "comment"
        ? `VERIFY_COMMENT_${tid}`
        : `VERIFY_QUOTE_${tid}`;
      const points = POINTS[action];

      try {
        // 1. Check if quest already completed (prevents re-verification)
        const completionUrl = `${baseUrl.replace(/\/+$/, "")}/users/${encodeURIComponent(addr)}/quests/${encodeURIComponent(questId)}/completion`;
        const completionRes = await fetch(completionUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          cache: "no-store",
        });

        if (completionRes.ok) {
          const completionData = await completionRes.json();
          if (completionData.completed === true) {
            result.alreadyCompleted = true;
            result.pointsEarned = 0;
            return NextResponse.json(result, { status: 200 });
          }
        }
      } catch (e) {
        console.warn(`${LOG_PREFIX} Quest completion check failed (non-fatal):`, e);
      }

      try {
        // 2. Credit PP via completeTask
        const completeUrl = `${baseUrl.replace(/\/+$/, "")}/player-points/${encodeURIComponent(addr)}/tasks/${encodeURIComponent(taskId)}/complete`;
        const completeRes = await fetch(completeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            metadata: {
              title: `Verify ${action} on tweet ${tid}`,
              verified: true,
              verifiedAt: new Date().toISOString(),
              xHandle: handle,
              tweetId: tid,
              action,
            },
          }),
          cache: "no-store",
        });

        if (completeRes.ok) {
          const completeData = await completeRes.json();
          result.pointsEarned = completeData.pointsEarned ?? points;
          result.alreadyCompleted = completeData.alreadyCompleted === true;

          // 3. Mark quest complete to prevent re-verification
          const markUrl = `${baseUrl.replace(/\/+$/, "")}/users/${encodeURIComponent(addr)}/quests/${encodeURIComponent(questId)}/complete`;
          await fetch(markUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey },
            body: JSON.stringify({ completed: true }),
            cache: "no-store",
          });
        } else {
          const errText = await completeRes.text();
          console.error(`${LOG_PREFIX} completeTask failed:`, completeRes.status, errText);
          result.error = result.error || "Failed to credit points. Please try again.";
        }
      } catch (e) {
        console.error(`${LOG_PREFIX} Error crediting PP:`, e);
        result.error = result.error || "Failed to credit points. Please try again.";
      }
    } else if (result.verified && !addr) {
      result.error = "Connect your wallet to receive PP for verification.";
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
