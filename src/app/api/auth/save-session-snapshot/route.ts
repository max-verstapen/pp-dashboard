import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { setSessionSnapshot } from "@/lib/session-snapshot-store";

/**
 * Saves the current session snapshot (googleEmail, twitterUsername, discordUsername)
 * keyed by the user's email so that when they complete OAuth with a second provider,
 * the JWT callback can merge the snapshot and preserve all linked accounts.
 * Call this before signIn("google" | "discord" | "twitter") when linking.
 */
export async function POST() {
	try {
		const session = await getServerSession(authOptions);
		const email =
			(session as any)?.googleEmail ??
			(session as any)?.user?.email ??
			null;
		if (!email || typeof email !== "string") {
			return NextResponse.json({ ok: false, reason: "no_email" }, { status: 200 });
		}
		setSessionSnapshot(email, {
			googleEmail: (session as any)?.googleEmail ?? null,
			twitterUsername: (session as any)?.twitterUsername ?? null,
			discordUsername: (session as any)?.discordUsername ?? null,
		});
		return NextResponse.json({ ok: true });
	} catch (e) {
		console.error("[save-session-snapshot]", e);
		return NextResponse.json({ ok: false }, { status: 500 });
	}
}
