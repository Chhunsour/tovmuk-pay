// PayWay's server-to-server notification (the Purchase `return_url`).
import { log } from "@/lib/log";
import { processCallback } from "@/lib/settlement";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    log("warn", "payway.callback.too_large", { bytes: raw.length });
    return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  try {
    const { status, body } = await processCallback(raw, request.headers);
    return Response.json(body, { status });
  } catch (error) {
    // Database or unexpected failure: a 5xx lets PayWay deliver the callback again.
    log("error", "payway.callback.failed", { error });
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
