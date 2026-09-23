import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="card p-6 text-center">
        <h1 className="text-lg font-semibold">Transfer not found</h1>
        <p className="mt-2 text-sm text-muted">Check the transaction ID and try again.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/track" className="btn btn-secondary flex-1">
            Track again
          </Link>
          <Link href="/" className="btn btn-primary flex-1">
            New transfer
          </Link>
        </div>
      </div>
    </div>
  );
}
