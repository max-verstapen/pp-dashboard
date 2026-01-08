import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const baseUrl =
		process.env.USER_API_URL ||
		process.env.USER_API_BASE_URL ||
		process.env.USERDB_API_URL;
	const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;

	if (!baseUrl || !apiKey) {
		return NextResponse.json(
			{ error: "USER_API_URL (or USER_API_BASE_URL) and USER_API_KEY required" },
			{ status: 500 }
		);
	}

	const body = await req.json().catch(() => null);
	if (!body?.userAddress || !body?.username) {
		return NextResponse.json(
			{ error: "userAddress and username are required" },
			{ status: 400 }
		);
	}

	const target = `${baseUrl.replace(/\/+$/, "")}/users`;
	try {
		const res = await fetch(target, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				accept: "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify(body),
			cache: "no-store",
		});
		const text = await res.text();
		let data: any;
		try {
			data = JSON.parse(text);
		} catch {
			data = { raw: text };
		}
		if (!res.ok) {
			// eslint-disable-next-line no-console
			console.error("[API] user create failed", {
				status: res.status,
				body: data,
				target,
			});
		}
		return NextResponse.json(data, { status: res.status });
	} catch {
		return NextResponse.json(
			{ error: "Failed to create user" },
			{ status: 502 }
		);
	}
}
