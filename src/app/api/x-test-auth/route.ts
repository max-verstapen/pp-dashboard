import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "x-test-auth";
const COOKIE_PATH = "/x-test";
const MAX_AGE = 60 * 60; // 1 hour

/**
 * GET: Check if the request has a valid x-test auth cookie (password already entered).
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const ok = token === "1";
  return NextResponse.json({ ok });
}

/**
 * POST: Validate password against X_ROUTE_PASS and set cookie if correct.
 * Body: { password: string }
 */
export async function POST(req: NextRequest) {
  const expected = process.env.X_ROUTE_PASS;
  if (!expected?.trim()) {
    return NextResponse.json({ ok: false, error: "Route not configured" }, { status: 503 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const password = typeof body?.password === "string" ? body.password.trim() : "";
  if (password !== expected) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: COOKIE_PATH,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
