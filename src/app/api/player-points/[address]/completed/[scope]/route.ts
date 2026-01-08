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
      return NextResponse.json(
        { error: `Upstream error ${res.status}`, details: text },
        { status: 502 }
      );
    }

    const json = await res.json();
    return NextResponse.json(json, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to fetch completed tasks", details: e?.message ?? String(e) },
      { status: 502 }
    );
  }
}

