import { NextRequest, NextResponse } from "next/server";
import { TWEETS_TO_VERIFY } from "@/config/tweetsToVerify";

const baseUrl =
  process.env.USER_API_URL ||
  process.env.USER_API_BASE_URL ||
  process.env.USERDB_API_URL;
const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;

/**
 * GET /api/social/twitter/engagement-verified-status?address=xxx
 * Returns which tweet engagements are already verified (quest completed) for the given address.
 * Used to show "✓ Commented" / "✓ Quoted" state on initial load.
 */
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address")?.trim();
    if (!address) {
      return NextResponse.json(
        { error: "address query param is required" },
        { status: 400 }
      );
    }

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { status: {} as Record<string, { comment: boolean; quote: boolean }> },
        { status: 200 }
      );
    }

    const status: Record<string, { comment: boolean; quote: boolean }> = {};

    await Promise.all(
      TWEETS_TO_VERIFY.map(async (tweet) => {
        const [commentCompleted, quoteCompleted] = await Promise.all([
          fetch(
            `${baseUrl.replace(/\/+$/, "")}/users/${encodeURIComponent(address)}/quests/${encodeURIComponent(tweet.commentQuestId)}/completion`,
            {
              method: "GET",
              headers: { "Content-Type": "application/json", "x-api-key": apiKey },
              cache: "no-store",
            }
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d?.completed === true)
            .catch(() => false),
          fetch(
            `${baseUrl.replace(/\/+$/, "")}/users/${encodeURIComponent(address)}/quests/${encodeURIComponent(tweet.quoteQuestId)}/completion`,
            {
              method: "GET",
              headers: { "Content-Type": "application/json", "x-api-key": apiKey },
              cache: "no-store",
            }
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d?.completed === true)
            .catch(() => false),
        ]);
        status[tweet.id] = { comment: commentCompleted, quote: quoteCompleted };
      })
    );

    return NextResponse.json({ status }, { status: 200 });
  } catch (error: any) {
    console.error("[API] Error in engagement-verified-status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 }
    );
  }
}
