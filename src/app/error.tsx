"use client";

import { buttonClass } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4 rounded-2xl border border-red-200 bg-white p-6 text-center">
      <p className="font-display text-2xl font-bold uppercase text-navy-900">Something went wrong</p>
      <p className="text-sm text-muted">{error.message || "Please try again."}</p>
      <button type="button" onClick={reset} className={buttonClass("primary", "md", true)}>
        Try again
      </button>
    </div>
  );
}
