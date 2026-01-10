import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ address: string; scope: string }> }
) {
  const baseUrl =
    process.env.USER_API_URL ||
    process.env.USER_API_BASE_URL ||
    process.env.USERDB_API_URL;
  const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "USER_API_BASE_URL or USER_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { address, scope } = await context.params;
  const base = baseUrl.replace(/\/+$/, "");
  const normalizedScope = String(scope ?? "").toLowerCase();

  if (!address) {
    return NextResponse.json(
      { error: "Missing path parameter: address" },
      { status: 400 }
    );
  }

  if (!normalizedScope || !["daily", "weekly", "week", "one", "one-time", "onetime"].includes(normalizedScope)) {
    return NextResponse.json(
      { error: "Missing/invalid scope. Use daily | weekly | one" },
      { status: 400 }
    );
  }

  // Map aliases to backend-supported values if necessary
  const upstreamScope =
    normalizedScope === "week" ? "weekly" :
    normalizedScope === "one-time" || normalizedScope === "onetime" ? "one" :
    normalizedScope;

  const url = `${base}/player-points/${encodeURIComponent(address)}/completed/${encodeURIComponent(upstreamScope)}`;

  try {
    console.log(`[API] GET /api/player-points/[address]/completed/[scope]`, {
      address: address.substring(0, 10) + "...",
      scope: upstreamScope,
      url: url,
      hasApiKey: !!apiKey,
      baseUrl: base,
    });

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let parsedError: any = null;
      try {
        parsedError = JSON.parse(text);
      } catch {
        // Not JSON, use text as-is
      }

      // Check if this is the DynamoDB filter expression error
      // This happens when the backend tries to use completionKey (a primary key) in a filter expression
      const errorMessage = parsedError?.error || text || "";
      const isDynamoDBFilterError = 
        typeof errorMessage === "string" && 
        errorMessage.includes("Filter Expression can only contain non-primary key attributes") &&
        errorMessage.includes("completionKey");

      if (isDynamoDBFilterError) {
        // Gracefully degrade: return empty completed array instead of error
        // This allows the frontend to continue working while the backend issue is fixed
        console.warn(`[API] Detected DynamoDB filter expression error, returning empty completed array`, {
          address: address.substring(0, 10) + "...",
          scope: upstreamScope,
          url: url,
          error: errorMessage,
        });
        return NextResponse.json({ completed: [] }, { status: 200 });
      }

      console.error(`[API] Upstream error for completed tasks`, {
        status: res.status,
        statusText: res.statusText,
        url: url,
        address: address.substring(0, 10) + "...",
        scope: upstreamScope,
        responseText: text.substring(0, 500), // First 500 chars
        parsedError: parsedError,
        headers: Object.fromEntries(res.headers.entries()),
      });

      return NextResponse.json(
        { 
          error: `Upstream error ${res.status}`, 
          details: parsedError || text,
          statusText: res.statusText,
          url: url,
        },
        { status: 502 }
      );
    }

    const json = await res.json();
    console.log(`[API] Successfully fetched completed tasks`, {
      address: address.substring(0, 10) + "...",
      scope: upstreamScope,
      taskCount: Array.isArray(json?.completed) ? json.completed.length : 0,
    });
    return NextResponse.json(json, { status: 200 });
  } catch (e: any) {
    console.error(`[API] Exception fetching completed tasks`, {
      error: e?.message ?? String(e),
      stack: e?.stack,
      url: url,
      address: address.substring(0, 10) + "...",
      scope: upstreamScope,
      errorName: e?.name,
      errorCause: e?.cause,
    });

    return NextResponse.json(
      { 
        error: "Failed to fetch completed tasks", 
        details: e?.message ?? String(e),
        errorType: e?.name,
        url: url,
      },
      { status: 502 }
    );
  }
}

