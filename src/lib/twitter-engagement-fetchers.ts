/**
 * Shared functions for fetching Twitter engagement data.
 * Used by both verify-engagement and engagement-refresh endpoints.
 */

const TWITTER_API_BASE = "https://api.twitterapi.io";
const TWITTER_API_KEY = (process.env.TWITTER_API_KEY || process.env.TWITTERAPI_IO_API_KEY)?.trim();
const LOG_PREFIX = "[twitter-engagement-fetchers]";

function createTwitterApiHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/json" };
  if (TWITTER_API_KEY?.length) headers["X-API-Key"] = TWITTER_API_KEY;
  return headers;
}

function addApiKeyToUrl(url: URL): void {
  if (TWITTER_API_KEY?.length && !url.searchParams.has("api_key")) {
    url.searchParams.set("api_key", TWITTER_API_KEY);
  }
}

/** Normalize for consistency with cache lookup: strip @, trim, NFKC, lowercase. */
function normalizeHandle(handle: string): string {
  const s = handle.replace(/^@/, "").trim();
  return (s.normalize("NFKC") || s).toLowerCase();
}

function getAuthorHandle(author: unknown): string | null {
  if (!author || typeof author !== "object") return null;
  const a = author as Record<string, unknown>;
  const raw =
    (a.userName as string) ??
    (a.username as string) ??
    (a.screen_name as string) ??
    (a.screenName as string) ??
    "";
  const s = typeof raw === "string" ? raw.trim() : "";
  return s || null;
}

/** Max pages to fetch per tweet (API returns ~20 per page; 100 pages = up to 2000 items). */
const MAX_PAGES = 100;

/**
 * Fetch ALL users who commented (replied) on the tweet (all pages).
 *
 * Uses V1 endpoint (/twitter/tweet/replies) which:
 * - Orders by reply time desc (newest first), so we get latest replies.
 * - Supports optional sinceTime/untilTime (unix seconds) to fetch only replies
 *   from posted timestamp to now: pass sinceTimeSeconds = parent tweet's posted time.
 *
 * V2 (/twitter/tweet/replies/v2) has no time range and defaults to Relevance sort,
 * which can miss latest replies.
 */
