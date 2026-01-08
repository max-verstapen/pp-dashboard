import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	const baseUrl =
		process.env.INVENTORY_API_BASE_URL || process.env.INVENTORY_API_URL;
	const apiKey =
		process.env.INVENTORY_API_KEY || process.env.INVENTORY_SERVICE_API_KEY;

	if (!baseUrl || !apiKey) {
		return NextResponse.json(
			{ error: "INVENTORY_API_URL or INVENTORY_API_KEY not configured" },
			{ status: 500 }
		);
	}

	const body = await req.json().catch(() => null);
	const userAddress: string | undefined = body?.userAddress;
	if (!userAddress) {
		return NextResponse.json(
			{ error: "userAddress is required" },
			{ status: 400 }
		);
	}

	const target = `${baseUrl.replace(/\/+$/, "")}/wallet/connect`;
	// eslint-disable-next-line no-console
	console.info("[API] inventory target", { target, apiKeyPresent: !!apiKey });
	try {
		const res = await fetch(target, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				accept: "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({ userAddress }),
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
			// Server-side log
			// eslint-disable-next-line no-console
			console.error("[API] inventory wallet/connect failed", {
				status: res.status,
				body: data,
				target,
			});
		}
		return NextResponse.json(data, { status: res.status });
	} catch {
		return NextResponse.json(
			{ error: "Failed to connect in-app wallet" },
			{ status: 502 }
		);
	}
}


