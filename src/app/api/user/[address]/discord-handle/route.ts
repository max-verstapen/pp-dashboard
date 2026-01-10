import { NextRequest, NextResponse } from "next/server";

export async function PUT(
	req: NextRequest,
	context: { params: Promise<{ address: string }> }
) {
	const baseUrl =
		process.env.USER_API_URL ||
		process.env.USER_API_BASE_URL ||
		process.env.USERDB_API_URL;
	const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;
	const { address } = await context.params;

	if (!baseUrl || !apiKey) {
		return NextResponse.json(
			{ error: "USER_API_BASE_URL or USER_API_KEY not configured" },
			{ status: 500 }
		);
	}

	const body = await req.json().catch(() => null);
	const discordHandle: string | undefined = body?.discordHandle;
	if (!discordHandle) {
		return NextResponse.json(
			{ error: "discordHandle is required" },
			{ status: 400 }
		);
	}

	// Check if discord-handle is already linked to another user
	try {
		const checkUrl = `${baseUrl.replace(/\/+$/, "")}/users/by-discord/${encodeURIComponent(discordHandle)}`;
		const checkRes = await fetch(checkUrl, {
			method: "GET",
			headers: {
				accept: "application/json",
				"x-api-key": apiKey,
			},
			cache: "no-store",
		});
		
		if (checkRes.ok) {
			const existingUser = await checkRes.json().catch(() => null);
			// If user exists and it's not the current user, prevent linking
			if (existingUser?.address && existingUser.address.toLowerCase() !== address.toLowerCase()) {
				return NextResponse.json(
					{ error: "This Discord handle is already linked to another account" },
					{ status: 409 }
				);
			}
		}
	} catch (error) {
		// If check fails, log but continue (don't block linking if lookup service is down)
		console.error("[API] Error checking existing discord-handle:", error);
	}

	const target = `${baseUrl.replace(/\/+$/, "")}/users/${encodeURIComponent(
		address
	)}/discord-handle`;

	try {
		const res = await fetch(target, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({ discordHandle }),
			cache: "no-store",
		});
		const text = await res.text();
		if (!res.ok) {
			return NextResponse.json(
				{ error: "Failed to update discordHandle", status: res.status, body: text },
				{ status: 502 }
			);
		}
		let json: any = null;
		try {
			json = JSON.parse(text);
		} catch {
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


