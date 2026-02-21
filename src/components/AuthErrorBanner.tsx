"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Shows a dismissible banner when NextAuth redirects with ?error=...
 * Handles X (Twitter) auth issues: 429 rate limit and ERR_BLOCKED_BY_CLIENT (ad blocker).
 */
export default function AuthErrorBanner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const error = searchParams.get("error");
  const [dismissed, setDismissed] = useState(false);

  const clearErrorFromUrl = useCallback(() => {
    if (!error) return;
    const next = new URLSearchParams(searchParams);
    next.delete("error");
    next.delete("errorDescription");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [error, pathname, router, searchParams]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    clearErrorFromUrl();
  }, [clearErrorFromUrl]);

  // Reset dismissed when error param changes (e.g. new sign-in attempt)
  useEffect(() => {
    setDismissed(false);
  }, [error]);

  if (!error || dismissed) return null;

  const messages: Record<string, { title: string; body: string }> = {
    AccessDenied: {
      title: "Sign-in was denied or failed",
      body: "If you were connecting X (Twitter): Twitter may be rate limiting (429). Wait 15–60 minutes and try again. If you use an ad blocker, try disabling it for twitter.com and x.com — it can block Twitter’s login page.",
    },
    Configuration: {
      title: "Server configuration error",
      body: "Something is misconfigured on our side. Please try again later or contact support.",
    },
    Verification: {
      title: "Verification failed",
      body: "The sign-in link may have expired or already been used. Please try signing in again.",
    },
    Default: {
      title: "Sign-in failed",
      body: "Something went wrong. Please try again.",
    },
  };

  const { title, body } = messages[error as keyof typeof messages] ?? messages.Default;

  return (
    <div
      role="alert"
      className="mx-4 mt-4 flex flex-col gap-2 rounded border border-amber-500/60 bg-amber-950/80 p-4 text-left shadow lg:mx-6 lg:mt-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-200">{title}</p>
          <p className="mt-1 text-sm text-zinc-300">{body}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded px-2 py-1 text-sm font-medium text-amber-200 hover:bg-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-400"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