export async function fetchAllCommentUserHandles(
  tweetId: string,
  options?: { sinceTimeSeconds?: number; untilTimeSeconds?: number }
): Promise<string[]> {
  if (!TWITTER_API_KEY?.length) {
    throw new Error("Twitter API key not configured.");
  }
  const allHandles: string[] = [];
  let cursor = "";
  const { sinceTimeSeconds, untilTimeSeconds } = options ?? {};
  console.log(
    `${LOG_PREFIX} fetchAllCommentUserHandles tweetId=${tweetId} sinceTime=${sinceTimeSeconds ?? "none"} untilTime=${untilTimeSeconds ?? "none"} (V1, reply time desc, max ${MAX_PAGES})`
  );

  for (let page = 0; page < MAX_PAGES; page++) {
    // V1: supports sinceTime/untilTime and orders by reply time desc (latest first)
    const url = new URL(`${TWITTER_API_BASE}/twitter/tweet/replies`);
    url.searchParams.set("tweetId", tweetId);
    if (cursor) url.searchParams.set("cursor", cursor);
    if (sinceTimeSeconds != null) url.searchParams.set("sinceTime", String(sinceTimeSeconds));
    if (untilTimeSeconds != null) url.searchParams.set("untilTime", String(untilTimeSeconds));
    addApiKeyToUrl(url);

    const res = await fetch(url.toString(), { method: "GET", headers: createTwitterApiHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch replies: ${res.status} - ${text.slice(0, 200)}`);
    }

    const data = await res.json().catch(() => ({}));
    const topKeys = data ? Object.keys(data) : [];
    console.log(`${LOG_PREFIX} replies response keys:`, topKeys.join(", "));

    const replies = (data?.tweets ?? data?.replies ?? data?.data?.tweets ?? data?.data?.replies) || [];
    console.log(`${LOG_PREFIX} replies page=${page + 1} items=${replies.length} has_next=${!!data?.has_next_page}`);

    if (replies.length > 0) {
      const first = replies[0] as Record<string, unknown>;
      console.log(`${LOG_PREFIX} replies first item keys:`, Object.keys(first).join(", "));
      const author = first?.author ?? first?.user;
      if (author && typeof author === "object") {
        const au = author as Record<string, unknown>;
        console.log(`${LOG_PREFIX} replies first author: userName=${au.userName} username=${au.username} screen_name=${au.screen_name} screenName=${au.screenName}`);
      }
    }

    for (const r of replies) {
      const author = (r as any)?.author ?? (r as any)?.user;
      const un = getAuthorHandle(author);
      if (un) allHandles.push(un);
    }
    if (replies.length > 0) {
      console.log(`${LOG_PREFIX} replies page=${page + 1} extracted handles:`, allHandles.slice(-replies.length));
    }

    const hasMore = !!data?.has_next_page && !!data?.next_cursor;
    if (!hasMore) {
      console.log(`${LOG_PREFIX} fetchAllCommentUserHandles no more pages after page ${page + 1}`);
      break;
    }
    if (replies.length === 0) {
      console.log(`${LOG_PREFIX} fetchAllCommentUserHandles empty page ${page + 1}, stopping`);
      break;
    }
    cursor = data.next_cursor || "";
  }

  console.log(`${LOG_PREFIX} fetchAllCommentUserHandles total users=${allHandles.length} handles=`, allHandles.slice(0, 50));
  return allHandles;
}

/**
 * Fetch ALL users who quoted the tweet (all pages).
 */
export async function fetchAllQuoteUserHandles(tweetId: string): Promise<string[]> {
  if (!TWITTER_API_KEY?.length) {
    throw new Error("Twitter API key not configured.");
  }
  const allHandles: string[] = [];
  let cursor = "";
  console.log(`${LOG_PREFIX} fetchAllQuoteUserHandles tweetId=${tweetId} (fetching all pages, max ${MAX_PAGES})`);

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${TWITTER_API_BASE}/twitter/tweet/quotes`);
    url.searchParams.set("tweetId", tweetId);
    if (cursor) url.searchParams.set("cursor", cursor);
    addApiKeyToUrl(url);

    const res = await fetch(url.toString(), { method: "GET", headers: createTwitterApiHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch quotes: ${res.status} - ${text.slice(0, 200)}`);
    }

    const data = await res.json().catch(() => ({}));
    const topKeys = data ? Object.keys(data) : [];
    console.log(`${LOG_PREFIX} quotes response keys:`, topKeys.join(", "));

    const quotes = (data?.tweets ?? data?.data?.tweets) || [];
    console.log(`${LOG_PREFIX} quotes page=${page + 1} items=${quotes.length} has_next=${!!data?.has_next_page}`);

    if (quotes.length > 0) {
      const first = quotes[0] as Record<string, unknown>;
      console.log(`${LOG_PREFIX} quotes first item keys:`, Object.keys(first).join(", "));
      const author = first?.author ?? first?.user;
      if (author && typeof author === "object") {
        const au = author as Record<string, unknown>;
        console.log(`${LOG_PREFIX} quotes first author: userName=${au.userName} username=${au.username} screen_name=${au.screen_name} screenName=${au.screenName}`);
      }
    }

    for (const quote of quotes) {
      const author = (quote as any)?.author ?? (quote as any)?.user;
      const un = getAuthorHandle(author);
      if (un) allHandles.push(un);
    }
    if (quotes.length > 0) {
      console.log(`${LOG_PREFIX} quotes page=${page + 1} extracted handles:`, allHandles.slice(-quotes.length));
    }

    const hasMore = !!data?.has_next_page && !!data?.next_cursor;
    if (!hasMore) {
      console.log(`${LOG_PREFIX} fetchAllQuoteUserHandles no more pages after page ${page + 1}`);
      break;
    }
    if (quotes.length === 0) {
      console.log(`${LOG_PREFIX} fetchAllQuoteUserHandles empty page ${page + 1}, stopping`);
      break;
    }
    cursor = data.next_cursor || "";
  }

  console.log(`${LOG_PREFIX} fetchAllQuoteUserHandles total users=${allHandles.length} handles=`, allHandles.slice(0, 50));
  return allHandles;
}
