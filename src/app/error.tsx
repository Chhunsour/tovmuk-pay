"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl" role="alert">
      <div className="card p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          We couldn&apos;t load this page. If you completed a payment, it is still recorded once ABA PayWay confirms it.
        </p>
        <button type="button" onClick={reset} className="btn btn-primary mt-6 w-full">
          Try again
        </button>
      </div>
    </div>
  );
}
