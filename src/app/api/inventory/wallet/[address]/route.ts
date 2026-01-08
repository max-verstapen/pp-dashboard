import { NextRequest, NextResponse } from "next/server";

export async function GET(
	_req: NextRequest,
	context: { params: Promise<{ address: string }> }
) {
	const baseUrl =
		process.env.INVENTORY_API_URL;
	const apiKey =
		process.env.INVENTORY_API_KEY;
	const { address } = await context.params;

	if (!baseUrl || !apiKey) {
		return NextResponse.json(
			{ error: "INVENTORY_API_URL or INVENTORY_API_KEY not configured" },
			{ status: 500 }
		);
	}

	const target = `${baseUrl.replace(/\/+$/, "")}/wallet/${encodeURIComponent(address)}`;
	// eslint-disable-next-line no-console
	console.info("[API] inventory target", { target, apiKeyPresent: !!apiKey });
	try {
		const res = await fetch(target, {
			method: "GET",
			headers: {
				accept: "application/json",
				"x-api-key": apiKey,
			},
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
			console.error("[API] inventory wallet/[address] failed", {
				status: res.status,
				body: data,
				target,
			});
		}
		return NextResponse.json(data, { status: res.status });
	} catch {
		return NextResponse.json(
			{ error: "Failed to get in-app wallet" },
			{ status: 502 }
		);
	}
}


