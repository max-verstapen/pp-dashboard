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

    // If verified, try to mark the task as completed in the backend
    // NOTE: Based on the backend Lambda code you shared, there's no POST endpoint shown for completing tasks
    // We'll try common endpoint patterns - if none work, you'll need to implement the endpoint
    // Expected endpoint: POST /player-points/{address}/tasks/{taskId}/complete
    // OR POST /player-points/{address}/complete (with taskId, taskType=ONE_TIME, points, metadata in body)
    
    const taskTitle = taskId === "FOLLOW_BAKELAND_X" ? "Follow @bakelandxyz on X" : "Post a Gameplay Clip on X";
    const taskReward = taskId === "FOLLOW_BAKELAND_X" ? 25 : 150;

    try {
      // Try pattern 1: POST /player-points/{address}/tasks/{taskId}/complete
      const completeUrl1 = `${baseUrl.replace(/\/+$/, "")}/player-points/${encodeURIComponent(address)}/tasks/${encodeURIComponent(taskId)}/complete`;
      console.log(`[API] Attempting to complete task (pattern 1)`, {
        address: address.substring(0, 10) + "...",
        taskId,
        url: completeUrl1,
      });

      const completeRes1 = await fetch(completeUrl1, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify({
          taskId,
          taskType: "ONE_TIME",
          points: taskReward,
          metadata: {
            title: taskTitle,
            verified: true,
            verifiedAt: new Date().toISOString(),
            xHandle: xHandle,
          },
        }),
        cache: "no-store",
      });

      if (completeRes1.ok) {
        const completeData = await completeRes1.json();
        console.log(`[API] Task completed successfully (pattern 1)`, {
          address: address.substring(0, 10) + "...",
          taskId,
        });
        return NextResponse.json({
          verified: true,
          completed: true,
          message: "Task verified and completed successfully",
          taskId,
          data: completeData,
        });
      }

      // Pattern 1 failed, try pattern 2: POST /player-points/{address}/complete
      const errorText1 = await completeRes1.text().catch(() => "");
      console.warn(`[API] Pattern 1 failed (${completeRes1.status}), trying pattern 2...`, {
        address: address.substring(0, 10) + "...",
        taskId,
        status: completeRes1.status,
        errorText: errorText1.substring(0, 200),
      });

      const completeUrl2 = `${baseUrl.replace(/\/+$/, "")}/player-points/${encodeURIComponent(address)}/complete`;
      const completeRes2 = await fetch(completeUrl2, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify({
          taskId,
          taskType: "ONE_TIME",
          scope: "one",
          points: taskReward,
          metadata: {
            title: taskTitle,
            verified: true,
            verifiedAt: new Date().toISOString(),
            xHandle: xHandle,
          },
        }),
        cache: "no-store",
      });

      if (completeRes2.ok) {
        const completeData = await completeRes2.json();
        console.log(`[API] Task completed successfully (pattern 2)`, {
          address: address.substring(0, 10) + "...",
          taskId,
        });
        return NextResponse.json({
          verified: true,
          completed: true,
          message: "Task verified and completed successfully",
          taskId,
          data: completeData,
        });
      }

      // Both patterns failed
      const errorText2 = await completeRes2.text().catch(() => "");
      let parsedError2: any = null;
      try {
        parsedError2 = JSON.parse(errorText2);
      } catch {
        // Not JSON
      }

      console.error(`[API] All completion endpoint patterns failed`, {
        address: address.substring(0, 10) + "...",
        taskId,
        pattern1Status: completeRes1.status,
        pattern1Error: errorText1.substring(0, 200),
        pattern2Status: completeRes2.status,
        pattern2Error: errorText2.substring(0, 200),
        pattern2Parsed: parsedError2,
        message: "Backend needs to implement POST endpoint to complete tasks",
      });

      return NextResponse.json({
        verified: true,
        completed: false,
        message: "Task verified but completion endpoint not found. Please implement POST endpoint in backend.",
        taskId,
        error: `Pattern 1 (${completeRes1.status}): ${errorText1.substring(0, 100)}, Pattern 2 (${completeRes2.status}): ${errorText2.substring(0, 100)}`,
        note: "Expected endpoint: POST /player-points/{address}/tasks/{taskId}/complete or POST /player-points/{address}/complete",
      });
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
