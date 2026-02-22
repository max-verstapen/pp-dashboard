import NextAuth, { NextAuthOptions } from "next-auth";
import TwitterProvider from "next-auth/providers/twitter";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";
import { getSessionSnapshot, deleteSessionSnapshot } from "@/lib/session-snapshot-store";

// Validate environment variables
const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!discordClientId || !discordClientSecret) {
	console.error("[NextAuth] Missing Discord credentials. Please check your .env.local file.");
}

if (!googleClientId || !googleClientSecret) {
	console.warn("[NextAuth] Missing Google credentials. Google login will not work.");
}

export const authOptions: NextAuthOptions = {
	providers: [
		GoogleProvider({
			clientId: googleClientId as string,
			clientSecret: googleClientSecret as string,
			authorization: {
				params: {
					prompt: "select_account",
				},
			},
		}),
		// X (Twitter) OAuth: Users may see ERR_BLOCKED_BY_CLIENT (ads-api) from ad blockers,
		// or 429 Too Many Requests if Twitter rate-limits. Auth error banner on "/" explains both.
		TwitterProvider({
			clientId: process.env.TWITTER_CLIENT_ID as string,
			clientSecret: process.env.TWITTER_CLIENT_SECRET as string,
			version: "2.0",
			authorization: {
				params: {
					scope: "tweet.read users.read offline.access",
					prompt: "select_account",
				},
			},
		}),
		DiscordProvider({
			clientId: discordClientId?.trim() as string,
			clientSecret: discordClientSecret?.trim() as string,
			authorization: {
				params: {
					// We only need identity info; this returns both `username` and `global_name`.
					scope: "identify",
					prompt: "select_account",
				},
			},
		}),
	],
	callbacks: {
		async jwt({ token, account, profile }) {
			if (account) {
				const anyProfile = (profile || {}) as any;
				const provider = account.provider;
				const t = token as any;

				// When linking a second provider, NextAuth often passes a new JWT (new sub), so the
				// token may not contain the previous provider data. Merge from snapshot if we saved one
				// (keyed by profile email) so all linked accounts persist.
				const snapshotEmail = anyProfile?.email ?? t.email ?? null;
				const snapshot = snapshotEmail ? getSessionSnapshot(snapshotEmail) : null;
				if (snapshot) deleteSessionSnapshot(snapshotEmail as string);

				const existing = {
					googleEmail: t.googleEmail ?? snapshot?.googleEmail ?? null,
					twitterUsername: t.twitterUsername ?? snapshot?.twitterUsername ?? null,
					discordUsername: t.discordUsername ?? snapshot?.discordUsername ?? null,
				};

				// Set Google email only during Google sign-in
				if (provider === "google") {
					const email = anyProfile?.email ?? t.email ?? existing.googleEmail;
					if (email) t.googleEmail = email;
				} else if (existing.googleEmail) {
					t.googleEmail = existing.googleEmail;
				}

				// Set X (Twitter) username only during Twitter sign-in
				if (provider === "twitter") {
					const possibleTwitterUsername =
						anyProfile?.data?.username ??
						anyProfile?.username ??
						anyProfile?.screen_name ??
						(anyProfile?.user && anyProfile?.user?.screen_name) ??
						existing.twitterUsername;
					if (possibleTwitterUsername) t.twitterUsername = possibleTwitterUsername;
				} else if (existing.twitterUsername) {
					t.twitterUsername = existing.twitterUsername;
				}

				// Set Discord username only during Discord sign-in
				if (provider === "discord") {
					const rawDiscordUsername =
						anyProfile?.username ?? existing.discordUsername;
					const isHandleLike =
						typeof rawDiscordUsername === "string" &&
						/^[A-Za-z0-9._-]+$/.test(rawDiscordUsername.trim());
					if (isHandleLike) {
						t.discordUsername = rawDiscordUsername.trim();
					} else if (existing.discordUsername) {
						t.discordUsername = existing.discordUsername;
					}
					// If a stale session stored a Discord snowflake as twitterUsername, clear it.
					if (typeof t.twitterUsername === "string" && /^[0-9]{17,20}$/.test(t.twitterUsername)) {
						delete t.twitterUsername;
					}
				} else if (existing.discordUsername) {
					t.discordUsername = existing.discordUsername;
				}
			}
			return token;
		},
		async session({ session, token }) {
			(session as any).googleEmail = (token as any).googleEmail || null;
			(session as any).twitterUsername = (token as any).twitterUsername || null;
			(session as any).discordUsername = (token as any).discordUsername || null;
			if (session.user && token?.sub) {
				(session.user as any).id = token.sub;
			}
			return session;
		},
	},
	session: { strategy: "jwt" },
	pages: {
		signIn: "/",
		error: "/",
	},
	secret: process.env.NEXTAUTH_SECRET,
	debug: process.env.NODE_ENV !== "production",
};

const handler = NextAuth(authOptions);
export const runtime = "nodejs";
export { handler as GET, handler as POST };



