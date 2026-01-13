import { NextRequest, NextResponse } from "next/server";

const TWITTER_API_BASE_URL = "https://twitterapi.io/v2";
const BAKELAND_USERNAME = "bakelandxyz"; // @bakelandxyz without @
const TWITTER_API_KEY = (process.env.TWITTER_API_KEY || process.env.TWITTERAPI_IO_API_KEY)?.trim(); // twitterapi.io API key

// Helper function to create fetch options with authentication
function createTwitterApiHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Accept": "application/json",
  };
  
  // Try header-based auth first (common for twitterapi.io)
  if (TWITTER_API_KEY && TWITTER_API_KEY.length > 0) {
    headers["X-API-Key"] = TWITTER_API_KEY;
  } else {
    console.warn("[Twitter API] TWITTER_API_KEY is missing or empty");
  }
  
  return headers;
}

// Helper function to add API key to URL if needed as query parameter
function addApiKeyToUrl(url: string): string {
  if (TWITTER_API_KEY && !url.includes("api_key=")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}api_key=${encodeURIComponent(TWITTER_API_KEY)}`;
  }
  return url;
}

interface TwitterVerificationRequest {
  xHandle: string; // User's X/Twitter handle (without @)
  taskType: "follow" | "gameplay_post"; // Type of task to verify
}

/**
 * Verifies if a user follows @bakelandxyz
 * Uses the check_follow_relationship endpoint from twitterapi.io
 */
async function verifyFollow(xHandle: string): Promise<{ verified: boolean; error?: string }> {
  if (!TWITTER_API_KEY || TWITTER_API_KEY.length === 0) {
    console.error("[Twitter API] TWITTER_API_KEY is not set or empty in environment variables");
    return { verified: false, error: "Twitter API key not configured. Please set TWITTER_API_KEY environment variable." };
  }

  try {
    // Normalize handle (remove @ if present)
    const normalizedHandle = xHandle.replace(/^@/, "").trim();
    const normalizedBakeland = BAKELAND_USERNAME.replace(/^@/, "").trim();

    // Use the check_follow_relationship endpoint
    // https://api.twitterapi.io/twitter/user/check_follow_relationship
    const checkFollowUrl = new URL("https://api.twitterapi.io/twitter/user/check_follow_relationship");
    checkFollowUrl.searchParams.append("source_user_name", normalizedHandle);
    checkFollowUrl.searchParams.append("target_user_name", normalizedBakeland);
    
    const headers = createTwitterApiHeaders();
    const url = checkFollowUrl.toString();
    
    console.log(`[Twitter API] Checking follow relationship:`, {
      source_user_name: normalizedHandle,
      target_user_name: normalizedBakeland,
      url: url.replace(TWITTER_API_KEY || "", "[REDACTED]"),
      hasApiKey: !!TWITTER_API_KEY,
    });
    
    const followRes = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    const responseText = await followRes.text();
    console.log(`[Twitter API] Response status: ${followRes.status}`, {
      statusText: followRes.statusText,
      responseLength: responseText.length,
    });

    if (!followRes.ok) {
      console.error(`[Twitter API] Failed to check follow relationship:`, {
        status: followRes.status,
        statusText: followRes.statusText,
        response: responseText.substring(0, 500),
      });
      return { verified: false, error: `Failed to check follow relationship: ${followRes.status} - ${responseText.substring(0, 200)}` };
    }

    let followData;
    try {
      followData = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[Twitter API] Failed to parse response as JSON:`, {
        response: responseText.substring(0, 500),
        error: parseError,
      });
      return { verified: false, error: "Invalid response format from Twitter API" };
    }
    
    console.log(`[Twitter API] Parsed response:`, {
      status: followData.status,
      hasData: !!followData.data,
      following: followData?.data?.following,
      followed_by: followData?.data?.followed_by,
    });
    
    // Check if the request was successful
    if (followData.status === "error") {
      return { verified: false, error: followData.message || "Failed to verify follow relationship" };
    }

    // The 'following' field indicates if source_user_name follows target_user_name
    const isFollowing = followData?.data?.following === true;

    return { verified: isFollowing };
  } catch (error: any) {
    console.error("[Twitter API] Error verifying follow:", {
      error: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return { verified: false, error: error?.message || "Unknown error" };
  }
}

/**
 * Verifies if a user has posted about Bakeland gameplay
 * Checks for tweets mentioning @bakelandxyz with gameplay-related keywords
 */
async function verifyGameplayPost(xHandle: string): Promise<{ verified: boolean; error?: string; tweetUrl?: string }> {
  if (!TWITTER_API_KEY || TWITTER_API_KEY.length === 0) {
    console.error("[Twitter API] TWITTER_API_KEY is not set or empty");
    return { verified: false, error: "Twitter API key not configured. Please set TWITTER_API_KEY environment variable." };
  }

  try {
    // Normalize handle
    const normalizedHandle = xHandle.replace(/^@/, "").trim();

    // Get user info to get their ID
    let userUrl = `${TWITTER_API_BASE_URL}/user/by/username/${encodeURIComponent(normalizedHandle)}`;
    userUrl = addApiKeyToUrl(userUrl);
    
    const userRes = await fetch(userUrl, {
      method: "GET",
      headers: createTwitterApiHeaders(),
    });

    if (!userRes.ok) {
      const errorText = await userRes.text();
      console.error(`[Twitter API] Failed to get user info for ${normalizedHandle}:`, errorText);
      return { verified: false, error: `Failed to fetch user info: ${userRes.status}` };
    }

    const userData = await userRes.json();
    const userId = userData?.data?.id || userData?.id;

    if (!userId) {
      return { verified: false, error: "Could not find user ID" };
    }

    // Get user's recent tweets using Get User Last Tweets endpoint
    let tweetsUrl = `${TWITTER_API_BASE_URL}/user/${encodeURIComponent(userId)}/tweets?count=50`;
    tweetsUrl = addApiKeyToUrl(tweetsUrl);
    
    const tweetsRes = await fetch(tweetsUrl, {
      method: "GET",
      headers: createTwitterApiHeaders(),
    });

    if (!tweetsRes.ok) {
      const errorText = await tweetsRes.text();
      console.error(`[Twitter API] Failed to get user tweets:`, errorText);
      return { verified: false, error: `Failed to fetch tweets: ${tweetsRes.status}` };
    }

    const tweetsData = await tweetsRes.json();
    const tweets = tweetsData?.data || tweetsData?.tweets || [];

    // Search for tweets that mention @bakelandxyz and contain gameplay-related keywords
    const gameplayKeywords = [
      "bakeland",
      "gameplay",
      "game",
      "playing",
      "play",
      "bakker",
      "footage",
      "clip",
      "video",
      "stream",
    ];

    const normalizedBakeland = BAKELAND_USERNAME.toLowerCase();
    
    for (const tweet of tweets) {
      const text = (tweet.text || tweet.full_text || "").toLowerCase();
      const mentions = tweet.entities?.mentions || [];
      const hasMention = mentions.some((m: any) => 
        (m.username || m.screen_name || "").toLowerCase() === normalizedBakeland
      ) || text.includes(`@${normalizedBakeland}`);

      if (hasMention) {
        // Check if tweet contains gameplay-related keywords
        const hasGameplayKeyword = gameplayKeywords.some(keyword => text.includes(keyword));

        if (hasGameplayKeyword || tweet.entities?.media) {
          // Found a qualifying tweet
          const tweetId = tweet.id || tweet.id_str;
          const tweetUrl = tweetId ? `https://twitter.com/${normalizedHandle}/status/${tweetId}` : undefined;
          return { verified: true, tweetUrl };
        }
      }
    }

    return { verified: false };
  } catch (error: any) {
    console.error("[Twitter API] Error verifying gameplay post:", error);
    return { verified: false, error: error?.message || "Unknown error" };
  }
}

/**
 * POST /api/social/twitter/verify
 * Verifies Twitter social tasks
 */
export async function POST(req: NextRequest) {
  try {
    const body: TwitterVerificationRequest = await req.json();
    const { xHandle, taskType } = body;

    if (!xHandle) {
      return NextResponse.json(
        { error: "xHandle is required" },
        { status: 400 }
      );
    }

    if (!taskType || !["follow", "gameplay_post"].includes(taskType)) {
      return NextResponse.json(
        { error: "taskType must be 'follow' or 'gameplay_post'" },
        { status: 400 }
      );
    }

    if (!TWITTER_API_KEY || TWITTER_API_KEY.length === 0) {
      console.error("[Twitter API] TWITTER_API_KEY is not set or empty");
      return NextResponse.json(
        { error: "Twitter API key not configured. Please set TWITTER_API_KEY environment variable." },
        { status: 500 }
      );
    }

    let result;
    if (taskType === "follow") {
      result = await verifyFollow(xHandle);
    } else if (taskType === "gameplay_post") {
      result = await verifyGameplayPost(xHandle);
    } else {
      return NextResponse.json(
        { error: "Invalid taskType" },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[API] Error in Twitter verification:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 }
    );
  }
}
