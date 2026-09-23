// Persistence for payment attempts (Supabase Postgres, server-only access).
import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { allowedFrom, type Status, type VerifiedBy } from "./status.ts";
import type { Transfer } from "./transfer.ts";

export type TransactionRow = {
  tran_id: string;
  sender_name: string;
  account_number: string;
  amount: number;
  currency: "KHR";
  status: Status;
  payway_status: string | null;
  payway_code: string | null;
  payway_message: string | null;
  apv: string | null;
  payment_type: string | null;
  bank_ref: string | null;
  verified_by: VerifiedBy | null;
  callback_payload: Record<string, unknown> | null;
  callback_signature: "valid" | "missing" | null;
  callback_received_at: string | null;
  last_checked_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type Changes = Partial<Omit<TransactionRow, "tran_id" | "status" | "created_at" | "updated_at">>;

let client: SupabaseClient | undefined;

function transactions() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client.from("transactions");
}

export async function insertTransaction(t: Transfer & { tranId: string }): Promise<void> {
  const { error } = await transactions().insert({
    tran_id: t.tranId,
    sender_name: t.name,
    account_number: t.accountNumber,
    amount: t.amountKhr,
    currency: "KHR",
  });
  if (error) throw dbError("insert", error);
}

export async function findTransaction(tranId: string): Promise<TransactionRow | null> {
  const { data, error } = await transactions().select("*").eq("tran_id", tranId).maybeSingle();
  if (error) throw dbError("select", error);
  return data as TransactionRow | null;
}

/**
 * Atomically moves a transaction to `status`, but only from a status that is
 * allowed to change into it (see status.ts). Returns null when nothing
 * changed: a duplicate, or another request got there first.
 */
export async function transition(tranId: string, status: Status, changes: Changes): Promise<TransactionRow | null> {
  const { data, error } = await transactions()
    .update({ ...changes, status })
    .eq("tran_id", tranId)
    .in("status", [...allowedFrom(status)])
    .select()
    .maybeSingle();
  if (error) throw dbError("transition", error);
  return data as TransactionRow | null;
}

/** Records what PayWay said without changing the status. */
export async function annotate(tranId: string, changes: Changes): Promise<void> {
  const { error } = await transactions().update(changes).eq("tran_id", tranId);
  if (error) throw dbError("annotate", error);
}

/**
 * Keeps the first callback verbatim as evidence. Repeats leave it untouched,
 * except that a signed callback replaces an unsigned one.
 */
export async function storeCallback(
  tranId: string,
  payload: Record<string, unknown>,
  signature: "valid" | "missing",
): Promise<void> {
  const update = transactions()
    .update({ callback_payload: payload, callback_signature: signature, callback_received_at: new Date().toISOString() })
    .eq("tran_id", tranId);
  const { error } = await (signature === "valid"
    ? update.or("callback_signature.is.null,callback_signature.eq.missing")
    : update.is("callback_signature", null));
  if (error) throw dbError("store_callback", error);
}

function dbError(operation: string, error: PostgrestError): Error {
  return new Error(`database ${operation} failed: ${error.code} ${error.message}`);
}
