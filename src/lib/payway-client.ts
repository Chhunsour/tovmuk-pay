// Outbound calls to PayWay. Every request and response is logged (redacted).
import "server-only";
import type { PayWayConfig } from "./config.ts";
import { log } from "./log.ts";
import { CHECK_TRANSACTION_PATH, QR_PATH, checkTransactionBody, parseCheckResponse, qrHash, type CheckResult } from "./payway.ts";

const TIMEOUT_MS = 8_000;

export type SandboxPurchase =
  | { kind: "ready"; qrImage: string; abaDeepLink?: string }
  | { kind: "rejected"; code: string; message: string }
  | { kind: "unavailable" };

/** Ask ABA's dedicated QR API for the payment image and mobile deep link. */
export async function generateSandboxQr(cfg: PayWayConfig, tranId: string, fields: Record<string, string>): Promise<SandboxPurchase> {
  const url = cfg.baseUrl + QR_PATH;
  const qrFields = {
    req_time: fields.req_time,
    merchant_id: fields.merchant_id,
    tran_id: tranId,
    amount: fields.amount,
    purchase_type: "purchase",
    payment_option: "abapay_khqr",
    currency: fields.currency,
    custom_fields: fields.custom_fields,
    lifetime: fields.lifetime,
    qr_image_template: "template3_color",
  };
  const body = { ...qrFields, amount: Number(qrFields.amount), lifetime: Number(qrFields.lifetime), hash: qrHash(qrFields, cfg.apiKey) };
  log("info", "payway.qr.request", { tran_id: tranId, url });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: cfg.appBaseUrl, Referer: `${cfg.appBaseUrl}/` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const response = await res.json().catch(() => null);
    const code = String(response?.status?.code ?? "");
    const message = String(response?.status?.message ?? "Unknown PayWay response").slice(0, 120);
    if (res.ok && code === "0" && typeof response?.qrImage === "string" &&
      response.qrImage.length <= 900_000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(response.qrImage)) {
      log("info", "payway.qr.response", { tran_id: tranId, http_status: res.status, code });
      let abaDeepLink: string | undefined;
      if (typeof response.abapay_deeplink === "string") {
        try {
          const link = new URL(response.abapay_deeplink);
          if (link.protocol === "abamobilebank:" && link.hostname === "ababank.com") abaDeepLink = link.href;
        } catch { /* ignore malformed provider links */ }
      }
      return { kind: "ready", qrImage: response.qrImage, abaDeepLink };
    }
    log("warn", "payway.qr.response", { tran_id: tranId, http_status: res.status, code, message });
    return code && code !== "0" ? { kind: "rejected", code, message } : { kind: "unavailable" };
  } catch (error) {
    log("warn", "payway.qr.failed", { tran_id: tranId, error });
    return { kind: "unavailable" };
  }
}

/** Asks PayWay for the authoritative status of a transaction. Never throws. */
export async function checkTransaction(cfg: PayWayConfig, tranId: string): Promise<CheckResult> {
  const url = cfg.baseUrl + CHECK_TRANSACTION_PATH;
  const started = Date.now();
  log("info", "payway.check.request", { tran_id: tranId, url });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // PayWay whitelists callers by domain; identify the whitelisted origin.
        Referer: `${cfg.appBaseUrl}/`,
      },
      body: JSON.stringify(checkTransactionBody(cfg.merchantId, tranId, cfg.apiKey)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await res.text();
    const body = parseJson(text);
    const result: CheckResult =
      res.ok && body !== undefined ? parseCheckResponse(body) : { kind: "unavailable", reason: `HTTP ${res.status}` };
    log(result.kind === "found" || result.kind === "not_found" ? "info" : "warn", "payway.check.response", {
      tran_id: tranId,
      http_status: res.status,
      ms: Date.now() - started,
      result: result.kind,
      body: body ?? text.slice(0, 300),
    });
    return result;
  } catch (error) {
    const reason = (error as { name?: string })?.name === "TimeoutError" ? "timeout" : "network_error";
    log("warn", "payway.check.failed", { tran_id: tranId, reason, ms: Date.now() - started, error });
    return { kind: "unavailable", reason };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
