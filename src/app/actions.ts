"use server";

import { paywayConfig } from "@/lib/config";
import { log } from "@/lib/log";
import { buildPurchaseFields, newTranId, PURCHASE_PATH } from "@/lib/payway";
import { LIFETIME_MINUTES } from "@/lib/status";
import { insertTransaction } from "@/lib/transactions";
import { validateTransfer, type FieldErrors } from "@/lib/transfer";

export type StartTransferResult =
  | { ok: true; tranId: string; checkoutUrl: string; fields: Record<string, string> }
  | { ok: false; errors?: FieldErrors; message?: string };

/**
 * Validate -> record -> sign. The transaction row exists before any signed
 * request leaves the server. The browser only receives signed form fields;
 * the API key never leaves this function's process.
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
    callbackUrl: `${endpoints}/callback`,
    successUrl: `${endpoints}/return?tran_id=${tranId}`,
    cancelUrl: `${endpoints}/cancel?tran_id=${tranId}`,
    customFields: { account_number: accountNumber, sender_name: name },
    lifetimeMinutes: LIFETIME_MINUTES,
  });
  const checkoutUrl = cfg.baseUrl + PURCHASE_PATH;
  log("info", "payway.purchase.signed", {
    tran_id: tranId,
    amount: fields.amount,
    currency: fields.currency,
    account_number: accountNumber,
    checkout_url: checkoutUrl,
    signed_fields: Object.keys(fields),
  });
  return { ok: true, tranId, checkoutUrl, fields };
}
