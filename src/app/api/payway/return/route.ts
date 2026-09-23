// continue_success_url: PayWay sends the payer's browser here after paying.
// The redirect proves nothing (it can be lost, replayed or forged), so we
// ask PayWay for the real status before the payer sees any result.
import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import { TRAN_ID_PATTERN } from "@/lib/payway";
import { reconcile } from "@/lib/settlement";

async function handle(request: NextRequest) {
  const tranId = request.nextUrl.searchParams.get("tran_id") ?? "";
  log("info", "payway.return", { tran_id: tranId, method: request.method, query: Object.fromEntries(request.nextUrl.searchParams) });
  if (!TRAN_ID_PATTERN.test(tranId)) return Response.redirect(new URL("/", request.url), 303);
  try {
    await reconcile(tranId, { force: true });
  } catch (error) {
    log("error", "payway.return.reconcile_failed", { tran_id: tranId, error }); // the status page retries
  }
  return Response.redirect(new URL(`/transfer/${tranId}`, request.url), 303);
}

export { handle as GET, handle as POST };
