import { paywayConfig } from "@/lib/config";
import { findTransaction } from "@/lib/transactions";

export async function GET() {
  let database = "ok";
  try {
    await findTransaction("HEALTHCHECK");
  } catch {
    database = "unreachable";
  }
  const ok = database === "ok";
  return Response.json(
    { ok, database, payway: paywayConfig() ? "configured" : "not_configured" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
