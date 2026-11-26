# Tuma Ride — Repeatable Two-Wallet Freighter Testnet Runbook

This runbook walks through a full, repeatable two-wallet browser verification of **Tuma Ride** on **Stellar Testnet** (including XLM funding, simulated USDC setup, happy-path escrow release, funded cancellation/refund, and pending-transaction recovery).

---

## 1. Testnet Contract & Token Constants

| Resource | Value |
| --- | --- |
| **Network** | Stellar Testnet (`Test SDF Network ; September 2015`) |
| **Soroban RPC** | `https://soroban-testnet.stellar.org` |
| **Delivery Escrow Contract** | `CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4` |
| **Simulated USDC SAC** | `CBIMG76HIG2UJDRT65WZ6KQITSGQQ4G5ANA4LAEOQUYYES3TTVKOKQF6` |
| **Simulated USDC Issuer** | `GC3TJ4GJFN3N4HUZGVTGKBHQGXI44LZDGP7C67P4WW5EZWPAZTGFY2GD` |
| **Live Backend API** | `https://tumaride-backend.onrender.com/api` (Swagger: `/docs`) |

---

## 2. Two-Wallet Freighter Setup (XLM + Simulated USDC)

1. Open **Freighter** in two separate browser profiles (e.g., Chrome Profile A = **Customer**, Chrome Profile B = **Rider**) and switch both to **Testnet**.
2. Copy both G-addresses (`CUSTOMER_G` and `RIDER_G`) and fund both accounts with Testnet XLM via Friendbot:
   ```bash
   curl -s "https://friendbot.stellar.org/?addr=${CUSTOMER_G}" > /dev/null
   curl -s "https://friendbot.stellar.org/?addr=${RIDER_G}" > /dev/null
   ```
3. Add a trustline for `USDC` issued by `GC3TJ4GJFN3N4HUZGVTGKBHQGXI44LZDGP7C67P4WW5EZWPAZTGFY2GD` in **both** Freighter wallets (Freighter → Manage Assets → Add Asset → Code: `USDC`, Issuer: `GC3TJ4GJFN3N4HUZGVTGKBHQGXI44LZDGP7C67P4WW5EZWPAZTGFY2GD`).
4. Mint simulated USDC (e.g., `200 USDC` = `2000000000` stroops) to the Customer wallet using the `tumaride-admin` Stellar CLI key:
   ```bash
   stellar contract invoke \
     --id CBIMG76HIG2UJDRT65WZ6KQITSGQQ4G5ANA4LAEOQUYYES3TTVKOKQF6 \
     --source tumaride-admin \
     --network testnet \
     -- mint --to "${CUSTOMER_G}" --amount 2000000000
   ```

---

## 3. Happy-Path Two-Wallet Browser Walkthrough

1. **Sign-In (Both Profiles):**
   - Profile A: Connect Freighter, choose **Customer**, sign the SEP-53 challenge, and land on `/dashboard`.
   - Profile B: Connect Freighter, choose **Rider**, sign the SEP-53 challenge, and confirm **Available for requests** is checked in **Rider profile & settings**.
2. **Create Delivery (Customer):**
   - Click **New delivery**, enter pickup, drop-off, instructions, and fee (e.g. `15.00`), then click **Create request**.
   - Expand **Show delivery confirmation code** and note the `TUMA-XXXXXX` code.
3. **Lock Escrow (Customer):**
   - Click **Fund escrow** and approve the `fund_escrow` transaction in Freighter.
   - Verify status updates to **Funded** (`Escrow locked`) and a `FUND` transaction appears in **Wallet & escrow** with a live Stellar Expert link.
4. **Accept & Progress Delivery (Rider):**
   - In Profile B → **Find deliveries**, select the funded delivery and click **Accept delivery** (approve `assign_rider` in Freighter).
   - *(Optional availability check)*: Toggle **Available for requests** off in Profile B → **Rider profile & settings** and confirm acceptance is blocked both in UI and backend (`403 Forbidden`), then turn availability back on.
   - Open the delivery in **My jobs**, click **Mark picked up**, then **Start trip** (`IN_TRANSIT`), then **Mark delivered** (approve `mark_delivered` in Freighter).
5. **Refresh & Confirm Release (Customer → Rider):**
   - In Profile A, keep the Delivery details panel open and click **Refresh** — verify status updates to **Delivered** and the activity timeline shows pickup, transit, and delivered events without reloading the workspace.
   - Enter the `TUMA-XXXXXX` confirmation code, click **Confirm & release payment**, and approve `confirm_and_release` in Freighter.
   - In Profile B, click **Refresh** on the Delivery details panel — verify status updates to **Confirmed** (`Escrow released`) and the `RELEASE` transaction appears in **Earnings & wallet**.

---

## 4. Funded Cancellation & Refund Check

1. In Profile A, create a second delivery (e.g. `10.00 USDC`) and click **Fund escrow** (approve in Freighter).
2. Before any rider marks it delivered, click **Cancel & refund**, confirm the prompt, and approve `cancel_and_refund` in Freighter.
3. Verify status updates to **Refunded** (`Escrow refunded`) and the `REFUND` transaction is verifiable on Stellar Expert.

---

## 5. Pending-Transaction Recovery Check

1. Initiate an escrow action (e.g. **Fund escrow** or **Confirm & release payment**) and approve in Freighter, then intentionally interrupt the browser tab or disconnect network before the `/api/escrow/:id` `record` phase completes.
2. Reopen the delivery details panel — the UI detects the saved pending hash in local storage and displays **Resume escrow action**.
3. Click **Resume escrow action** (re-entering the confirmation code if resuming `release`). The backend verifies the on-chain Testnet proof (or reconciles idempotently if the Soroban RPC indexer already processed it) and clears the pending state without duplicating transactions or activity entries.
