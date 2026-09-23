"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const POLL_MS = 4_000;
const GIVE_UP_MS = 20 * 60_000;

/** While a transfer is pending, re-render the page (which re-checks with PayWay) every few seconds. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) clearInterval(timer);
      else if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" className="btn btn-secondary flex-1" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? "Checking…" : "Refresh"}
    </button>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="grid size-6 place-items-center rounded text-muted hover:text-fg"
      aria-label={copied ? "Copied" : "Copy transaction ID"}
      title={copied ? "Copied" : "Copy"}
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        {copied ? <path d="M3 8.5l3 3 7-7" /> : <><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5" /></>}
      </svg>
    </button>
  );
}
