// Transaction lifecycle. Pure decision logic: given what PayWay told us,
// which status should a transaction have? Persistence applies the result.
import type { CheckResult } from "./payway.ts";

export type Status =
  | "pending" //   recorded, waiting for PayWay
  | "approved" //  PayWay confirmed the payment and the amount matches
  | "declined" //  PayWay declined the payment
  | "cancelled" // payer cancelled, or the payment window expired
  | "refunded" //  PayWay reports a refund
  | "failed" //    PayWay has no record: the checkout request was never accepted
  | "review"; //   PayWay's answer contradicts our record; needs a human

export type VerifiedBy = "check_transaction" | "callback_signature";

/**
 * Which current statuses may move to a given status. Updates are applied as
 * `UPDATE ... WHERE status IN (allowedFrom(next))`, which makes every
 * transition atomic and every repeat (duplicate callback, refresh) a no-op.
 * A verified PayWay result may still override the soft local outcomes
 * "cancelled" and "failed", because the callback is the authoritative result.
 */
const ALLOWED_FROM: Record<Status, readonly Status[]> = {
  pending: [],
  approved: ["pending", "cancelled", "failed"],
  declined: ["pending", "cancelled", "failed"],
  review: ["pending", "cancelled", "failed"],
  refunded: ["pending", "cancelled", "failed", "approved"],
  cancelled: ["pending"],
  failed: ["pending"],
};

export function allowedFrom(next: Status): readonly Status[] {
  return ALLOWED_FROM[next];
}

/** Statuses no PayWay answer can change any more (a refund aside). */
export function isSettled(status: Status): boolean {
  return status === "approved" || status === "declined" || status === "refunded" || status === "review";
}

export type Verdict = {
  status: Status;
  verifiedBy?: VerifiedBy;
  paywayStatus?: string;
  paywayCode?: string;
  message?: string;
  apv?: string;
  paymentType?: string;
  bankRef?: string;
};

const PAYWAY_STATUS: Record<string, Status> = {
  APPROVED: "approved",
  DECLINED: "declined",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  PENDING: "pending",
};

/** How long PayWay may take to register a checkout before "not found" means "rejected". */
export const NOT_FOUND_GRACE_MS = 2 * 60_000;
/** Checkout lifetime we request from PayWay (minutes), plus a grace period before we call it expired. */
export const LIFETIME_MINUTES = 15;
const EXPIRED_AFTER_MS = (LIFETIME_MINUTES + 2) * 60_000;

export type DecideInput = {
  /** Amount we recorded and signed, in KHR. */
  amountKhr: number;
  /** Time since we recorded the transaction. */
  ageMs: number;
  /** Answer from PayWay's Check transaction API. */
  check: CheckResult;
  /** Callback payload, only if its X-PAYWAY-HMAC-SHA512 signature verified. */
  signedCallback?: Record<string, unknown>;
};

/**
 * Combines the two independent PayWay sources into one verdict.
 * The Check transaction API has the final word when it has a final answer;
 * a signed callback settles the transaction when the API cannot (yet); and a
 * contradiction between them is escalated to review instead of guessed.
 * Returns null when there is nothing new to record.
 */
export function decide({ amountKhr, ageMs, check, signedCallback }: DecideInput): Verdict | null {
  const fromCheck = check.kind === "found" ? verdictFromCheck(check, amountKhr) : null;
  const fromCallback = signedCallback ? verdictFromCallback(signedCallback, amountKhr) : null;

  if (fromCheck?.status === "review") return fromCheck;
  if (fromCallback?.status === "review") return fromCallback;
  if (fromCallback?.status === "approved" && (fromCheck?.status === "declined" || fromCheck?.status === "cancelled")) {
    return {
      ...fromCheck,
      status: "review",
      message: `The signed callback reports a completed payment, but the PayWay status check says ${fromCheck.paywayStatus}.`,
    };
  }
  if (fromCheck && isFinal(fromCheck)) {
    return { ...fromCheck, paymentType: fromCallback?.paymentType, bankRef: fromCallback?.bankRef };
  }
  if (fromCallback && isFinal(fromCallback)) return fromCallback;

  if (fromCheck) {
    return ageMs > EXPIRED_AFTER_MS
      ? { ...fromCheck, status: "cancelled", message: "The payment window expired before the payment was completed." }
      : fromCheck; // still pending
  }
  if (check.kind === "not_found" && ageMs > NOT_FOUND_GRACE_MS) {
    return {
      status: "failed",
      verifiedBy: "check_transaction",
      paywayCode: check.code,
      message: "ABA PayWay has no record of this checkout, so it was not accepted and no payment was taken.",
    };
  }
  return null;
}

function verdictFromCheck(check: Extract<CheckResult, { kind: "found" }>, amountKhr: number): Verdict {
  const verdict: Verdict = {
    status: PAYWAY_STATUS[check.paymentStatus] ?? "pending", // PRE-AUTH or unknown: never treated as paid
    verifiedBy: "check_transaction",
    paywayStatus: check.paymentStatus,
    paywayCode: check.paymentStatusCode,
    apv: check.apv,
  };
  if (verdict.status === "approved" && check.originalAmount !== amountKhr) {
    return { ...verdict, status: "review", message: `PayWay reports ${check.originalAmount ?? "no"} KHR; we signed ${amountKhr} KHR.` };
  }
  return verdict;
}

function verdictFromCallback(payload: Record<string, unknown>, amountKhr: number): Verdict {
  const code = String(payload.status ?? "");
  const verdict: Verdict = {
    status: "pending",
    verifiedBy: "callback_signature",
    paywayCode: code,
    apv: optional(payload.apv),
    paymentType: optional(payload.payment_type),
    bankRef: optional(payload.bank_ref),
  };
  // The docs define status "0" as a completed payment; anything else waits for the status API.
  if (code !== "0") return verdict;
  const amount = Number(payload.original_amount);
  const currency = String(payload.original_currency ?? "").toUpperCase();
  if (amount !== amountKhr || currency !== "KHR") {
    return { ...verdict, status: "review", paywayStatus: "APPROVED", message: `Signed callback reports ${payload.original_amount} ${currency || "?"}; we signed ${amountKhr} KHR.` };
  }
  return { ...verdict, status: "approved", paywayStatus: "APPROVED" };
}

function isFinal(verdict: Verdict): boolean {
  return verdict.status !== "pending";
}

function optional(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
