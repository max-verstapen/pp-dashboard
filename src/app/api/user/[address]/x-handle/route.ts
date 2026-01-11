import { NextRequest, NextResponse } from "next/server";

/**
 * Linking endpoint for X/Twitter handle
 * 
 * IMPORTANT: This endpoint is for LINKING social accounts to EXISTING users only.
 * It does NOT create new users. The user must already exist at the given address.
 * 
 * Note: The frontend should check if the X handle is already linked to another user
 * before calling this endpoint. This endpoint just performs the linking.
 * 
 * - If user doesn't exist at address → returns 404
 * - Otherwise → links the X handle to the user
 */
export async function PUT(
	req: NextRequest,
	context: { params: Promise<{ address: string }> }
) {
	const baseUrl =
		process.env.USER_API_BASE_URL;
	const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;
	const { address } = await context.params;

	if (!baseUrl || !apiKey) {
		return NextResponse.json(
			{ error: "USER_API_BASE_URL or USER_API_KEY not configured" },
			{ status: 500 }
		);
	}

	const body = await req.json().catch(() => null);
	const xHandle: string | undefined = body?.xHandle;
	if (!xHandle) {
		return NextResponse.json(
			{ error: "xHandle is required" },
			{ status: 400 }
		);
	}

	// First, verify that the user exists at the given address
	const base = baseUrl.replace(/\/+$/, "");
	try {
		const userCheckUrl = `${base}/users/${encodeURIComponent(address)}`;
		const userCheckRes = await fetch(userCheckUrl, {
			method: "GET",
			headers: {
				accept: "application/json",
				"x-api-key": apiKey,
			},
			cache: "no-store",
		});
		
		if (!userCheckRes.ok) {
			// User doesn't exist at this address - this endpoint is for linking only, not creating users
			return NextResponse.json(
				{ error: "User does not exist at this address. This endpoint is for linking social accounts to existing users only." },
				{ status: 404 }
			);
		}
	} catch (error) {
		console.error("[API] Error checking if user exists:", error);
		return NextResponse.json(
			{ error: "Failed to verify user exists" },
			{ status: 502 }
		);
	}

	const target = `${base}/users/${encodeURIComponent(address)}/x-handle`;

	try {
		const res = await fetch(target, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({ xHandle }),
			// Always forward immediately
			cache: "no-store",
		});
		const text = await res.text();
		if (!res.ok) {
			return NextResponse.json(
				{ error: "Failed to update xHandle", status: res.status, body: text },
				{ status: 502 }
			);
		}
		let json: any = null;
		try {
			json = JSON.parse(text);
		} catch {
			// non-json response is acceptable, echo text
			json = { ok: true, body: text };
		}
		return NextResponse.json(json, { status: 200 });
	} catch {
		return NextResponse.json(
			{ error: "Upstream request failed" },
			{ status: 502 }
		);
	}
}


