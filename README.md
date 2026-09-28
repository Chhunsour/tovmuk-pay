# Tovmuk Pay — ABA PayWay Integration

A deployed KHR payment integration built for the ABA PayWay Back-End Developer practical assessment.

The application collects:

- Sender name
- Account number
- Amount in KHR

It validates the payment server-side, creates a unique transaction, sends a signed request to ABA PayWay, stores the transaction, and verifies the final result through PayWay.

## Live Application

**URL:** https://pay.tovmuksolution.com

I used my own domain instead of `khmerfp.com`.

## Tech Stack

- Next.js 16
- TypeScript
- Vercel
- Supabase PostgreSQL
- ABA PayWay API

No third-party PayWay SDK is used.

The PayWay integration logic is implemented directly from the official ABA PayWay documentation.

Main integration code:

`src/lib/payway.ts`

---

## Payment Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant DB as Supabase
    participant ABA as ABA PayWay

    User->>App: Enter name, account number, amount
    App->>App: Validate input server-side
    App->>DB: Create pending transaction
    App->>ABA: Signed PayWay request
    ABA-->>User: PayWay checkout / QR
    ABA->>App: Callback
    App->>ABA: Check transaction status
    App->>DB: Update transaction
    ABA-->>User: Return to application
