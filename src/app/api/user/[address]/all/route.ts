import { NextRequest, NextResponse } from "next/server";

export async function GET(
	_req: NextRequest,
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

	const base = baseUrl.replace(/\/+$/, "");
	const requestHeaders: Record<string, string> = {
		"Content-Type": "application/json",
		"x-api-key": apiKey,
	};

	try {
		// Try unified "all" endpoint first
		const targetAll = `${base}/users/${encodeURIComponent(address)}/all`;
		const resAll = await fetch(targetAll, {
			method: "GET",
			headers: requestHeaders,
			cache: "no-store",
		});
		let unified: any = {};
		if (resAll.ok) {
			unified = await resAll.json().catch(() => ({}));
		}

		// Normalize fields if present
		let username =
			unified?.username ||
			unified?.user?.username ||
			unified?.profile?.username ||
			null;
		let referralCount =
			unified?.referralCount ??
			unified?.referrals?.count ??
			null;
		let playerPoints =
			unified?.playerPoints ??
			unified?.totalPoints ??
			unified?.points?.total ??
			null;

		// If anything missing, fetch specific endpoints to fill in
		const fetches: Promise<any>[] = [];
		let userJson: any = null;
		let referralJson: any = null;
		let pointsJson: any = null;

		if (username == null) {
			const targetUser = `${base}/users/${encodeURIComponent(address)}`;
			fetches.push(
				fetch(targetUser, { headers: requestHeaders, cache: "no-store" })
					.then((r) => (r.ok ? r.json() : null))
					.then((j) => {
						userJson = j;
						username = username ?? j?.username ?? null;
					})
					.catch(() => null)
			);
		}
		if (referralCount == null) {
			const targetRef = `${base}/users/${encodeURIComponent(
				address
			)}/referral-count`;
			fetches.push(
				fetch(targetRef, { headers: requestHeaders, cache: "no-store" })
					.then((r) => (r.ok ? r.json() : null))
					.then((j) => {
						referralJson = j;
						referralCount = referralCount ?? j?.referralCount ?? null;
					})
					.catch(() => null)
			);
		}
		if (playerPoints == null) {
			const targetPts = `${base}/player-points/${encodeURIComponent(address)}`;
			fetches.push(
				fetch(targetPts, { headers: requestHeaders, cache: "no-store" })
					.then((r) => (r.ok ? r.json() : null))
					.then((j) => {
						pointsJson = j;
						playerPoints =
							playerPoints ?? j?.totalPoints ?? j?.playerPoints ?? null;
					})
					.catch(() => null)
			);
		}

		if (fetches.length > 0) {
			await Promise.all(fetches);
		}

		const response = {
			username,
			referralCount,
			playerPoints,
			raw: {
				all: unified,
				user: userJson,
				referrals: referralJson,
				points: pointsJson,
			},
		};
		return NextResponse.json(response, { status: 200 });
	} catch (e) {
		return NextResponse.json(
			{ error: "Failed to fetch user data" },
			{ status: 502 }
		);
	}
}


