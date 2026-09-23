// Prints the stored record and the raw callback PayWay sent for one
// transaction, ready to paste into the exam evidence.
//
//   pnpm evidence TP260925101500ABC123
//
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local. Nothing here
// contains the PayWay API key: it is never stored in the database.
export {};

const tranId = process.argv[2] ?? "";
if (!/^[A-Z0-9]{1,20}$/.test(tranId)) {
  console.error("usage: pnpm evidence <tran_id>");
  process.exit(1);
}

const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/transactions?tran_id=eq.${tranId}&select=*`, {
  headers: { apikey: process.env.SUPABASE_SECRET_KEY ?? "" },
});
if (!res.ok) {
  console.error(`Supabase returned HTTP ${res.status}`);
  process.exit(1);
}
const [row] = await res.json();
if (!row) {
  console.error(`No transaction ${tranId}`);
  process.exit(1);
}

const { callback_payload: callback, ...record } = row;
console.log(`### Stored record: ${tranId}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`);
console.log(
  callback
    ? `### Callback payload received (${row.callback_signature} X-PAYWAY-HMAC-SHA512 signature, ${row.callback_received_at})\n\n\`\`\`json\n${JSON.stringify(callback, null, 2)}\n\`\`\``
    : "### No callback received for this transaction",
);
