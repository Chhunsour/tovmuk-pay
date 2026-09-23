// Structured JSON logs (one line per event, searchable in Vercel's log view).
// Secrets never reach a log line: anything that looks like a credential or
// signature is replaced, and account numbers are masked.
import { maskAccount } from "./transfer.ts";

type Level = "info" | "warn" | "error";

const SECRET_KEY = /hash|hmac|api_?key|secret|signature|token|password|authorization|cookie/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEY.test(key)
          ? "[redacted]"
          : key === "account_number" && typeof item === "string"
            ? maskAccount(item)
            : redact(item, depth + 1),
      ]),
    );
  }
  return value;
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ...(redact(fields) as object), at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
