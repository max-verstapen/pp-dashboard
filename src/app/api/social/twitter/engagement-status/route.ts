import { NextRequest, NextResponse } from "next/server";
import { getAllCacheStatus } from "@/lib/twitter-engagement-cache";
import { TWEETS_TO_VERIFY } from "@/config/tweetsToVerify";

/**
 * GET /api/social/twitter/engagement-status
 * Returns cache status (lastRefreshedAt, nextRefreshAt) for all configured tweets.
 * Used by UI to show countdown timers.
 */
export async function GET(req: NextRequest) {
  try {
    const tweetIds = TWEETS_TO_VERIFY.map((t) => t.id);
    const status = getAllCacheStatus(tweetIds);

    return NextResponse.json(
      {
        status,
        tweetIds,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[API] Error in engagement-status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 }
    );
  }
}
