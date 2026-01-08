import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
	const baseUrl = process.env.USER_API_BASE_URL || process.env.USERDB_API_URL;
	const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;

	if (!baseUrl || !apiKey) {
		return NextResponse.json(
			{ error: "USER_API_BASE_URL or USER_API_KEY not configured" },
			{ status: 500 }
		);
	}

	const base = baseUrl.replace(/\/+$/, "");

	try {
		// Try overall leaderboard
		const res = await fetch(`${base}/leaderboard/overall`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			cache: "no-store",
		});
		if (res.ok) {
			const data = await res.json().catch(() => ({}));
			return NextResponse.json(data, { status: res.status });
		}

		// Fallback to player-points leaderboard if overall isn't available
		const res2 = await fetch(`${base}/player-points/leaderboard`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			cache: "no-store",
		});
		const data2 = await res2.json().catch(() => ({}));
		return NextResponse.json(data2, { status: res2.status });
	} catch {
		return NextResponse.json(
			{ error: "Failed to fetch leaderboard" },
			{ status: 502 }
		);
	}
}


