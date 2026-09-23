// ABA PayWay protocol helpers: request signing, callback verification and
// response parsing. Pure functions only: no environment access, no I/O.
//
// Source of truth: https://developer.payway.com.kh
//   - Purchase API ................ purchase-14530820e0
//   - Check transaction API ....... check-transaction-14530826e0
//   - Callback signature .......... ecommerce-checkout-3158159f0 ("Verify Callback Signature")
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const PURCHASE_PATH = "/api/payment-gateway/v1/payments/purchase";
export const CHECK_TRANSACTION_PATH =
  "/api/payment-gateway/v1/payments/check-transaction-2";

/** Our tran_id format: uppercase alphanumerics, PayWay allows at most 20 chars. */
export const TRAN_ID_PATTERN = /^[A-Z0-9]{1,20}$/;

/**
 * The Purchase hash is computed over these fields, concatenated in exactly
 * this order (copied from the Purchase API docs). A field we don't send
 * contributes an empty string.
 */
const PURCHASE_HASH_ORDER = [
  "req_time",
  "merchant_id",
  "tran_id",
  "amount",
  "items",
  "shipping",
  "firstname",
  "lastname",
  "email",
  "phone",
  "type",
  "payment_option",
  "return_url",
  "cancel_url",
  "continue_success_url",
  "return_deeplink",
  "currency",
  "custom_fields",
  "return_params",
  "payout",
  "lifetime",
  "additional_params",
  "google_pay_token",
  "skip_success_page",
] as const;

export type PurchaseField = (typeof PURCHASE_HASH_ORDER)[number];

/** base64( HMAC-SHA512(data, key) ): PHP's base64_encode(hash_hmac('sha512', $data, $key, true)). */
export function hmacSha512Base64(data: string, key: string): string {
  return createHmac("sha512", key).update(data, "utf8").digest("base64");
}

/** req_time: current time in UTC as YYYYMMDDHHmmss. */
export function reqTime(now: Date = new Date()): string {
  return now.toISOString().replace(/\D/g, "").slice(0, 14);
}

/** 20 chars (PayWay's maximum): "TP" + UTC yymmddHHmmss + 6 CSPRNG base-36 chars. */
export function newTranId(now: Date = new Date()): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += alphabet[randomInt(alphabet.length)];
  return `TP${reqTime(now).slice(2)}${suffix}`;
}

export function purchaseHash(
  fields: Partial<Record<PurchaseField, string>>,
  apiKey: string,
): string {
  const b4hash = PURCHASE_HASH_ORDER.map((name) => fields[name] ?? "").join("");
  return hmacSha512Base64(b4hash, apiKey);
}

export type PurchaseInput = {
  merchantId: string;
  apiKey: string;
  tranId: string;
  amountKhr: number;
  /** PayWay's `return_url`: the server-to-server callback (sent Base64-encoded). */
  callbackUrl: string;
  /** `continue_success_url`: where the payer's browser goes after paying. */
  successUrl: string;
  /** `cancel_url`: where the payer's browser goes after cancelling or closing checkout. */
  cancelUrl: string;
  /** Shown in PayWay's transaction list, details and export (sent as Base64 JSON). */
  customFields: Record<string, string>;
  lifetimeMinutes: number;
  now?: Date;
};

/**
 * Builds the signed form fields for the browser to POST to PayWay's hosted
 * checkout. Everything the browser receives is covered by `hash`, so changing
 * any value (for example the amount) makes PayWay reject the request.
 */
export function buildPurchaseFields(input: PurchaseInput): Record<string, string> {
  if (!Number.isSafeInteger(input.amountKhr) || input.amountKhr < 1) {
    throw new RangeError("KHR amount must be a positive whole number");
  }
  const fields = {
    req_time: reqTime(input.now),
    merchant_id: input.merchantId,
    tran_id: input.tranId,
    amount: String(input.amountKhr), // KHR has no minor unit: "2000", never "2000.00" (PayWay code 46)
    currency: "KHR",
    return_url: base64(input.callbackUrl),
    cancel_url: input.cancelUrl,
    continue_success_url: input.successUrl,
    custom_fields: base64(JSON.stringify(input.customFields)),
    lifetime: String(input.lifetimeMinutes),
    skip_success_page: "1", // go straight to our page, which verifies with PayWay
  } satisfies Partial<Record<PurchaseField, string>>;
  return { ...fields, hash: purchaseHash(fields, input.apiKey) };
}

