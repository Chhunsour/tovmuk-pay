import assert from "node:assert/strict";
import { test } from "node:test";
import { redact } from "./log.ts";
import { formatKhr, groupDigits, maskAccount, validateTransfer } from "./transfer.ts";

const valid = { name: "Sokha Chan", accountNumber: "000 123 456", amount: "2000" };

test("accepts a valid transfer and normalises it", () => {
  assert.deepEqual(validateTransfer({ ...valid, name: "  Sokha   Chan " }), {
    ok: true,
    value: { name: "Sokha Chan", accountNumber: "000123456", amountKhr: 2000 },
  });
  assert.equal(validateTransfer({ ...valid, amount: "1" }).ok, true); // the 1 KHR exam transaction
  assert.equal(validateTransfer({ ...valid, name: "សុខា ចាន់" }).ok, true); // Khmer script
  assert.equal(validateTransfer({ ...valid, name: "Mary-Jane O'Neil Jr." }).ok, true);
});

test("amount must be whole riel inside the allowed range", () => {
  for (const amount of ["0", "-1", "1.5", "2000.00", "2,000", "1e3", "0x10", " ", "", "abc", "02000", "100001", "999999999999"]) {
    const result = validateTransfer({ ...valid, amount });
    assert.equal(result.ok, false, amount);
    assert.ok(!result.ok && result.errors.amount, amount);
  }
  assert.equal(validateTransfer({ ...valid, amount: "100000" }).ok, true);
});

test("amount must arrive as a string: numbers, arrays and objects are rejected", () => {
  for (const amount of [2000, ["2000"], { value: 2000 }, null, undefined]) {
    assert.equal(validateTransfer({ ...valid, amount }).ok, false);
  }
});

test("name and account number are length- and character-checked", () => {
  const bad = [
    { name: "A" },
    { name: "x".repeat(101) },
    { name: "Robert'); DROP TABLE transactions;--" },
    { name: "<script>alert(1)</script>" },
    { name: "Agent 007" },
    { accountNumber: "12345" },
    { accountNumber: "1".repeat(21) },
    { accountNumber: "ABC123456" },
    { accountNumber: "000123456; --" },
  ];
  for (const override of bad) {
    assert.equal(validateTransfer({ ...valid, ...override }).ok, false, JSON.stringify(override));
  }
  assert.equal(validateTransfer({ ...valid, name: "a".repeat(5000) }).ok, false); // oversized input is not processed
});

test("formatting helpers", () => {
  assert.equal(formatKhr(2000), "2,000 KHR");
  assert.equal(formatKhr(1), "1 KHR");
  assert.equal(groupDigits("000123456"), "000 123 456");
  assert.equal(maskAccount("000123456"), "•••• 3456");
});

test("log redaction hides secrets and masks account numbers at any depth", () => {
  assert.deepEqual(
    redact({
      hash: "abc",
      api_key: "k",
      headers: { "x-payway-hmac-sha512": "sig" },
      fields: { account_number: "000123456", amount: "2000" },
      error: new Error("boom"),
    }),
    {
      hash: "[redacted]",
      api_key: "[redacted]",
      headers: { "x-payway-hmac-sha512": "[redacted]" },
      fields: { account_number: "•••• 3456", amount: "2000" },
      error: { name: "Error", message: "boom" },
    },
  );
});
