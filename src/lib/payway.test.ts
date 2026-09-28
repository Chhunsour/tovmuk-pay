import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPurchaseFields,
  callbackSignature,
  checkTransactionBody,
  newTranId,
  parseCallbackBody,
  parseCheckResponse,
  purchaseHash,
  qrHash,
  reqTime,
  TRAN_ID_PATTERN,
  verifyCallbackSignature,
} from "./payway.ts";

// Expected values come from PayWay's PHP reference code: test/payway-reference.php
const KEY = "test-api-key-not-real";
const NOW = new Date("2026-09-23T05:06:07Z");
const TRAN = "TP260923050607AB12CD";
const BASE = "https://pay.tovmuksolution.com/api/payway";

const purchase = () =>
  buildPurchaseFields({
    merchantId: "ec000002",
    apiKey: KEY,
    tranId: TRAN,
    amountKhr: 2000,
    callbackUrl: `${BASE}/callback`,
    successUrl: `${BASE}/return?tran_id=${TRAN}`,
    cancelUrl: `${BASE}/cancel?tran_id=${TRAN}`,
    customFields: { account_number: "000123456", sender_name: "Sokha Chan" },
    lifetimeMinutes: 15,
    now: NOW,
  });

const DOC_CALLBACK = {
  tran_id: "9065703303",
  apv: "544415",
  status: "0",
  return_params: '{"order_id":"123","amount":100,"client_id":"1234567890"}',
  original_amount: 0.01,
  original_currency: "USD",
  payment_amount: 0.01,
  payment_currency: "USD",
  total_amount: 0.01,
  discount_amount: 0,
  transaction_date: "2026-08-03 13:57:20",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  bank_ref: "100FT40074059022",
  payment_type: "ABA Pay",
  payer_account: "003471222",
  bank_name: "",
  card_source: "",
};
const DOC_SIGNATURE =
  "SlhlCv4H+nHo1hXzeYdEzRLznmmBmA6OZDfQeB9U7GTlthQ2WXrxEZ1JgLLqC3qf9WAK/WtxTPI41AK8ZTno/g==";

test("purchase hash matches PayWay's PHP reference", () => {
  assert.equal(
    purchase().hash,
    "wBxePjlVgBBvUW5Qzk+PYPm7vaq2XWaifCuf38CwTQQUq5cPzqCkQUhUKaBkuoFmRqcdfHf7Ma08z9xqowqf8w==",
  );
});

test("purchase fields carry the exact KHR amount and encoded URLs", () => {
  const f = purchase();
  assert.equal(f.req_time, "20260923050607");
  assert.equal(f.amount, "2000");
  assert.equal(f.currency, "KHR");
  assert.equal(Buffer.from(f.return_url, "base64").toString(), `${BASE}/callback`);
  assert.deepEqual(JSON.parse(Buffer.from(f.custom_fields, "base64").toString()), {
    account_number: "000123456",
    sender_name: "Sokha Chan",
  });
  assert.equal(buildPurchaseFields({ ...baseInput(), amountKhr: 1 }).amount, "1");
});

test("sandbox purchase can omit the callback URL and still sign every field", () => {
  const { hash, ...fields } = buildPurchaseFields({ ...baseInput(), callbackUrl: "" });
  assert.equal(fields.return_url, "");
  assert.equal(purchaseHash(fields, KEY), hash);
});

test("sandbox QR uses ABA's dedicated QR hash order", () => {
  const fields = { req_time: "20260923050607", merchant_id: "ec000002", tran_id: TRAN, amount: "2000", purchase_type: "purchase", payment_option: "abapay_khqr", currency: "KHR", lifetime: "15", qr_image_template: "template3_color" };
  assert.equal(qrHash(fields, KEY), "N4cOypsiHZA6MJegQjjlRhCJTeNtTjybLEgXKORNd+vZ6OktyUmm5Lo8mX2LFRYZ024+GbvvrP5S0nLCtglD5w==");
  assert.notEqual(qrHash({ ...fields, amount: "2001" }, KEY), qrHash(fields, KEY));
});

test("every signed field is covered: tampering with the amount changes the hash", () => {
  const { hash, ...fields } = purchase();
  assert.equal(purchaseHash(fields, KEY), hash);
  assert.notEqual(purchaseHash({ ...fields, amount: "1" }, KEY), hash);
  assert.notEqual(purchaseHash(fields, "another-key"), hash);
});

test("purchase rejects amounts PayWay cannot take in KHR", () => {
  for (const amountKhr of [0, -5, 1.5, Number.NaN]) {
    assert.throws(() => buildPurchaseFields({ ...baseInput(), amountKhr }), RangeError);
  }
});

test("check transaction hash matches PayWay's PHP reference", () => {
  assert.deepEqual(checkTransactionBody("ec000002", TRAN, KEY, NOW), {
    req_time: "20260923050607",
    merchant_id: "ec000002",
    tran_id: TRAN,
    hash: "irCS1+A0+3XGMUK8dZJvMaiL6cL5FKqis72NIHMph17slgtjT2vBKggZuSekiTz3XDRbOr3j8phKTa8ghCpgaQ==",
  });
});

