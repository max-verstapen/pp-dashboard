import NextAuth, { NextAuthOptions } from "next-auth";
import TwitterProvider from "next-auth/providers/twitter";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";

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

				// Preserve existing session data - don't overwrite unless we're explicitly setting a new value
				// This allows linking multiple accounts without losing existing auth state

				// Set Google email during Google sign-in
				if (provider === "google") {
					const email = anyProfile?.email || token.email;
					if (email) {
						(token as any).googleEmail = email;
					}
					// Preserve existing Twitter and Discord handles
					// (they're already in token, just making it explicit)
				}

				// Only set the X (Twitter) username during a Twitter sign-in
				if (provider === "twitter") {
					const possibleTwitterUsername =
						// Prefer actual handle fields; never use display `name`
						anyProfile?.data?.username || // Twitter v2
						anyProfile?.username || // some adapters
						anyProfile?.screen_name || // legacy v1
						(anyProfile?.user && anyProfile?.user?.screen_name) ||
						(token as any).twitterUsername;
					if (possibleTwitterUsername) {
						(token as any).twitterUsername = possibleTwitterUsername;
					}
					// Preserve existing Google email and Discord handle
					// (they're already in token, just making it explicit)
				}

				// Only set the Discord username during a Discord sign-in
				if (provider === "discord") {
					// Discord returns both `username` (stable handle) and `global_name` (display name).
					// We must never store the display name; only accept handle-like strings.
					const rawDiscordUsername =
						anyProfile?.username ||
						(token as any).discordUsername;

					const isHandleLike =
						typeof rawDiscordUsername === "string" &&
						/^[A-Za-z0-9._-]+$/.test(rawDiscordUsername.trim());

					if (isHandleLike) {
						(token as any).discordUsername = rawDiscordUsername.trim();
					}

					// If a stale session mistakenly stored a Discord snowflake ID as the twitterUsername,
					// clear it here. X/Twitter handles are 1-15 chars, letters/digits/underscore.
					const maybeTwitter = (token as any).twitterUsername;
					if (typeof maybeTwitter === "string" && /^[0-9]{17,20}$/.test(maybeTwitter)) {
						delete (token as any).twitterUsername;
					}
					// Preserve existing Google email and Twitter handle
					// (they're already in token, just making it explicit)
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



