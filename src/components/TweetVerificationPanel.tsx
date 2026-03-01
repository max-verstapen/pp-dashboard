"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TWEETS_TO_VERIFY, type TweetToVerify } from "../config/tweetsToVerify";

type VerifyAction = "comment" | "quote";

type CacheStatus = {
  lastRefreshedAt: number | null;
  nextRefreshAt: number | null;
  isValid: boolean;
};

type EngagementStatus = {
  status: Record<string, { comment: CacheStatus; quote: CacheStatus }>;
  tweetIds: string[];
};

type TweetVerificationPanelProps = {
  xHandle: string | null | undefined;
  /** Wallet address for crediting PP on verification */
  address?: string | null;
  tweets?: TweetToVerify[] | null;
  isLoading?: boolean;
};

function getTweetUrl(tweetId: string): string {
  return `https://twitter.com/i/status/${tweetId}`;
}

export default function TweetVerificationPanel({ xHandle, address, tweets: tweetsProp, isLoading = false }: TweetVerificationPanelProps) {
  const tweets = useMemo(() => {
    const source = tweetsProp != null && tweetsProp.length > 0 ? tweetsProp : TWEETS_TO_VERIFY;
    // Display last-to-first so newly added items appear on top.
    return [...source].reverse();
  }, [tweetsProp]);

  const [verified, setVerified] = useState<Record<string, Partial<Record<VerifyAction, boolean>>>>({});
  const [cacheStatus, setCacheStatus] = useState<EngagementStatus | null>(null);
  const [globalNextRefreshAt, setGlobalNextRefreshAt] = useState<number | null>(null);
  const [refreshingEngagement, setRefreshingEngagement] = useState(false);
  const hasRefreshedForHandle = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/social/twitter/engagement-status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCacheStatus(data);
        let earliest: number | null = null;
        for (const tweetId of Object.keys(data.status || {})) {
          const status = data.status[tweetId];
          const commentNext = status.comment.nextRefreshAt;
          const quoteNext = status.quote.nextRefreshAt;
          if (commentNext && (!earliest || commentNext < earliest)) earliest = commentNext;
          if (quoteNext && (!earliest || quoteNext < earliest)) earliest = quoteNext;
        }
        setGlobalNextRefreshAt(earliest);
      }
    } catch (e) {
      console.error("[TweetVerificationPanel] Failed to fetch cache status:", e);
    }
  }, []);

  // Fetch cache status on mount and periodically
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30 * 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Load initial verified state from quest completion when address is available
  useEffect(() => {
    if (!address?.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/social/twitter/engagement-verified-status?address=${encodeURIComponent(address)}`,
          { cache: "no-store" }
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          const s = data?.status || {};
          setVerified((prev) => {
            const next = { ...prev };
            for (const [tweetId, v] of Object.entries(s)) {
              const vv = v as { comment?: boolean; quote?: boolean };
              if (vv.comment || vv.quote) {
                next[tweetId] = { ...(next[tweetId] || {}), ...vv };
              }
            }
            return next;
          });
        }
      } catch (e) {
        console.error("[TweetVerificationPanel] Failed to load verified status:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // When xHandle is available, trigger engagement refresh once so data is loaded
  useEffect(() => {
    if (!xHandle?.trim() || hasRefreshedForHandle.current) return;
    hasRefreshedForHandle.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/social/twitter/engagement-refresh", { method: "POST", cache: "no-store" });
        if (res.ok && !cancelled) await fetchStatus();
      } catch (e) {
        console.error("[TweetVerificationPanel] engagement-refresh failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [xHandle, fetchStatus]);

  // Update global countdown timer every second
  const [timeUntilRefresh, setTimeUntilRefresh] = useState<number | null>(null);
  useEffect(() => {
    if (globalNextRefreshAt === null) {
      setTimeUntilRefresh(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      setTimeUntilRefresh(Math.max(0, globalNextRefreshAt! - now));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [globalNextRefreshAt]);

  function formatTimeRemaining(ms: number | null): string {
    if (ms === null || ms <= 0) return "Refreshing...";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  function normalizeHandle(handle: string): string {
    return handle.replace(/^@/, "").trim().toLowerCase();
  }

  const handleVerify = async (tweetId: string, action: VerifyAction) => {
    if (!xHandle?.trim()) {
      alert("Please connect your X account first to verify engagement.");
      return;
    }

    if (isLoading || refreshingEngagement) {
      alert("Engagement data is still loading. Please wait.");
      return;
    }

    const status = cacheStatus?.status?.[tweetId]?.[action];
    const cacheInvalid = !status?.isValid || !status?.nextRefreshAt;

    // If cache is empty/expired, trigger refresh first then verify
    if (cacheInvalid) {
      setRefreshingEngagement(true);
      try {
        const refreshRes = await fetch("/api/social/twitter/engagement-refresh", { method: "POST", cache: "no-store" });
        if (refreshRes.ok) await fetchStatus();
      } catch (e) {
        console.error("[TweetVerificationPanel] engagement-refresh failed:", e);
        setRefreshingEngagement(false);
        alert("Failed to load engagement data. Please try again.");
        return;
      }
      setRefreshingEngagement(false);
    }

    try {
      const res = await fetch("/api/social/twitter/verify-engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xHandle: xHandle.replace(/^@/, "").trim(),
          tweetId,
          action,
          address: address || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.verified) {
        setVerified((prev) => ({
          ...prev,
          [tweetId]: { ...(prev[tweetId] || {}), [action]: true },
        }));
        if (data.pointsEarned != null && data.pointsEarned > 0) {
          alert(`Verified! +${data.pointsEarned} PP credited.`);
        } else if (data.alreadyCompleted) {
          // Already verified before - no PP, but show as verified
        }
      } else {
        alert(data.error || "Verification failed. You may not have commented/quoted this post yet.");
      }
    } catch (e) {
      console.error("[TweetVerificationPanel] Verify error:", e);
      alert("Verification request failed. Please try again.");
    }
  };

  const isVerified = (tweetId: string, action: VerifyAction) => verified[tweetId]?.[action];

  return (
    <div className="tasks-section mt-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="tasks-section__title">Verify post engagement</div>
        {timeUntilRefresh !== null && (
          <span className="text-xs text-zinc-400">
            Refresh in <span className="text-[#cbf99f] font-mono">{formatTimeRemaining(timeUntilRefresh)}</span>
          </span>
        )}
      </div>
      <p className="task-notes mb-3">
        Confirm you have commented on or quoted the posts below using your connected X account.
      </p>
      <div className="tasks-list space-y-4">
        {tweets.map((tweet) => (
          <div key={tweet.id} className="task-row flex flex-col gap-2 p-3 rounded-lg bg-zinc-800/40 border border-zinc-700/50">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={getTweetUrl(tweet.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="task-title text-[#cbf99f] hover:underline"
              >
                {tweet.label || `Post ${tweet.id}`}
              </a>
              <a
                href={getTweetUrl(tweet.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zinc-400 underline hover:text-zinc-300"
              >
                Open on X →
              </a>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleVerify(tweet.id, "comment")}
                  disabled={isLoading || refreshingEngagement || isVerified(tweet.id, "comment")}
                  className="px-3 py-1.5 text-xs rounded font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed bg-sky-600/80 hover:bg-sky-600 text-white border border-sky-500/50"
                >
                  {isVerified(tweet.id, "comment") ? "✓ Commented (+100 PP)" : refreshingEngagement ? "Loading…" : "Verify Comment (+100 PP)"}
                </button>
                <button
                  type="button"
                  onClick={() => handleVerify(tweet.id, "quote")}
                  disabled={isLoading || refreshingEngagement || isVerified(tweet.id, "quote")}
                  className="px-3 py-1.5 text-xs rounded font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed bg-emerald-600/80 hover:bg-emerald-600 text-white border border-emerald-500/50"
                >
                  {isVerified(tweet.id, "quote") ? "✓ Quoted (+250 PP)" : refreshingEngagement ? "Loading…" : "Verify Quote (+250 PP)"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!xHandle?.trim() && (
        <p className="text-xs text-amber-400/90 mt-2">Connect your X account in My Stats to verify engagement.</p>
      )}
      {xHandle?.trim() && !address?.trim() && (
        <p className="text-xs text-amber-400/90 mt-2">Connect your wallet to receive PP (100 for comment, 250 for quote) on verification.</p>
      )}
    </div>
  );
}
