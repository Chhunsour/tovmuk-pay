import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckResult } from "./payway.ts";
import { allowedFrom, decide, NOT_FOUND_GRACE_MS, type Status } from "./status.ts";

const found = (paymentStatus: string, originalAmount = 2000): CheckResult => ({
  kind: "found",
  paymentStatus,
  paymentStatusCode: "0",
  apv: "544415",
  originalAmount,
});
const paidCallback = (overrides: Record<string, unknown> = {}) => ({
  tran_id: "TP1",
  status: "0",
  apv: "544415",
  original_amount: 2000,
  original_currency: "KHR",
  payment_type: "ABA Pay",
  bank_ref: "100FT40074059022",
  ...overrides,
});
const unavailable: CheckResult = { kind: "unavailable", reason: "timeout" };
const MIN = 60_000;

test("PayWay APPROVED with the signed amount approves", () => {
  const v = decide({ amountKhr: 2000, ageMs: MIN, check: found("APPROVED") });
  assert.equal(v?.status, "approved");
  assert.equal(v?.verifiedBy, "check_transaction");
});

test("an approval for a different amount is held for review, never approved", () => {
  assert.equal(decide({ amountKhr: 2000, ageMs: MIN, check: found("APPROVED", 1) })?.status, "review");
  assert.equal(
    decide({ amountKhr: 2000, ageMs: MIN, check: unavailable, signedCallback: paidCallback({ original_amount: 1 }) })?.status,
    "review",
  );
  assert.equal(
    decide({ amountKhr: 2000, ageMs: MIN, check: unavailable, signedCallback: paidCallback({ original_currency: "USD" }) })?.status,
    "review",
  );
});

test("a signed callback settles the payment while the status API lags or is unreachable", () => {
  for (const check of [found("PENDING"), unavailable, { kind: "not_found", code: "6", message: "Transaction not found" } as const]) {
    const v = decide({ amountKhr: 2000, ageMs: MIN, check, signedCallback: paidCallback() });
    assert.equal(v?.status, "approved", check.kind);
    assert.equal(v?.verifiedBy, "callback_signature");
  }
});

test("both sources agreeing keeps the status API as the verifier and adds callback details", () => {
  const v = decide({ amountKhr: 2000, ageMs: MIN, check: found("APPROVED"), signedCallback: paidCallback() });
  assert.deepEqual(
    [v?.status, v?.verifiedBy, v?.paymentType, v?.bankRef],
    ["approved", "check_transaction", "ABA Pay", "100FT40074059022"],
  );
});

test("a paid callback contradicting a declined status check goes to review", () => {
  const v = decide({ amountKhr: 2000, ageMs: MIN, check: found("DECLINED"), signedCallback: paidCallback() });
  assert.equal(v?.status, "review");
});

test("declined, cancelled and refunded map straight through", () => {
  for (const [payway, status] of [["DECLINED", "declined"], ["CANCELLED", "cancelled"], ["REFUNDED", "refunded"]]) {
    assert.equal(decide({ amountKhr: 2000, ageMs: MIN, check: found(payway) })?.status, status);
  }
});

test("pending, pre-auth and unknown statuses are never treated as paid", () => {
  for (const payway of ["PENDING", "PRE-AUTH", "SOMETHING-NEW"]) {
    assert.equal(decide({ amountKhr: 2000, ageMs: MIN, check: found(payway) })?.status, "pending", payway);
  }
  // A signed callback whose status is not "0" does not settle anything by itself.
  assert.equal(decide({ amountKhr: 2000, ageMs: MIN, check: unavailable, signedCallback: paidCallback({ status: "3" }) }), null);
});

test("a checkout past its lifetime is recorded as cancelled", () => {
  const v = decide({ amountKhr: 2000, ageMs: 18 * MIN, check: found("PENDING") });
  assert.equal(v?.status, "cancelled");
  assert.match(v?.message ?? "", /expired/);
});

test("no record at PayWay means failed, but only after a grace period", () => {
  const notFound: CheckResult = { kind: "not_found", code: "6", message: "Transaction not found" };
  assert.equal(decide({ amountKhr: 1, ageMs: 10_000, check: notFound }), null);
  assert.equal(decide({ amountKhr: 1, ageMs: NOT_FOUND_GRACE_MS + 1, check: notFound })?.status, "failed");
});

test("without a PayWay answer nothing changes", () => {
  assert.equal(decide({ amountKhr: 2000, ageMs: MIN, check: unavailable }), null);
  assert.equal(decide({ amountKhr: 2000, ageMs: MIN, check: { kind: "error", code: "5", message: "Invalid hash" } }), null);
});

test("transitions are one-way, which makes repeated callbacks no-ops", () => {
  const can = (from: Status, to: Status) => allowedFrom(to).includes(from);
  assert.ok(can("pending", "approved"));
  assert.ok(!can("approved", "approved")); // a duplicate callback updates nothing
  assert.ok(!can("declined", "approved"));
  assert.ok(!can("approved", "cancelled")); // a late cancel redirect cannot undo a payment
  assert.ok(can("cancelled", "approved")); // but a verified payment overrides a local cancel
  assert.ok(can("failed", "approved"));
  assert.ok(!can("review", "approved"));
});
