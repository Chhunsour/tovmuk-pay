// Transfer rules shared by the browser (instant feedback) and the server
// (the authority: every submission is re-validated there).

export const MIN_AMOUNT_KHR = 1;
/** Per-transfer cap for this live merchant; mirrored by a database CHECK constraint. */
export const MAX_AMOUNT_KHR = 100_000;

export type TransferFields = { name: string; accountNumber: string; amount: string };
export type FieldErrors = Partial<Record<keyof TransferFields, string>>;
export type Transfer = { name: string; accountNumber: string; amountKhr: number };

const MAX_RAW_LENGTH = 200;
// Letters and combining marks in any script (Latin, Khmer, ...), with single
// separators for names like "Mary-Jane O'Neil" or "J. Smith".
const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '.-]+[\p{L}\p{M}]+)*\.?$/u;
const ZERO_WIDTH = /[​-‍﻿]/g;

export function validateTransfer(
  input: Partial<Record<keyof TransferFields, unknown>>,
): { ok: true; value: Transfer } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const name = clean(input.name).normalize("NFC").replace(ZERO_WIDTH, "").replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) {
    errors.name = "Enter the sender's full name (2–100 characters).";
  } else if (!NAME_PATTERN.test(name)) {
    errors.name = "Use letters and spaces only (apostrophes, periods and hyphens are fine).";
  }

  const accountNumber = clean(input.accountNumber).replace(/[\s-]/g, "");
  if (!/^\d{6,20}$/.test(accountNumber)) {
    errors.accountNumber = "Enter the destination account number: 6–20 digits.";
  }

  // Digits only: no decimals, signs, exponents or separators. Riel has no minor unit.
  const raw = clean(input.amount);
  const amountKhr = /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(amountKhr)) {
    errors.amount = "Enter a whole number of riel: digits only, no decimals.";
  } else if (amountKhr < MIN_AMOUNT_KHR || amountKhr > MAX_AMOUNT_KHR) {
    errors.amount = `Amount must be between ${formatKhr(MIN_AMOUNT_KHR)} and ${formatKhr(MAX_AMOUNT_KHR)}.`;
  }

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { name, accountNumber, amountKhr } };
}

/** 2000 -> "2,000 KHR" */
export function formatKhr(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(amount)} KHR`;
}

/** "000123456" -> "000 123 456" */
export function groupDigits(digits: string): string {
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ");
}

/** "000123456" -> "•••• 3456" */
export function maskAccount(digits: string): string {
  return `•••• ${digits.slice(-4)}`;
}

function clean(value: unknown): string {
  return typeof value === "string" && value.length <= MAX_RAW_LENGTH ? value.trim() : "";
}
