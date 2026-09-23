// cancel_url: the payer cancelled or closed PayWay checkout. We record the
// cancellation only if PayWay confirms nothing was paid.
import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import { TRAN_ID_PATTERN } from "@/lib/payway";
import { cancelByPayer } from "@/lib/settlement";

async function handle(request: NextRequest) {
  const tranId = request.nextUrl.searchParams.get("tran_id") ?? "";
  log("info", "payway.cancel", { tran_id: tranId, method: request.method, query: Object.fromEntries(request.nextUrl.searchParams) });
  if (!TRAN_ID_PATTERN.test(tranId)) return Response.redirect(new URL("/", request.url), 303);
  try {
    await cancelByPayer(tranId);
  } catch (error) {
    log("error", "payway.cancel.failed", { tran_id: tranId, error });
  }
  return Response.redirect(new URL(`/transfer/${tranId}`, request.url), 303);
}

export { handle as GET, handle as POST };
