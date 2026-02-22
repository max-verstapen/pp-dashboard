"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Used when OAuth (e.g. X/Twitter) completes in a popup.
 * Notifies the opener so the main app can refresh the session, then focuses the opener and tries to close this window.
 */
function AuthCompleteContent() {
  const searchParams = useSearchParams();
  const close = searchParams.get("close");

  useEffect(() => {
    if (close !== "1") return;
    const isOpener = typeof window !== "undefined" && window.opener != null;
    if (isOpener) {
      window.opener.postMessage({ type: "auth-complete" }, window.location.origin);
      try {
        window.opener.focus();
      } catch {
        // ignore cross-origin or focus errors
      }
      window.close();
    }
  }, [close]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-zinc-200 font-medium">
          You’re all set.
        </p>
        <p className="text-zinc-400 text-sm">
          Return to the main app window — it should update automatically. You can close this tab or window if it doesn’t close by itself.
        </p>
      </div>
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
