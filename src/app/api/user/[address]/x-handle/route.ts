import { NextRequest, NextResponse } from "next/server";

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

	const target = `${baseUrl.replace(/\/+$/, "")}/users/${encodeURIComponent(
		address
	)}/x-handle`;

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


