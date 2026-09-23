// Ties PayWay's answers to our records. Every entry point (callback,
// return/cancel redirects, status page) funnels through `reconcile`, so the
// same verification rules apply no matter how we heard about a payment.
import "server-only";
import { paywayConfig } from "./config.ts";
import { log } from "./log.ts";
import { parseCallbackBody, TRAN_ID_PATTERN, verifyCallbackSignature } from "./payway.ts";
import { checkTransaction } from "./payway-client.ts";
import { decide, isSettled, type Verdict } from "./status.ts";
import { annotate, findTransaction, storeCallback, transition, type TransactionRow } from "./transactions.ts";

/** Page refreshes and polling ask PayWay at most this often per transaction. */
const CHECK_INTERVAL_MS = 5_000;

/**
 * Brings a transaction up to date with PayWay. Idempotent: repeating it (or
 * running it concurrently) never records a result twice.
 */
export async function reconcile(
  tranId: string,
  opts: { force?: boolean; signedCallback?: Record<string, unknown> } = {},
): Promise<TransactionRow | null> {
  const row = await findTransaction(tranId);
  if (!row || isSettled(row.status)) return row;
  if (!opts.force && row.last_checked_at && Date.now() - Date.parse(row.last_checked_at) < CHECK_INTERVAL_MS) return row;
  const cfg = paywayConfig();
  if (!cfg) return row;

  const check = await checkTransaction(cfg, tranId);
  const now = new Date().toISOString();
  const verdict = decide({
    amountKhr: row.amount,
    ageMs: Date.now() - Date.parse(row.created_at),
    check,
    signedCallback: opts.signedCallback,
  });

  if (!verdict || verdict.status === "pending" || verdict.status === row.status) {
    await annotate(tranId, { payway_status: verdict?.paywayStatus, payway_code: verdict?.paywayCode, last_checked_at: now });
    return findTransaction(tranId);
  }

  const updated = await transition(tranId, verdict.status, { ...paywayFields(verdict), last_checked_at: now, completed_at: now });
  if (updated) {
    log("info", "transaction.status_changed", {
      tran_id: tranId,
      from: row.status,
      to: verdict.status,
      verified_by: verdict.verifiedBy,
      payway_status: verdict.paywayStatus,
      message: verdict.message,
    });
    return updated;
  }
  log("info", "transaction.transition_skipped", { tran_id: tranId, wanted: verdict.status, reason: "changed concurrently" });
  return findTransaction(tranId);
}

/** The payer came back through cancel_url. PayWay still gets the final word. */
export async function cancelByPayer(tranId: string): Promise<void> {
  const row = await reconcile(tranId, { force: true });
  if (row?.status !== "pending") return;
  const updated = await transition(tranId, "cancelled", {
    payway_message: "Cancelled by the payer at ABA PayWay checkout.",
    completed_at: new Date().toISOString(),
  });
  if (updated) log("info", "transaction.status_changed", { tran_id: tranId, from: "pending", to: "cancelled", via: "cancel_url" });
}

export type CallbackReply = { status: number; body: Record<string, unknown> };

/**
 * PayWay's server-to-server notification. It is authoritative, but only once
 * authenticated: by its HMAC header, or by confirming with PayWay's own
 * status API. An unsigned or forged body can at most trigger that check.
 */
export async function processCallback(raw: string, headers: Headers): Promise<CallbackReply> {
  const cfg = paywayConfig();
  if (!cfg) {
    log("error", "payway.callback.not_configured");
    return reply(503, "not_configured");
  }

  const contentType = headers.get("content-type");
  const payload = parseCallbackBody(raw, contentType);
  if (!payload) {
    log("warn", "payway.callback.malformed", { content_type: contentType, bytes: raw.length, body: raw.slice(0, 300) });
    return reply(400, "malformed_body");
  }

  const tranId = String(payload.tran_id ?? "");
  const authenticity = verifyCallbackSignature(payload, headers.get("x-payway-hmac-sha512"), cfg.apiKey);
  log(authenticity === "invalid" ? "warn" : "info", "payway.callback.received", {
    tran_id: tranId,
    authenticity,
    content_type: contentType,
    user_agent: headers.get("user-agent"),
    payload,
  });
  if (!TRAN_ID_PATTERN.test(tranId)) return reply(400, "invalid_tran_id");

  const row = await findTransaction(tranId);
  if (!row) {
    log("warn", "payway.callback.unknown_transaction", { tran_id: tranId });
    return reply(404, "unknown_transaction");
  }

  if (authenticity === "invalid") {
    // Ignore the body entirely; PayWay's status API still decides the outcome.
    if (!isSettled(row.status)) await reconcile(tranId, { force: true });
    return reply(401, "invalid_signature");
  }

  await storeCallback(tranId, payload, authenticity);
  if (isSettled(row.status)) {
    log("info", "payway.callback.duplicate", { tran_id: tranId, status: row.status });
    return { status: 200, body: { ok: true, tran_id: tranId, status: row.status, duplicate: true } };
  }

  const updated = await reconcile(tranId, {
    force: true,
    signedCallback: authenticity === "valid" ? payload : undefined,
  });
  const status = updated?.status ?? row.status;
  // Not verifiable yet (status API unreachable, no signature): ask PayWay to retry.
  if (status === "pending") return reply(503, "verification_pending");
  return { status: 200, body: { ok: true, tran_id: tranId, status } };
}

function paywayFields(v: Verdict) {
  return {
    payway_status: v.paywayStatus,
    payway_code: v.paywayCode,
    payway_message: v.message,
    apv: v.apv,
    payment_type: v.paymentType,
    bank_ref: v.bankRef,
    verified_by: v.verifiedBy,
  };
}

function reply(status: number, error: string): CallbackReply {
  return { status, body: { ok: false, error } };
}
