import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  const baseUrl = process.env.USER_API_BASE_URL;
  const apiKey = process.env.USER_API_KEY;
  const { address } = await context.params;

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "USER_API_BASE_URL or USER_API_KEY not configured" },
      { status: 500 }
    );
  }

  // Disallow localhost for upstream to ensure external API is used
  const isLocalhost =
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?/i.test(baseUrl);
  if (isLocalhost) {
    return NextResponse.json(
      { error: "USER_API_BASE_URL must not point to localhost" },
      { status: 500 }
    );
  }

  if (!address) {
    return NextResponse.json(
      { error: "Missing path parameter: address" },
      { status: 400 }
    );
  }

  const base = baseUrl.replace(/\/+$/, "");
  const target = `${base}/users/${encodeURIComponent(address)}`;
  try {
    // eslint-disable-next-line no-console
    console.info("[API] GET /api/user/[address] -> upstream", { target, hasKey: !!apiKey });
    const res = await fetch(target, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
      },
      cache: "no-store",
    });
    const text = await res.text().catch(() => "");
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error("[API] upstream /users/{address} error", { status: res.status, body: json, target });
      return NextResponse.json(json ?? { error: "Upstream error" }, { status: res.status });
    }
    // Normalize to ensure username field is present if available
    const username =
      json?.username ??
      json?.user?.username ??
      json?.profile?.username ??
      null;
    const body =
      username != null ? { username, ...json } : json;
    return NextResponse.json(body, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to fetch user", details: e?.message ?? String(e) },
      { status: 502 }
    );
  }
}


