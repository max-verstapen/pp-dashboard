/**
 * In-memory store for session snapshots when linking a second OAuth provider.
 * NextAuth creates a new JWT (new sub) when you sign in with a different provider,
 * so the callback receives a fresh token without the previous provider data. We save
 * the current session snapshot before redirect and merge it in the JWT callback.
 */

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export type SessionSnapshot = {
	googleEmail: string | null;
	twitterUsername: string | null;
	discordUsername: string | null;
	ts: number;
};

const byEmail = new Map<string, SessionSnapshot>();

function prune() {
	const now = Date.now();
	for (const [key, v] of byEmail.entries()) {
		if (now - v.ts > TTL_MS) byEmail.delete(key);
	}
}

export function setSessionSnapshot(email: string, snapshot: Omit<SessionSnapshot, "ts">) {
	const normalized = email?.trim()?.toLowerCase();
	if (!normalized) return;
	byEmail.set(normalized, { ...snapshot, ts: Date.now() });
	prune();
}

export function getSessionSnapshot(email: string): SessionSnapshot | null {
	const normalized = email?.trim()?.toLowerCase();
	if (!normalized) return null;
	const v = byEmail.get(normalized);
	if (!v) return null;
	if (Date.now() - v.ts > TTL_MS) {
		byEmail.delete(normalized);
		return null;
	}
	return v;
}

export function deleteSessionSnapshot(email: string) {
	const normalized = email?.trim()?.toLowerCase();
	if (normalized) byEmail.delete(normalized);
}
