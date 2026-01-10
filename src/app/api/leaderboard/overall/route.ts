import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
	const baseUrl = process.env.USER_API_BASE_URL || process.env.USERDB_API_URL;
	const apiKey = process.env.USER_API_KEY || process.env.USERDB_API_KEY;

	if (!baseUrl || !apiKey) {
		return NextResponse.json(
			{ error: "USER_API_BASE_URL or USER_API_KEY not configured" },
			{ status: 500 }
		);
	}

	const base = baseUrl.replace(/\/+$/, "");
	const searchParams = req.nextUrl.searchParams;
	const limit = searchParams.get("limit") || "20";

	try {
		// Try overall leaderboard
		const url1 = new URL(`${base}/leaderboard/overall`);
		url1.searchParams.set("limit", limit);
		console.log("=== API ROUTE: Trying overall leaderboard ===");
		console.log("URL:", url1.toString());
		const res = await fetch(url1.toString(), {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			cache: "no-store",
		});
		console.log("Overall leaderboard response status:", res.status);
		if (res.ok) {
			const data = await res.json().catch(() => ({}));
			console.log("Overall leaderboard data:", JSON.stringify(data, null, 2));
			return NextResponse.json(data, { status: res.status });
		}

		// Fallback to player-points leaderboard if overall isn't available
		const url2 = new URL(`${base}/player-points/leaderboard`);
		url2.searchParams.set("limit", limit);
		console.log("=== API ROUTE: Trying fallback player-points leaderboard ===");
		console.log("URL:", url2.toString());
		const res2 = await fetch(url2.toString(), {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			cache: "no-store",
		});
		console.log("Player-points leaderboard response status:", res2.status);
		const data2 = await res2.json().catch(() => ({}));
		console.log("Player-points leaderboard data:", JSON.stringify(data2, null, 2));
		return NextResponse.json(data2, { status: res2.status });
	} catch (err) {
		console.error("=== API ROUTE: Leaderboard fetch error ===");
		console.error("Error:", err);
		return NextResponse.json(
			{ error: "Failed to fetch leaderboard" },
			{ status: 502 }
		);
	}
}


