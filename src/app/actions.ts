"use server";

import { paywayConfig } from "@/lib/config";
import { log } from "@/lib/log";
import { generateSandboxQr } from "@/lib/payway-client";
import { buildPurchaseFields, newTranId, PURCHASE_PATH } from "@/lib/payway";
import { LIFETIME_MINUTES } from "@/lib/status";
import { insertTransaction, transition } from "@/lib/transactions";
import { validateTransfer, type FieldErrors } from "@/lib/transfer";

export type StartTransferResult =
  | { ok: true; mode: "hosted"; tranId: string; checkoutUrl: string; fields: Record<string, string> }
  | { ok: true; mode: "qr"; tranId: string; qrImage: string; abaDeepLink?: string }
  | { ok: false; tranId?: string; errors?: FieldErrors; message?: string };

/**
 * Validate -> record -> sign. The transaction row exists before any signed
 * request leaves the server. The API key never leaves this function's process.
 */
export async function startTransfer(form: FormData): Promise<StartTransferResult> {
  const result = validateTransfer({
    name: form.get("name"),
    accountNumber: form.get("accountNumber"),
    amount: form.get("amount"),
  });
  if (!result.ok) {
    log("info", "transfer.rejected", { fields: Object.keys(result.errors) });
    return { ok: false, errors: result.errors };
  }

  const cfg = paywayConfig();
  if (!cfg) {
    log("error", "transfer.not_configured");
    return { ok: false, message: "Payments are temporarily unavailable, and nothing was charged. Please try again later." };
  }
  const sandboxQr = process.env.PAYWAY_SANDBOX_QR === "1";
  if (sandboxQr && cfg.baseUrl !== "https://checkout-sandbox.payway.com.kh") {
    return { ok: false, message: "Sandbox QR mode requires the ABA PayWay sandbox URL." };
  }

  const { name, accountNumber, amountKhr } = result.value;
  const tranId = newTranId();
  try {
    await insertTransaction({ tranId, name, accountNumber, amountKhr });
  } catch (error) {
    log("error", "transfer.persist_failed", { tran_id: tranId, error });
    return { ok: false, message: "We couldn't record this transfer, so it was not sent to ABA PayWay. Please try again." };
  }

  const endpoints = `${cfg.appBaseUrl}/api/payway`;
  const fields = buildPurchaseFields({
    merchantId: cfg.merchantId,
    apiKey: cfg.apiKey,
    tranId,
    amountKhr,
    callbackUrl: sandboxQr ? "" : `${endpoints}/callback`,
    successUrl: `${endpoints}/return?tran_id=${tranId}`,
    cancelUrl: `${endpoints}/cancel?tran_id=${tranId}`,
    customFields: { account_number: accountNumber, sender_name: name },
    lifetimeMinutes: LIFETIME_MINUTES,
  });
  const checkoutUrl = cfg.baseUrl + PURCHASE_PATH;
  if (!sandboxQr) log("info", "payway.purchase.signed", {
    tran_id: tranId, amount: fields.amount, currency: fields.currency,
    account_number: accountNumber, checkout_url: checkoutUrl, signed_fields: Object.keys(fields),
  });
  if (sandboxQr) {
    const qr = await generateSandboxQr(cfg, tranId, fields);
    if (qr.kind === "ready") return { ok: true, mode: "qr", tranId, qrImage: qr.qrImage, abaDeepLink: qr.abaDeepLink };
    if (qr.kind === "rejected") {
      try {
        await transition(tranId, "failed", { payway_code: qr.code, payway_message: qr.message, completed_at: new Date().toISOString() });
      } catch (error) {
        log("error", "transfer.reject_persist_failed", { tran_id: tranId, error });
      }
      return { ok: false, tranId, message: `ABA PayWay rejected this sandbox transfer: ${qr.message}` };
    }
    return { ok: false, tranId, message: "Could not confirm the sandbox checkout. Check this transfer's status before trying again." };
  }
  return { ok: true, mode: "hosted", tranId, checkoutUrl, fields };
}
