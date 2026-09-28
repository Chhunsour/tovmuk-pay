# Test transaction evidence

Local ABA sandbox run on 27 September 2026, with no custom callback:

| Amount | Purchase result | App result |
| --- | --- | --- |
| 1 KHR | HTTP 403, code 3: Invalid Transaction Amount | Failed; transaction ID retained for review |
| 2,000 KHR | HTTP 200, code 00: QR returned | Transaction `TP260927155156Q2VR3U` cancelled after the payment window expired without a payer scan |
| 2,000 KHR | Purchase API returned QR and ABA Mobile deep link | The ABA sandbox app reported “Invalid QR” for transaction `TP260927161430IHU51S` |
| 2,000 KHR | Generate QR API returned ABA KHQR (`abapay_khqr`) | Transaction `TP260927163130T2T9T5` generated successfully; payer result not confirmed |
| 2,000 KHR | Generate QR API returned ABA PAY (`abapay`) | ABA sandbox app reported “transition not found” for `TP2609271634479DTKU5`; PayWay Check transaction returned HTTP 200, code 00, `PENDING`, amount 2,000 KHR |

The app checks status with PayWay's Check transaction API. No approved sandbox payment has been observed. ABA's sandbox payer app needs to recognize the merchant transaction before this can be completed.

Live-domain check on 28 September 2026: `https://pay.tovmuksolution.com/` generated ABA's `abapay_khqr` PNG for `TP260928011904WVU5M1` (2,000 KHR). The transfer page then showed PayWay status `PENDING (2)` for that transaction. Payer-app authorization has not yet been observed.

## Public-domain capture checklist

Transfers started from https://pay.tovmuksolution.com after ABA confirms the domain whitelist:

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