test("callback signature matches PayWay's PHP reference for the documented payload", () => {
  assert.equal(callbackSignature(DOC_CALLBACK, KEY), DOC_SIGNATURE);
  // Key order in the body must not matter: PayWay sorts keys before hashing.
  const reversed = Object.fromEntries(Object.entries(DOC_CALLBACK).reverse());
  assert.equal(callbackSignature(reversed, KEY), DOC_SIGNATURE);
});

test("callback signature follows PHP string conversion for nested, boolean and null values", () => {
  const edge = JSON.parse(
    '{"tran_id":"TP1","status":"0","z":{"url":"https://a/b","name":"សុខា"},"flag":true,"off":false,"none":null,"amt":2000.0,"f":0.1,"list":[1,"x/y"]}',
  );
  assert.equal(
    callbackSignature(edge, KEY),
    "aMT+FteCtqADLQNrgvgP54D60UvcdS7jA/FMG5QdH55IkAkWR9ykLELbiKxt/fPVDT+Rzeog8laQuHnJevBNPA==",
  );
});

test("callback verification: valid, tampered, wrong key, missing", () => {
  assert.equal(verifyCallbackSignature(DOC_CALLBACK, DOC_SIGNATURE, KEY), "valid");
  assert.equal(verifyCallbackSignature(DOC_CALLBACK, ` ${DOC_SIGNATURE}\n`, KEY), "valid");
  assert.equal(verifyCallbackSignature({ ...DOC_CALLBACK, original_amount: 100 }, DOC_SIGNATURE, KEY), "invalid");
  assert.equal(verifyCallbackSignature(DOC_CALLBACK, DOC_SIGNATURE, "wrong-key"), "invalid");
  assert.equal(verifyCallbackSignature(DOC_CALLBACK, "short", KEY), "invalid");
  assert.equal(verifyCallbackSignature(DOC_CALLBACK, null, KEY), "missing");
  assert.equal(verifyCallbackSignature(DOC_CALLBACK, "  ", KEY), "missing");
});

test("callback body parsing: JSON, form-encoded, malformed", () => {
  assert.deepEqual(parseCallbackBody('{"tran_id":"TP1","status":"0"}', "application/json"), {
    tran_id: "TP1",
    status: "0",
  });
  assert.deepEqual(parseCallbackBody("tran_id=TP1&status=0", "application/x-www-form-urlencoded"), {
    tran_id: "TP1",
    status: "0",
  });
  for (const bad of ["", "   ", "{not json", "[1,2]", "null", '"text"']) {
    assert.equal(parseCallbackBody(bad, "application/json"), null, bad);
  }
});

test("check response: found, not found, whitelist error, garbage", () => {
  const found = parseCheckResponse({
    data: {
      payment_status_code: 0,
      payment_status: "APPROVED",
      original_amount: 2000,
      total_amount: 2000,
      payment_currency: "KHR",
      apv: "123456",
      transaction_date: "2026-09-25 10:00:00",
    },
    status: { code: "00", message: "Success!", tran_id: "x" },
  });
  assert.equal(found.kind, "found");
  assert.equal(found.kind === "found" && found.originalAmount, 2000);

  // The docs' schema nests `status` inside `data`; both shapes are accepted.
  assert.equal(parseCheckResponse({ data: { payment_status: "PENDING", status: { code: "00" } } }).kind, "found");
  assert.equal(parseCheckResponse({ status: { code: "6", message: "Transaction not found" } }).kind, "not_found");
  assert.equal(parseCheckResponse({ status: { code: "6", message: "Wrong domain" } }).kind, "error");
  assert.equal(parseCheckResponse({ status: { code: "5", message: "Invalid hash" } }).kind, "error");
  assert.equal(parseCheckResponse("<html>502</html>").kind, "error");
  assert.equal(parseCheckResponse({ data: { payment_status: "APPROVED" } }).kind, "error"); // no "00": not a success
});

test("req_time and tran_id formats", () => {
  assert.equal(reqTime(NOW), "20260923050607");
  const ids = new Set(Array.from({ length: 5000 }, () => newTranId(NOW)));
  assert.equal(ids.size, 5000);
  for (const id of ids) {
    assert.match(id, TRAN_ID_PATTERN);
    assert.equal(id.length, 20);
    assert.ok(id.startsWith("TP260923050607"));
  }
});

function baseInput() {
  return {
    merchantId: "ec000002",
    apiKey: KEY,
    tranId: TRAN,
    amountKhr: 2000,
    callbackUrl: `${BASE}/callback`,
    successUrl: `${BASE}/return`,
    cancelUrl: `${BASE}/cancel`,
    customFields: {},
    lifetimeMinutes: 15,
    now: NOW,
  };
}
