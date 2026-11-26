# Tuma Ride — Frontend Integration Handshake (`HANDSHAKE.md`)

This document is the authoritative integration contract between the **Tuma Ride Backend & Soroban Smart Contract** and the **Frontend Application**.

- **Interactive Swagger / OpenAPI Docs:** `GET /docs`
- **Health Probe:** `GET /health`
- **Shared TypeScript Types:** `packages/shared/src/index.ts` (`@tumaride/shared`)

---

## 1. Stellar Testnet & Soroban Contract Configuration

Fetch live network parameters dynamically from `GET /api/blockchain/config`:

| Parameter | Value |
| --- | --- |
| **Network** | `TESTNET` |
| **Network Passphrase** | `Test SDF Network ; September 2015` |
| **Soroban RPC URL** | `https://soroban-testnet.stellar.org` |
| **Delivery Escrow Contract ID** | `CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4` |
| **Simulated USDC Token SAC** | `CBIMG76HIG2UJDRT65WZ6KQITSGQQ4G5ANA4LAEOQUYYES3TTVKOKQF6` |
| **Contract Explorer** | https://stellar.expert/explorer/testnet/contract/CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4 |

> **Zero Private Key Custody:** The backend never receives or stores private keys. All wallet authentication challenges and Soroban contract invocations must be signed client-side via **Stellar Wallets Kit** (Freighter, xBull, Albedo, Lobstr).

---

## 2. Authentication Flow (SEP-0010 Style Wallet Sign-In)

1. `POST /api/auth/challenge` with `{ walletAddress: "G..." }` -> returns `{ nonce, message, expiresAt }`.
2. Sign `message` client-side with Freighter and send the base64 Ed25519 SEP-53 signature. The verifier also accepts signatures over the raw UTF-8 bytes for existing clients.
3. `POST /api/auth/verify` with `{ walletAddress, nonce, signature, role?: "CUSTOMER" | "RIDER", fullName?, phone?, email?, vehicleType?, licensePlate? }` -> returns `{ accessToken, user }`.
4. Include `Authorization: Bearer <accessToken>` on all protected requests.

The frontend connects through the Freighter browser extension using
`@stellar/freighter-api@6.0.1`. It checks Stellar Testnet, requests the challenge,
and sends the signature through a same-origin frontend route. The frontend
server keeps the backend token in an HttpOnly cookie and calls `GET /api/auth/me`
to restore identity and role. The current API can create a customer account if
an unknown wallet signs in without a role.

The verifier checks the wallet address, signature, and challenge expiry.
A successful challenge is consumed atomically and can be used only once.

---

## 3. Mapping Key Screens to API Endpoints & Contract Calls

| Key Screen | Primary REST Endpoints | On-Chain Soroban Call (Client-Signed) |
| --- | --- | --- |
| **1. Customer Dashboard** | `GET /api/users/dashboard/customer` | — |
| **2. Rider Dashboard** | `GET /api/users/dashboard/rider`, `PATCH /api/users/rider-profile` | — |
| **3. Create Delivery Request** | `POST /api/deliveries`, `GET /api/users/riders` | — (returns `onChainDeliveryId`, `feeStroops`, `confirmationCode`, `confirmationCodeHash`) |
| **4. Delivery Details** | `GET /api/deliveries/:id` | `get_escrow(delivery_id)` (optional read) |
| **5. Rider Assignment & Acceptance** | `POST /api/deliveries/:id/assign` (Customer), `POST /api/deliveries/:id/accept` (Rider) | `assign_rider(delivery_id, actor, rider)` |
| **6. Delivery Tracking** | `PATCH /api/deliveries/:id/status` (`PICKED_UP`, `IN_TRANSIT`, `DELIVERED`) | `mark_delivered(delivery_id)` (signed by Rider when marking `DELIVERED`) |
| **7. Wallet & Escrow Payment** | `POST /api/deliveries/:id/fund`, `GET /api/blockchain/config` | `fund_escrow(delivery_id, customer, rider?, amount, confirmation_hash)` |
| **8. Delivery Confirmation** | `POST /api/deliveries/:id/confirm`, `POST /api/deliveries/:id/cancel` | `confirm_and_release(delivery_id, confirmation_code)` or `cancel_and_refund(delivery_id)` |
| **9. Transaction History** | `GET /api/deliveries/transactions/history`, `GET /api/blockchain/tx/:hash` | Explorer links returned per transaction |

