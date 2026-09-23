# Test transaction evidence

Two real transfers, both started from https://pay.tovmuksolution.com (not a script or cURL):

| # | Amount | Transaction ID | Result |
| --- | --- | --- | --- |
| 1 | 1 KHR | | |
| 2 | 2,000 KHR | | |

## Capture checklist, per transaction

1. **Form filled in, before submitting.** Screenshot the Send page with the three fields filled in, or the *Confirm transfer* dialog.
2. **Transaction ID.** Shown in the dialog after *Confirm*, on the transfer details page (with a copy button), and in the *Last transfer* bar on the Send page.
3. **PayWay checkout page.** Screenshot it before paying.
4. **Our result page after the redirect:** `/transfer/<tran_id>`. PayWay returns the browser there through `/api/payway/return`.
5. **Raw callback payload and stored database row.** Run:
   ```bash
   pnpm evidence <tran_id>
   ```
   This prints the row and the callback exactly as received. The PayWay API key is never stored, so there is nothing to redact. The Supabase Table Editor (`transactions` table) shows the same row.
6. **Log lines.** In the Vercel dashboard → Logs, search for the transaction ID. Every event is one JSON line:
   - `payway.purchase.signed`
   - `payway.callback.received`
   - `payway.check.request` / `payway.check.response`
   - `transaction.status_changed`
   - `payway.return`

If a transaction fails, keep its evidence too: the PayWay response, the status page and the stored row. Write down what happened and what changed.

## Transaction 1: 1 KHR

- Transaction ID:
- Screenshots: form · PayWay checkout · result page
- Callback payload:
- Stored record:
- Notes:

## Transaction 2: 2,000 KHR

- Transaction ID:
- Screenshots: form · PayWay checkout · result page
- Callback payload:
- Stored record:
- Notes:
