"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import TweetVerificationPanel from "@/components/TweetVerificationPanel";

const STORAGE_KEY_MAIN = "pp_twitter_username";
const STORAGE_KEY_XTEST = "pp_x_test_handle";

function getXHandleFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY_MAIN);
  } catch {
    return null;
  }
}

function getManualXTestHandle(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY_XTEST);
  } catch {
    return null;
  }
}

function setManualXTestHandle(value: string) {
  try {
    if (typeof window !== "undefined") {
      if (value.trim()) window.localStorage.setItem(STORAGE_KEY_XTEST, value.trim());
      else window.localStorage.removeItem(STORAGE_KEY_XTEST);
    }
  } catch {
    // ignore
  }
}

export default function XTestPage() {
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cachedXHandle, setCachedXHandle] = useState<string | null>(null);
  const [manualXHandle, setManualXHandle] = useState<string>("");
  const hasRefetchedSession = useRef(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/x-test-auth", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (data?.ok) setUnlocked(true);
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // As soon as we're unlocked, hydrate from localStorage and refetch session once (avoid loop)
  useEffect(() => {
    if (!unlocked) return;
    const fromStorage = getXHandleFromStorage();
    if (fromStorage) setCachedXHandle((prev) => prev || fromStorage);
    const savedManual = getManualXTestHandle();
    if (savedManual) setManualXHandle(savedManual);
    if (!hasRefetchedSession.current) {
      hasRefetchedSession.current = true;
      updateSession();
    }
  }, [unlocked]); // Intentionally omit updateSession to avoid re-running when NextAuth updates

  // Keep cached handle in sync with session; persist session handle to localStorage so x-test route has it
  useEffect(() => {
    const fromSession = (session as any)?.twitterUsername ?? null;
    if (fromSession) {
      setCachedXHandle(fromSession);
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY_MAIN, fromSession);
      } catch {
        // ignore
      }
      return;
    }
    const fromStorage = getXHandleFromStorage();
    if (fromStorage) setCachedXHandle((prev) => prev || fromStorage);
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/x-test-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (data?.ok) {
        setUnlocked(true);
        setPassword("");
      } else {
        setError(data?.error ?? "Invalid password");
      }
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Prefer session → main app localStorage → manual x-test input (so you can always test with a handle)
  const xHandleFromAuth = (session as any)?.twitterUsername ?? cachedXHandle ?? null;
  const xHandle = xHandleFromAuth || (manualXHandle.trim() ? manualXHandle.trim() : null) || null;
  const sessionLoading = sessionStatus === "loading";

  const handleManualXChange = (value: string) => {
    setManualXHandle(value);
    setManualXTestHandle(value);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1f0d]">
        <p className="text-zinc-400">Checking access...</p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d1f0d] p-4">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-zinc-600/50 bg-zinc-900/80 p-6 shadow-xl"
        >
          <h1 className="text-lg font-semibold text-zinc-200 mb-2">X Test Route</h1>
          <p className="text-sm text-zinc-400 mb-4">Enter the route password to continue.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 rounded border border-zinc-600 bg-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-4"
            autoFocus
            autoComplete="current-password"
          />
          {error && (
            <p className="text-sm text-red-400 mb-4" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || !password.trim()}
            className="w-full py-2 rounded font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Checking…" : "Continue"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1f0d] p-4">
      <div className="w-full max-w-2xl">
        <div className="rounded-lg border border-zinc-600/50 bg-zinc-900/80 p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-zinc-200 mb-4">X Comment & Quote Verification</h1>
          {sessionLoading && !xHandleFromAuth && !manualXHandle.trim() ? (
            <p className="text-sm text-zinc-400">Loading session…</p>
          ) : (
            <>
              {!xHandleFromAuth && (
                <div className="mb-4">
                  <label htmlFor="x-test-handle" className="block text-sm font-medium text-zinc-400 mb-1">
                    X handle (for testing)
                  </label>
                  <input
                    id="x-test-handle"
                    type="text"
                    value={manualXHandle}
                    onChange={(e) => handleManualXChange(e.target.value)}
                    placeholder="e.g. 0xRushya or @0xRushya"
                    className="w-full px-3 py-2 rounded border border-zinc-600 bg-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-sm"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Enter your X username if it isn’t loaded from the app. Saved for this route.
                  </p>
                </div>
              )}
              <TweetVerificationPanel xHandle={xHandle || undefined} isLoading={false} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