---

## 4. End-to-End Client-Side Escrow Signing Lifecycle

1. **Create Request:** Customer calls `POST /api/deliveries` with `pickupAddress`, `dropoffAddress`, `instructions`, and `feeUsdc` (e.g. `"15.00"`). Response includes `onChainDeliveryId`, `feeStroops` (`"150000000"`), `confirmationCode` (`"TUMA-123456"` — visible only to the customer), and `confirmationCodeHash` (32-byte SHA-256 hex).
2. **Lock Escrow:** Customer wallet invokes `fund_escrow(delivery_id, customer, rider_option, fee_stroops, confirmation_hash)` on `CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4`, then submits `{ txHash }` to `POST /api/deliveries/:id/fund`.
3. **Accept & Deliver:** Rider accepts via `assign_rider` + `POST /api/deliveries/:id/accept`, updates status through `PICKED_UP` -> `IN_TRANSIT`, then invokes `mark_delivered(delivery_id)` + `PATCH /api/deliveries/:id/status` (`DELIVERED`).
4. **Confirm & Release:** Customer enters the unique `confirmationCode`, signs `confirm_and_release(delivery_id, confirmation_code_bytes)` on-chain, and submits `{ confirmationCode, releaseTxHash }` to `POST /api/deliveries/:id/confirm`. Duplicate settlement attempts are rejected both on-chain (`EscrowError::AlreadySettled`) and in the API (`409 Conflict`).
5. **Eligible Cancellation & Refund:** Before `DELIVERED`, the customer can sign `cancel_and_refund(delivery_id)` and submit `{ reason, refundTxHash }` to `POST /api/deliveries/:id/cancel` to recover locked simulated USDC.

## 5. Frontend Integration Notes

Set the frontend server process variable `TUMARIDE_API_URL` to the API base,
including `/api`. The local default is `http://localhost:4000/api`. The wallet
reads `GET /api/blockchain/config` for the Testnet escrow contract and displays
its explorer link when configuration is available. Balances, escrow actions,
and transaction references in the current UI are still preview data.

| Flow | Available in the backend | Integration work to resolve |
| --- | --- | --- |
| Session and role | `GET /api/auth/me`; challenge and verify described above | Wallet sessions restore the role from the verified user. The verifier supports Freighter SEP-53 and existing raw Ed25519 clients. Google and email/password flows have no provider endpoints. |
| Delivery lists | `GET /api/deliveries` scopes results to the caller. Riders can request funded open work with `?openOnly=true`. | Map API status and escrow status to the UI filters. Distance, pickup radius, ETA, and live location are preview values without a defined location source. |
| Profiles | `GET /api/users/profile`, `PATCH /api/users/profile`, and `PATCH /api/users/rider-profile` | Wire supported fields first. Saved addresses, notification preferences, document uploads, and passwords need additional contracts. |
| Assignment | `assign_rider(delivery_id, actor, rider)` authorizes the customer or the selected rider. | Pass the signing wallet as `actor`. If funding or a customer assignment already selected the rider on-chain, the rider's API acceptance does not require a second on-chain assignment. |
| Confirmation | The backend returns a customer-only `TUMA-123456`-style code and hashes the code's UTF-8 bytes. | Accept the full code in the live UI. Pass its UTF-8 bytes to the contract and send the same code with the release transaction hash. The preview's six-digit code is a fixture. |
| Refunds | The contract permits refunds only while its escrow state is `Funded`. | Gate live cancellation on the on-chain state as well as API eligibility. |
| Wallet and history | Configuration, escrow transaction history, and transaction lookup are available. | Live token balances and wallet-native deposits, sends, and withdrawals need a wallet or Stellar read/write integration. Keep references to submitted transactions available for API reconciliation and retries. |
