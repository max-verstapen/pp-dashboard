import { NextRequest, NextResponse } from "next/server";
import { setCachedHandles } from "@/lib/twitter-engagement-cache";
import { TWEETS_TO_VERIFY } from "@/config/tweetsToVerify";
import { fetchAllCommentUserHandles, fetchAllQuoteUserHandles } from "@/lib/twitter-engagement-fetchers";

/**
 * POST /api/social/twitter/engagement-refresh
 * Fetches ALL engagement data (comments + quotes) for all configured tweets.
 * Called when Bounties tab opens to prefetch all data.
 */
export async function POST(req: NextRequest) {
  try {
    const tweetIds = TWEETS_TO_VERIFY.map((t) => t.id);
    const results: Record<string, { comment: number; quote: number; error?: string }> = {};

    for (const tweetId of tweetIds) {
      try {
        const commentHandles = await fetchAllCommentUserHandles(tweetId);
        const quoteHandles = await fetchAllQuoteUserHandles(tweetId);
        setCachedHandles(tweetId, "comment", commentHandles);
        setCachedHandles(tweetId, "quote", quoteHandles);
        results[tweetId] = {
          comment: commentHandles.length,
          quote: quoteHandles.length,
        };
      } catch (error: any) {
        results[tweetId] = {
          comment: 0,
          quote: 0,
          error: error?.message || "Failed to fetch",
        };
      }
    }

    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (error: any) {
    console.error("[API] Error in engagement-refresh:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 }
    );
  }
}