/** Check transaction request: hash = HMAC-SHA512(req_time + merchant_id + tran_id). */
export function checkTransactionBody(
  merchantId: string,
  tranId: string,
  apiKey: string,
  now: Date = new Date(),
) {
  const req_time = reqTime(now);
  return {
    req_time,
    merchant_id: merchantId,
    tran_id: tranId,
    hash: hmacSha512Base64(req_time + merchantId + tranId, apiKey),
  };
}

export type CheckResult =
  | {
      kind: "found";
      paymentStatus: string; // APPROVED | PENDING | DECLINED | REFUNDED | CANCELLED | PRE-AUTH
      paymentStatusCode: string;
      apv?: string;
      originalAmount?: number;
      totalAmount?: number;
      paymentCurrency?: string;
      transactionDate?: string;
    }
  | { kind: "not_found"; code: string; message: string }
  | { kind: "error"; code: string; message: string }
  | { kind: "unavailable"; reason: string };

/** Interprets a Check transaction response body. Unknown shapes become `error`, never success. */
export function parseCheckResponse(body: unknown): CheckResult {
  const root = asRecord(body);
  const data = asRecord(root?.data);
  const status = asRecord(root?.status) ?? asRecord(data?.status);
  const code = String(status?.code ?? "");
  const message = String(status?.message ?? "");

  if (code === "00" && data && typeof data.payment_status === "string") {
    return {
      kind: "found",
      paymentStatus: data.payment_status.toUpperCase(),
      paymentStatusCode: String(data.payment_status_code ?? ""),
      apv: text(data.apv),
      originalAmount: amount(data.original_amount),
      totalAmount: amount(data.total_amount),
      paymentCurrency: text(data.payment_currency),
      transactionDate: text(data.transaction_date),
    };
  }
  // Code 6 is "Transaction not found" here, but "wrong domain" elsewhere in the
  // PayWay API. A whitelist problem must not look like a missing transaction.
  if (code === "6" && !/domain|whitelist/i.test(message)) {
    return { kind: "not_found", code, message };
  }
  return {
    kind: "error",
    code: code || "unknown",
    message: message || "Unrecognised response from PayWay",
  };
}

/** Parses the callback body. The docs specify JSON; form-encoded is accepted defensively. */
export function parseCallbackBody(
  raw: string,
  contentType: string | null,
): Record<string, unknown> | null {
  const body = raw.trim();
  if (!body) return null;
  if (contentType?.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(body));
  }
  try {
    return asRecord(JSON.parse(body)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Callback signature, reproducing the PHP reference in the docs:
 *   ksort($response); concatenate the values (arrays via json_encode);
 *   base64_encode(hash_hmac('sha512', $b4hash, $secretKey, true))
 * PayWay sends the result in the `X-PAYWAY-HMAC-SHA512` header.
 */
export function callbackSignature(payload: Record<string, unknown>, key: string): string {
  const b4hash = Object.keys(payload)
    .sort()
    .map((k) => phpString(payload[k]))
    .join("");
  return hmacSha512Base64(b4hash, key);
}

export type SignatureCheck = "valid" | "invalid" | "missing";

export function verifyCallbackSignature(
  payload: Record<string, unknown>,
  received: string | null,
  key: string,
): SignatureCheck {
  if (!received?.trim()) return "missing";
  const expected = Buffer.from(callbackSignature(payload, key));
  const actual = Buffer.from(received.trim());
  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? "valid"
    : "invalid";
}

/** PHP's string conversion for `$b4hash .= $value`, as used by the reference code. */
function phpString(value: unknown): string {
  if (value === null || value === undefined || value === false) return "";
  if (value === true) return "1";
  if (typeof value === "object") return phpJsonEncode(value);
  return String(value);
}

// PHP json_encode() escapes "/" and every non-ASCII UTF-16 unit by default.
// ponytail: floats with a zero fraction (10.0) and empty objects differ from
// PHP; PayWay's documented callback has only scalar values.
function phpJsonEncode(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\//g, "\\/")
    .replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function amount(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
