import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { AutoRefresh, CopyButton, RefreshButton } from "@/components/status-live";
import { TRAN_ID_PATTERN } from "@/lib/payway";
import { reconcile } from "@/lib/settlement";
import type { Status } from "@/lib/status";
import type { TransactionRow } from "@/lib/transactions";
import { formatKhr, maskAccount } from "@/lib/transfer";

export const metadata = { title: "Transfer details" };

type Tone = "up" | "down" | "wait" | "muted";

const VIEW: Record<Status, { label: string; tone: Tone; message: string }> = {
  pending: { label: "Processing", tone: "wait", message: "Waiting for ABA PayWay to confirm the payment. This page updates automatically." },
  approved: { label: "Completed", tone: "up", message: "Payment confirmed by ABA PayWay and verified by our server." },
  declined: { label: "Declined", tone: "down", message: "ABA PayWay declined the payment. No money was taken." },
  cancelled: { label: "Cancelled", tone: "muted", message: "The payment wasn't completed. No money was taken." },
  refunded: { label: "Refunded", tone: "muted", message: "ABA PayWay reports this payment as refunded." },
  failed: { label: "Failed", tone: "down", message: "ABA PayWay has no record of this checkout, so no money was taken." },
  review: { label: "Under review", tone: "wait", message: "ABA PayWay's result doesn't match this transfer, so it is on hold until reviewed." },
};

const TEXT: Record<Tone, string> = { up: "text-up", down: "text-down", wait: "text-wait", muted: "text-muted" };

export default async function TransferPage({ params }: PageProps<"/transfer/[tranId]">) {
  await connection();
  const { tranId } = await params;
  if (!TRAN_ID_PATTERN.test(tranId)) notFound();
  const tx = await reconcile(tranId); // re-checks with PayWay while unresolved (rate-limited)
  if (!tx) notFound();

  const view = VIEW[tx.status];
  const message = tx.status === "pending" || tx.status === "approved" ? view.message : (tx.payway_message ?? view.message);

  return (
    <div className="mx-auto max-w-xl">
      <AutoRefresh active={tx.status === "pending"} />
      <h1 className="text-2xl font-semibold">Transfer details</h1>

      <section className="card mt-6 p-5 sm:p-6" aria-live="polite">
        <div className="flex flex-col items-center text-center">
          <StatusIcon tone={view.tone} />
          <p className={`mt-3 text-sm font-medium ${TEXT[view.tone]}`}>{view.label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {tx.amount.toLocaleString("en-US")} <span className="text-lg font-medium text-muted">KHR</span>
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted">{message}</p>
        </div>

        <Progress tx={tx} />

        <dl className="mt-6 divide-y divide-line border-t border-line text-sm">
          <Row label="Status">
            <span className={TEXT[view.tone]}>{view.label}</span>
          </Row>
          <Row label="Amount">{formatKhr(tx.amount)}</Row>
          <Row label="From">{tx.sender_name}</Row>
          <Row label="To account">
            <span className="tabular-nums">{maskAccount(tx.account_number)}</span>
          </Row>
          <Row label="Network">ABA PayWay</Row>
          <Row label="Transaction ID">
            <span className="flex items-center justify-end gap-1.5 tabular-nums">
              {tx.tran_id} <CopyButton value={tx.tran_id} />
            </span>
          </Row>
          {tx.apv && <Row label="Approval code">{tx.apv}</Row>}
          {tx.payment_type && <Row label="Paid with">{tx.payment_type}</Row>}
          {tx.bank_ref && <Row label="Bank reference">{tx.bank_ref}</Row>}
          {tx.payway_status && (
            <Row label="PayWay status">
              {tx.payway_status}
              {tx.payway_code ? ` (${tx.payway_code})` : ""}
            </Row>
          )}
          {tx.verified_by && (
            <Row label="Verified by">{tx.verified_by === "callback_signature" ? "Signed PayWay callback" : "PayWay status check"}</Row>
          )}
          <Row label="Created">{when(tx.created_at)}</Row>
          {tx.completed_at && <Row label="Completed">{when(tx.completed_at)}</Row>}
        </dl>

        <div className="mt-6 flex gap-3">
          {tx.status === "pending" && <RefreshButton />}
          <Link href="/" className="btn btn-primary flex-1">
            New transfer
          </Link>
        </div>
      </section>
    </div>
  );
}

type StepState = "done" | "current" | "failed" | "todo";

function Progress({ tx }: { tx: TransactionRow }) {
  const { status } = tx;
  const paid: StepState =
    status === "approved" || status === "refunded" || status === "review" ? "done" : status === "pending" ? "current" : "failed";
  const verified: StepState = status === "review" ? "failed" : tx.verified_by ? "done" : "todo";
  const steps: { label: string; state: StepState }[] = [
    { label: "Submitted", state: "done" },
    { label: paid === "failed" ? VIEW[status].label : "Paid", state: paid },
    { label: "Verified", state: verified },
  ];
  const dot: Record<StepState, string> = {
    done: "border-up bg-up",
    current: "border-wait bg-bg",
    failed: "border-down bg-down",
    todo: "border-line-strong bg-bg",
  };
  return (
    <ol className="mt-6 grid grid-cols-3">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex flex-col items-center">
          {i > 0 && (
            <span
              className={`absolute top-[5px] right-1/2 h-px w-full ${step.state === "done" ? "bg-up" : "bg-line"}`}
              aria-hidden
            />
          )}
          <span className={`relative size-3 rounded-full border-2 ${dot[step.state]}`} aria-hidden />
          <span className={`mt-2 text-xs ${step.state === "todo" ? "text-faint" : step.state === "failed" ? "text-down" : "text-fg"}`}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StatusIcon({ tone }: { tone: Tone }) {
  const style = { up: "bg-up/15 text-up", down: "bg-down/15 text-down", wait: "bg-wait/15 text-wait", muted: "bg-line text-muted" }[tone];
  const path = {
    up: "M6 12.5l4 4 8-9",
    down: "M8 8l8 8M16 8l-8 8",
    wait: "M12 7v5l3 2",
    muted: "M7 12h10",
  }[tone];
  return (
    <span className={`grid size-12 place-items-center rounded-full ${style}`}>
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {tone === "wait" && <circle cx="12" cy="12" r="8" />}
        <path d={path} />
      </svg>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Phnom_Penh",
  }).format(new Date(iso));
}
