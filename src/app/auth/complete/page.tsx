"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Used when OAuth (e.g. Twitter) completes in a popup.
 * Closes the popup and notifies the opener so the main page can refresh the session.
 * Prevents full-page redirect loops that cause Twitter's auth page to reload and trigger rate limits.
 */
function AuthCompleteContent() {
  const searchParams = useSearchParams();
  const close = searchParams.get("close");

  useEffect(() => {
    if (close !== "1") return;
    const isOpener = typeof window !== "undefined" && window.opener != null;
    if (isOpener) {
      window.opener.postMessage({ type: "auth-complete" }, window.location.origin);
      window.close();
    }
  }, [close]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-center">
      <p className="text-zinc-400">
        You can close this window. If it does not close automatically, close it manually.
      </p>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AuthCompleteContent />
    </Suspense>
  );
}
