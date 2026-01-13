import { NextRequest, NextResponse } from "next/server";

const baseUrl = process.env.USER_API_URL || process.env.USER_API_BASE_URL || process.env.USERDB_API_URL;
const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;

/**
 * POST /api/social/twitter/tasks/claim
 * Verifies and claims a social task reward
 * This endpoint can be called from the backend to verify and claim tasks
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, xHandle, taskId } = body;

    if (!address) {
      return NextResponse.json(
        { error: "address is required" },
        { status: 400 }
      );
    }

    if (!xHandle) {
      return NextResponse.json(
        { error: "xHandle is required. User must connect their X account." },
        { status: 400 }
      );
    }

    if (!taskId || !["FOLLOW_BAKELAND_X", "POST_GAMEPLAY_X"].includes(taskId)) {
      return NextResponse.json(
        { error: "taskId must be 'FOLLOW_BAKELAND_X' or 'POST_GAMEPLAY_X'" },
        { status: 400 }
      );
    }

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: "Backend API not configured" },
        { status: 500 }
      );
    }

    // First, check if task is already completed using the checkTaskCompletion endpoint
    try {
      // Use GET /player-points/{address}/tasks/{taskId}?taskType=ONE_TIME to check if already completed
      const checkUrl = `${baseUrl.replace(/\/+$/, "")}/player-points/${encodeURIComponent(address)}/tasks/${encodeURIComponent(taskId)}?taskType=ONE_TIME`;
      console.log(`[API] Checking if task already completed`, {
        address: address.substring(0, 10) + "...",
        taskId,
        url: checkUrl,
      });

      const checkRes = await fetch(checkUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        cache: "no-store",
      });

      if (checkRes.ok) {
        const checkData = await checkRes.json();
        console.log(`[API] Task completion check result`, {
          address: address.substring(0, 10) + "...",
          taskId,
          completed: checkData.completed,
        });

        if (checkData.completed === true) {
          return NextResponse.json(
            { 
              verified: true,
              completed: true,
              message: "Task already completed",
              taskId,
            },
            { status: 200 }
          );
        }
      } else {
        const errorText = await checkRes.text().catch(() => "");
        console.warn(`[API] Task completion check failed (non-fatal)`, {
          status: checkRes.status,
          taskId,
          errorText: errorText.substring(0, 200),
        });
      }
    } catch (error: any) {
      console.error("[API] Exception checking completed tasks (non-fatal)", {
        error: error?.message ?? String(error),
        taskId,
      });
      // Continue with verification if check fails
    }

    // Verify the task using the verification endpoint
    const taskType = taskId === "FOLLOW_BAKELAND_X" ? "follow" : "gameplay_post";
    const verifyRes = await fetch(`${req.nextUrl.origin}/api/social/twitter/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ xHandle, taskType }),
    });

    if (!verifyRes.ok) {
      return NextResponse.json(
        { error: "Failed to verify task" },
        { status: 502 }
      );
    }

    const verifyData = await verifyRes.json();
    if (!verifyData.verified) {
      return NextResponse.json(
        { 
          verified: false, 
          error: verifyData.error || "Task verification failed. Please ensure you've completed the requirements." 
        },
        { status: 400 }
      );
    }

    // If verified, mark the task as completed in the backend
    // Using Lambda endpoint: POST /player-points/{address}/tasks/{taskId}/complete
    // The Lambda expects: taskId in path, metadata object in body
    
    const taskTitle = taskId === "FOLLOW_BAKELAND_X" ? "Follow @bakelandxyz on X" : "Post a Gameplay Clip on X";
    const taskReward = taskId === "FOLLOW_BAKELAND_X" ? 25 : 150;

    // Validate API key is present
    if (!apiKey || apiKey.trim().length === 0) {
      console.error(`[API] API key is missing or empty`, {
        hasBaseUrl: !!baseUrl,
        envVars: {
          USER_API_URL: !!process.env.USER_API_URL,
          USER_API_BASE_URL: !!process.env.USER_API_BASE_URL,
          USERDB_API_URL: !!process.env.USERDB_API_URL,
          USER_API_KEY: !!process.env.USER_API_KEY,
          USERDB_API_KEY: !!process.env.USERDB_API_KEY,
        },
      });
      return NextResponse.json({
        verified: true,
        completed: false,
        error: "Backend API key not configured. Please set USER_API_KEY or USERDB_API_KEY environment variable.",
      }, { status: 500 });
    }

    try {
      // Use the Lambda endpoint: POST /player-points/{address}/tasks/{taskId}/complete
      // The Lambda expects: taskId in path, metadata in body
      const completeUrl = `${baseUrl.replace(/\/+$/, "")}/player-points/${encodeURIComponent(address)}/tasks/${encodeURIComponent(taskId)}/complete`;
      console.log(`[API] Attempting to complete task`, {
        address: address.substring(0, 10) + "...",
        taskId,
        url: completeUrl,
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey.length,
      });

      // API Gateway expects x-api-key (lowercase) header - matching other routes in codebase
      const completeRes = await fetch(completeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          metadata: {
            title: taskTitle,
            verified: true,
            verifiedAt: new Date().toISOString(),
            xHandle: xHandle,
            taskType: "ONE_TIME",
            points: taskReward,
          },
        }),
        cache: "no-store",
      });

      if (completeRes.ok) {
        const completeData = await completeRes.json();
        console.log(`[API] Task completed successfully`, {
          address: address.substring(0, 10) + "...",
          taskId,
          response: completeData,
        });
        return NextResponse.json({
          verified: true,
          completed: true,
          message: completeData.message || "Task verified and completed successfully",
          taskId,
          pointsEarned: completeData.pointsEarned,
          totalPoints: completeData.totalPoints,
          data: completeData,
        });
      }

      // Request failed
      const errorText = await completeRes.text().catch(() => "");
      let parsedError: any = null;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        // Not JSON
      }

      console.error(`[API] Task completion failed`, {
        address: address.substring(0, 10) + "...",
        taskId,
        status: completeRes.status,
        statusText: completeRes.statusText,
        errorText: errorText.substring(0, 500),
        parsedError,
        url: completeUrl,
        method: "POST",
        hasApiKey: !!apiKey,
        apiKeyPrefix: apiKey ? `${apiKey.substring(0, 4)}...` : "none",
        note: completeRes.status === 403 && errorText.includes("Missing Authentication Token") 
          ? "This error usually means API Gateway doesn't recognize the route. Check: 1) Route is deployed, 2) Path matches exactly, 3) Method matches (POST), 4) API key is valid in API Gateway"
          : undefined,
      });

      return NextResponse.json({
        verified: true,
        completed: false,
        message: parsedError?.message || "Task verified but failed to complete",
        error: parsedError?.error || `HTTP ${completeRes.status}: ${errorText.substring(0, 200)}`,
        taskId,
      }, { status: completeRes.status });
    } catch (error: any) {
      console.error("[API] Exception completing task", {
        error: error?.message ?? String(error),
        stack: error?.stack,
        address: address.substring(0, 10) + "...",
        taskId,
        errorName: error?.name,
      });

      return NextResponse.json(
        { 
          verified: true,
          completed: false,
          error: "Task verified but exception occurred while completing. Check backend logs.",
          details: error?.message,
          taskId,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[API] Error claiming Twitter task:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 }
    );
  }
}
