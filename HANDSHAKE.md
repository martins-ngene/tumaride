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
2. Sign `message` UTF-8 bytes client-side with the connected Stellar wallet (base64 Ed25519 signature).
3. `POST /api/auth/verify` with `{ walletAddress, nonce, signature, role?: "CUSTOMER" | "RIDER", fullName?, phone?, email?, vehicleType?, licensePlate? }` -> returns `{ accessToken, user }`.
4. Include `Authorization: Bearer <accessToken>` on all protected requests.

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
