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

	if (!address) {
		return NextResponse.json(
			{ error: "Missing path parameter: address" },
			{ status: 400 }
		);
	}

	const base = baseUrl.replace(/\/+$/, "");
	const target = `${base}/users/${encodeURIComponent(address)}/referred-users`;

	try {
		const res = await fetch(target, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			cache: "no-store",
		});

		const text = await res.text().catch(() => "");
		let json: any;
		try {
			json = text ? JSON.parse(text) : {};
		} catch {
			json = { raw: text };
		}

		if (!res.ok) {
			return NextResponse.json(json ?? { error: "Upstream error" }, { status: res.status });
		}

		const addresses: string[] = Array.isArray(json?.referredUserAddresses)
			? json.referredUserAddresses
			: [];

		const referredUsers = addresses.map((addr) => ({
			userAddress: addr as string,
		}));

		return NextResponse.json(
			{
				referredUsers,
				raw: json,
			},
			{ status: 200 }
		);
	} catch (e: any) {
		return NextResponse.json(
			{
				error: "Failed to fetch referred users",
				details: e?.message ?? String(e),
			},
			{ status: 502 }
		);
	}
}

