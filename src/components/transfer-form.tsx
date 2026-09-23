"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type ReactNode } from "react";
import { startTransfer, type StartTransferResult } from "@/app/actions";
import { formatKhr, groupDigits, MAX_AMOUNT_KHR, MIN_AMOUNT_KHR, validateTransfer, type FieldErrors } from "@/lib/transfer";

type Handoff = Extract<StartTransferResult, { ok: true }>;

// The last transfer handed to PayWay in this tab, so a payer who comes back
// (Back button, or PayWay rejected the request) can find its status.
const LAST_TRANSFER = "tovmuk:last-transfer";
const noSubscription = () => () => {};
function readLastTransfer(): string | null {
  try {
    return sessionStorage.getItem(LAST_TRANSFER);
  } catch {
    return null;
  }
}

export function TransferForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handedOff = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [account, setAccount] = useState(""); // digits only
  const [amount, setAmount] = useState(""); // digits only
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [pending, startTransition] = useTransition();
  const lastTranId = useSyncExternalStore(noSubscription, readLastTransfer, () => null);
  const [lastDismissed, setLastDismissed] = useState(false);

  // Back button from PayWay restores this page from the bfcache: show that attempt's status instead.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted && handedOff.current) window.location.replace(`/transfer/${handedOff.current}`);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const amountKhr = amount ? Number(amount) : 0;
  const clearError = (field: keyof FieldErrors) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const check = validateTransfer({ name, accountNumber: account, amount });
    setErrors(check.ok ? {} : check.errors);
    if (check.ok) dialogRef.current?.showModal();
  }

  function confirm() {
    const data = new FormData(formRef.current!);
    startTransition(async () => {
      const result = await startTransfer(data).catch(() => null);
      if (!result?.ok) {
        dialogRef.current?.close();
        setErrors(result?.errors ?? {});
        setNotice(result?.message ?? (result ? "Check the highlighted fields." : "Couldn't reach the server. Nothing was charged. Try again."));
        return;
      }
      handedOff.current = result.tranId;
      try {
        sessionStorage.setItem(LAST_TRANSFER, result.tranId);
      } catch {
        // storage unavailable (private mode): the status page link is only a convenience
      }
      setHandoff(result);
      setTimeout(() => postToPayWay(result), 900); // long enough to see the transaction ID
    });
  }

  return (
    <>
      <form ref={formRef} onSubmit={review} noValidate className="card p-5 sm:p-6">
        {lastTranId && !lastDismissed && !handoff && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg bg-raised px-4 py-3 text-sm">
            <span className="min-w-0 truncate text-muted">
              Last transfer <span className="tabular-nums text-fg">{lastTranId}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Link href={`/transfer/${lastTranId}`} className="font-medium text-brand hover:text-brand-hover">
                View status
              </Link>
              <button
                type="button"
                onClick={() => setLastDismissed(true)}
                className="grid size-6 place-items-center rounded text-muted hover:text-fg"
                aria-label="Dismiss"
              >
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </span>
          </div>
        )}
        {notice && (
          <p role="alert" className="mb-5 rounded-lg border border-down/40 bg-down/10 px-4 py-3 text-sm text-down">
            {notice}
          </p>
        )}

        <Step n={1} label="Sender name" htmlFor="name" error={errors.name}>
          <input
            id="name"
            name="name"
            className="input"
            autoComplete="name"
            maxLength={100}
            placeholder="Full name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError("name");
            }}
            aria-invalid={Boolean(errors.name)}
          />
        </Step>

        <Step n={2} label="Destination account" htmlFor="accountNumber" error={errors.accountNumber} hint="Numbers only, 6–20 digits">
          <input
            id="accountNumber"
            name="accountNumber"
            className="input tabular-nums tracking-wide"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000 000 000"
            value={groupDigits(account)}
            onChange={(e) => {
              setAccount(e.target.value.replace(/\D/g, "").slice(0, 20));
              clearError("accountNumber");
            }}
            aria-invalid={Boolean(errors.accountNumber)}
          />
        </Step>

        <Step
          n={3}
          label="Amount"
          htmlFor="amount-display"
          error={errors.amount}
          hint={`Whole riel. Limit ${formatKhr(MIN_AMOUNT_KHR)} – ${formatKhr(MAX_AMOUNT_KHR)}`}
          last
        >
          <div className="input flex items-center gap-3" data-invalid={Boolean(errors.amount)}>
            <input
              id="amount-display"
              className="h-full min-w-0 flex-1 bg-transparent text-base tabular-nums outline-none placeholder:text-faint"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={amount ? Number(amount).toLocaleString("en-US") : ""}
              onChange={(e) => {
                setAmount(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9));
                clearError("amount");
              }}
              aria-invalid={Boolean(errors.amount)}
            />
            <span className="text-sm font-medium">KHR</span>
          </div>
          <input type="hidden" name="amount" value={amount} />
        </Step>

        <div className="mt-6 space-y-2 border-t border-line pt-5">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Network</span>
            <span>ABA PayWay</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">You pay</span>
            <span className="text-xl font-semibold tabular-nums">{formatKhr(amountKhr)}</span>
          </div>
          <button type="submit" className="btn btn-primary mt-4 w-full">
            Continue
          </button>
        </div>
      </form>

      <dialog
        ref={dialogRef}
        onCancel={(e) => (pending || handoff) && e.preventDefault()}
        aria-labelledby="confirm-title"
        className="card m-auto w-[min(calc(100%-2rem),26rem)] p-0 text-fg"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="confirm-title" className="font-medium">
            {handoff ? "Redirecting to ABA PayWay" : "Confirm transfer"}
          </h2>
          {!handoff && (
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              className="grid size-8 place-items-center rounded-md text-muted hover:bg-raised hover:text-fg"
              aria-label="Close"
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          )}
        </div>

        <div className="px-5 py-5">
          <p className="text-center text-sm text-muted">Amount</p>
          <p className="mt-1 text-center text-3xl font-semibold tabular-nums">
            {amountKhr.toLocaleString("en-US")} <span className="text-lg font-medium text-muted">KHR</span>
          </p>
          <dl className="mt-6 space-y-3 text-sm">
            <Row label="From">{name.trim()}</Row>
            <Row label="To account">
              <span className="tabular-nums">{groupDigits(account)}</span>
            </Row>
            <Row label="Network">ABA PayWay</Row>
            <Row label="Transaction ID">{handoff ? <span className="tabular-nums">{handoff.tranId}</span> : <span className="text-muted">Issued on confirm</span>}</Row>
          </dl>
          <p className="mt-5 rounded-lg bg-raised px-3 py-2.5 text-xs leading-5 text-muted">
            {handoff
              ? "Transfer recorded and signed. Opening ABA PayWay checkout."
              : "You'll authorize this payment on ABA PayWay. The transfer is recorded before you leave this page."}
          </p>
        </div>

        <div className="flex gap-3 border-t border-line px-5 py-4">
          {handoff ? (
            <button type="button" className="btn btn-primary w-full" onClick={() => postToPayWay(handoff)}>
              <Spinner /> Continue to ABA PayWay
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary flex-1" onClick={() => dialogRef.current?.close()} disabled={pending}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={confirm} disabled={pending}>
                {pending && <Spinner />}
                {pending ? "Processing" : "Confirm"}
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

/** Submits the server-signed fields to PayWay's hosted checkout (multipart/form-data, per the Purchase API). */
function postToPayWay({ checkoutUrl, fields }: Handoff) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkoutUrl;
  form.enctype = "multipart/form-data";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}

function Step(props: { n: number; label: string; htmlFor: string; error?: string; hint?: string; last?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-line text-xs font-medium">{props.n}</span>
        {!props.last && <span className="mt-2 w-px flex-1 bg-line" aria-hidden />}
      </div>
      <div className={`min-w-0 flex-1 ${props.last ? "" : "pb-7"}`}>
        <label htmlFor={props.htmlFor} className="block text-sm font-medium leading-6">
          {props.label}
        </label>
        <div className="mt-2">{props.children}</div>
        {(props.error || props.hint) && (
          <p className={`mt-2 text-xs ${props.error ? "text-down" : "text-muted"}`}>{props.error ?? props.hint}</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}
