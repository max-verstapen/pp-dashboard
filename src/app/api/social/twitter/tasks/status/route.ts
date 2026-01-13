import { NextRequest, NextResponse } from "next/server";

const baseUrl = process.env.USER_API_URL || process.env.USER_API_BASE_URL || process.env.USERDB_API_URL;
const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;

/**
 * GET /api/social/twitter/tasks/status?address={address}
 * Gets the completion status of Twitter social tasks for a user
 * Checks both verification status and completion status from backend
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "address query parameter is required" },
        { status: 400 }
      );
    }

    // Get user's X handle from the backend
    let xHandle: string | null = null;
    if (baseUrl && apiKey) {
      try {
        const userUrl = `${baseUrl.replace(/\/+$/, "")}/users/${encodeURIComponent(address)}/all`;
        const userRes = await fetch(userUrl, {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "x-api-key": apiKey,
          },
          cache: "no-store",
        });

        if (userRes.ok) {
          const userData = await userRes.json();
          xHandle = userData?.xHandle || userData?.['x-handle'] || userData?.raw?.all?.xHandle || null;
          console.log(`[API] Fetched user X handle for social tasks status`, {
            address: address.substring(0, 10) + "...",
            xHandle: xHandle ? xHandle.substring(0, 10) + "..." : null,
          });
        } else {
          const errorText = await userRes.text().catch(() => "");
          console.warn(`[API] Failed to fetch user data for social tasks status`, {
            status: userRes.status,
            statusText: userRes.statusText,
            url: userUrl,
            address: address.substring(0, 10) + "...",
            responseText: errorText.substring(0, 200),
          });
        }
      } catch (error: any) {
        console.error("[API] Exception fetching user data for social tasks status", {
          error: error?.message ?? String(error),
          stack: error?.stack,
          address: address.substring(0, 10) + "...",
        });
      }
    }

    // Get completed one-time tasks to check if social tasks are already completed
    let completedTaskIds: Set<string> = new Set();
    if (baseUrl && apiKey) {
      try {
        const completedUrl = `${baseUrl.replace(/\/+$/, "")}/player-points/${encodeURIComponent(address)}/completed/one`;
        console.log(`[API] GET /api/social/twitter/tasks/status - Fetching completed tasks`, {
          address: address.substring(0, 10) + "...",
          url: completedUrl,
          hasApiKey: !!apiKey,
        });

        const completedRes = await fetch(completedUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          cache: "no-store",
        });

        if (completedRes.ok) {
          const completedData = await completedRes.json();
          const completed = completedData?.completed || [];
          completedTaskIds = new Set(
            completed
              .map((c: any) => String(c?.taskId ?? "").trim())
              .filter((id: string) => !!id)
          );
          console.log(`[API] Successfully fetched completed tasks for social tasks status`, {
            address: address.substring(0, 10) + "...",
            taskCount: completed.length,
            taskIds: Array.from(completedTaskIds),
          });
        } else {
          const errorText = await completedRes.text().catch(() => "");
          let parsedError: any = null;
          try {
            parsedError = JSON.parse(errorText);
          } catch {
            // Not JSON
          }
          
          // Check if this is the DynamoDB filter expression error
          const errorMessage = parsedError?.error || errorText || "";
          const isDynamoDBFilterError = 
            typeof errorMessage === "string" && 
            errorMessage.includes("Filter Expression can only contain non-primary key attributes") &&
            errorMessage.includes("completionKey");
          
          if (isDynamoDBFilterError) {
            // Gracefully handle: just log warning and continue with empty completed tasks
            console.warn(`[API] Detected DynamoDB filter expression error in social tasks status, using empty completed tasks`, {
              address: address.substring(0, 10) + "...",
              url: completedUrl,
            });
            completedTaskIds = new Set(); // Already empty, but explicit
          } else {
            console.error(`[API] Failed to fetch completed tasks in social tasks status`, {
              status: completedRes.status,
              statusText: completedRes.statusText,
              url: completedUrl,
              address: address.substring(0, 10) + "...",
              responseText: errorText.substring(0, 500),
              parsedError: parsedError,
            });
          }
        }
      } catch (error: any) {
        console.error("[API] Exception fetching completed tasks in social tasks status", {
          error: error?.message ?? String(error),
          stack: error?.stack,
          address: address.substring(0, 10) + "...",
          errorName: error?.name,
        });
      }
    } else {
      console.warn("[API] Missing baseUrl or apiKey for social tasks status", {
        hasBaseUrl: !!baseUrl,
        hasApiKey: !!apiKey,
      });
    }

    const tasks = [
      {
        id: "FOLLOW_BAKELAND_X",
        title: "Follow @bakelandxyz on X",
        reward: 25,
        completed: completedTaskIds.has("FOLLOW_BAKELAND_X"),
        canVerify: !!xHandle, // Can verify if X handle is linked
        xHandle: xHandle,
      },
      {
        id: "POST_GAMEPLAY_X",
        title: "Post a Gameplay Clip on X",
        reward: 150,
        completed: completedTaskIds.has("POST_GAMEPLAY_X"),
        canVerify: false, // Not verifiable - completion status is checked from DB only
        xHandle: xHandle,
      },
    ];

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error: any) {
    console.error("[API] Error getting social task status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 }
    );
  }
}
