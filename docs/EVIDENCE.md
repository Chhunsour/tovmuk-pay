# ABA PayWay sandbox evidence

Live demo domain: **https://pay.tovmuksolution.com/**. These attempts were made on 28 September 2026 through the deployed site, using ABA's sandbox `generate-qr` endpoint and `Check transaction` API. The QR request omitted `callback_url`; no callback was received for either attempt. The separate submission evidence package contains the screenshots, redacted database records, and selected redacted API log events.

| Amount | Transaction ID | ABA Generate QR | ABA Check transaction | Stored result |
| --- | --- | --- | --- | --- |
| 1 KHR | `TP260928013317288BLB` | HTTP 400, code `04`, “The given data was invalid.” No QR issued. | HTTP 200, code `6`, “tran_id not found.” | `failed` |
| 2,000 KHR | `TP260928013522T28IQQ` | HTTP 200, code `0`; ABA returned a KHQR PNG. | HTTP 200, code `00`, `PENDING`, original and total amount 2,000 KHR. | `pending` at capture time |

The 1 KHR response does not identify which field was invalid, so the exact rejection reason is unconfirmed. The stored row's `payway_code` became `6` after a later status check; the original QR rejection code `04` is in the saved API events. This is a record-keeping improvement to make before production use.

The 2,000 KHR transaction was accepted and found by the merchant API, but no payer-app authorization or `APPROVED` result was observed. A screenshot of an ABA-issued QR is evidence of generation, not payment completion. ABA must confirm the payer sandbox setup if its app cannot find the transaction. The QR expires after the configured payment window, so generate a new one for a later phone scan.

## Evidence files supplied separately

- `screenshots/1-khr-form.png`, `screenshots/1-khr-status.png`
- `screenshots/2000-khr-form.png`, `screenshots/2000-khr-aba-qr.png`, `screenshots/2000-khr-status.png`
- `records/1-khr-db-redacted.json`, `records/2000-khr-db-redacted.json`
- `records/1-khr-api-events.json`, `records/2000-khr-api-events.json`
- `01-1-khr-evidence.md`, `02-2000-khr-evidence.md`, `03-callbacks.md`

The account number and demo sender name are redacted in the exported database records. The API key and RSA private key are not included in Git or the evidence package.
