// Local stand-in for ABA PayWay, for exercising the full flow without real money.
// Implements the documented behaviour we rely on: the purchase form POST (hash
// checked), a hosted checkout with pay / decline / cancel, the signed callback
// and Check transaction.
//
//   node --env-file=.env.local test/mock-payway.ts      (listens on :4010)
//   then run the app with PAYWAY_BASE_URL=http://localhost:4010
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { callbackSignature, hmacSha512Base64, purchaseHash, reqTime } from "../src/lib/payway.ts";

const KEY = process.env.PAYWAY_API_KEY ?? "";
const MERCHANT = process.env.PAYWAY_MERCHANT_ID ?? "";
const PORT = 4010;

type MockTransaction = { fields: Record<string, string>; status: "PENDING" | "APPROVED" | "DECLINED"; apv?: string };
const store = new Map<string, MockTransaction>();

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const body = await readBody(req);
  console.log(`[mock-payway] ${req.method} ${url.pathname}${url.search} referer=${req.headers.referer ?? "-"}`);

  if (url.pathname === "/api/payment-gateway/v1/payments/purchase" && req.method === "POST") {
    const form = await new Response(new Uint8Array(body), { headers: { "content-type": req.headers["content-type"] ?? "" } }).formData();
    const fields = Object.fromEntries([...form].map(([k, v]) => [k, String(v)]));
    const { hash, ...signed } = fields;
    if (fields.merchant_id !== MERCHANT || purchaseHash(signed, KEY) !== hash) return json(res, { status: { code: "1", message: "Wrong hash" } });
    if (fields.currency === "KHR" && Number(fields.amount) <= 100) {
      return json(res, { status: { code: "47", message: "KHR amount must be greater than 100 KHR" } });
    }
    if (store.has(fields.tran_id)) return json(res, { status: { code: "4", message: "Duplicated transaction ID" } });
    store.set(fields.tran_id, { fields, status: "PENDING" });
    return html(res, checkoutPage(fields));
  }

  if (url.pathname.startsWith("/mock/") && req.method === "POST") {
    const tx = store.get(url.searchParams.get("tran_id") ?? "");
    if (!tx) return json(res, { error: "unknown" }, 404);
    if (url.pathname === "/mock/pay") {
      tx.status = "APPROVED";
      tx.apv = String(100000 + Math.floor(Math.random() * 899999));
      await sendCallback(tx);
      return redirect(res, tx.fields.continue_success_url);
    }
    if (url.pathname === "/mock/decline") {
      tx.status = "DECLINED";
      return redirect(res, tx.fields.cancel_url);
    }
    return redirect(res, tx.fields.cancel_url); // /mock/cancel
  }

  if (url.pathname === "/api/payment-gateway/v1/payments/check-transaction-2" && req.method === "POST") {
    const q = JSON.parse(body.toString() || "{}");
    if (hmacSha512Base64(q.req_time + q.merchant_id + q.tran_id, KEY) !== q.hash) {
      return json(res, { status: { code: "5", message: "Invalid hash" } });
    }
    const tx = store.get(q.tran_id);
    if (!tx) return json(res, { status: { code: "6", message: "Transaction not found" } });
    const amount = Number(tx.fields.amount);
    return json(res, {
      data: {
        payment_status_code: { APPROVED: 0, PENDING: 2, DECLINED: 3 }[tx.status],
        total_amount: amount,
        original_amount: amount,
        refund_amount: 0,
        discount_amount: 0,
        payment_amount: tx.status === "APPROVED" ? amount : 0,
        payment_currency: "KHR",
        apv: tx.apv ?? "",
        payment_status: tx.status,
        transaction_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      },
      status: { code: "00", message: "Success!", tran_id: `mock-${Date.now()}` },
    });
  }

  json(res, { error: "not found" }, 404);
}).listen(PORT, () => console.log(`[mock-payway] listening on http://localhost:${PORT}`));

async function sendCallback(tx: MockTransaction) {
  const amount = Number(tx.fields.amount);
  const payload = {
    tran_id: tx.fields.tran_id,
    apv: tx.apv,
    status: "0",
    return_params: "",
    original_amount: amount,
    original_currency: "KHR",
    payment_amount: amount,
    payment_currency: "KHR",
    total_amount: amount,
    discount_amount: 0,
    transaction_date: new Date().toISOString().slice(0, 19).replace("T", " "),
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    bank_ref: `100FT${reqTime().slice(2)}`,
    payment_type: "ABA Pay",
    payer_account: "003***222",
    bank_name: "ABA Bank",
    card_source: "",
  };
  const url = Buffer.from(tx.fields.return_url, "base64").toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-payway-hmac-sha512": callbackSignature(payload, KEY) },
    body: JSON.stringify(payload),
  });
  console.log(`[mock-payway] callback -> ${res.status} ${await res.text()}`);
}

function checkoutPage(f: Record<string, string>) {
  const custom = Buffer.from(f.custom_fields ?? "", "base64").toString();
  const button = (path: string, label: string, color: string) =>
    `<form method="post" action="${path}?tran_id=${f.tran_id}"><button style="width:100%;padding:12px;margin-top:10px;border:0;border-radius:10px;background:${color};color:#fff;font-weight:600;font-size:15px">${label}</button></form>`;
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayWay - Checkout (MOCK)</title>
<body style="font-family:system-ui;background:#eef2f7;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="background:#fff;border-radius:16px;padding:28px;width:340px;box-shadow:0 10px 40px #0002">
<p style="margin:0;color:#c8102e;font-weight:700;letter-spacing:.08em;font-size:12px">ABA PAYWAY · LOCAL MOCK</p>
<p style="font-size:34px;font-weight:700;margin:14px 0 4px">${Number(f.amount).toLocaleString("en-US")} ${f.currency}</p>
<p style="color:#666;margin:0 0 12px;font-size:13px">tran_id <code>${f.tran_id}</code></p>
<p style="color:#666;font-size:12px;word-break:break-all">custom_fields: <code>${custom.replace(/</g, "&lt;")}</code></p>
${button("/mock/pay", "Pay with ABA PAY", "#0a2240")}${button("/mock/decline", "Decline payment", "#8a8f98")}${button("/mock/cancel", "Cancel", "#c8102e")}
</div></body>`;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c)).on("end", () => resolve(Buffer.concat(chunks)));
  });
}
function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
}
function html(res: ServerResponse, page: string) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
}
function redirect(res: ServerResponse, location: string) {
  res.writeHead(303, { location }).end();
}
