// Outbound calls to PayWay. Every request and response is logged (redacted).
import "server-only";
import type { PayWayConfig } from "./config.ts";
import { log } from "./log.ts";
import { CHECK_TRANSACTION_PATH, checkTransactionBody, parseCheckResponse, type CheckResult } from "./payway.ts";

const TIMEOUT_MS = 8_000;

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
