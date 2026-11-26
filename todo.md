# Tuma Ride MVP — Backend & Smart Contract Task Checklist

**Ownership Scope**: Soroban Delivery Escrow Smart Contract, NestJS Backend API & Event Indexer, Stellar Testnet & Render Cloud Deployment, Frontend Integration Handshake.

---

## Phase 0: Workspace & Scaffolding
- [x] Initialize monorepo structure (`contracts/`, `apps/backend/`, `packages/shared/`)
- [x] Configure root `package.json`, TypeScript configs, `.gitignore`, `.env.example`, `AGENTS.md`, and `RESUME.md`
- [x] Setup `packages/shared` with shared types, delivery/escrow status enums, and DTO interfaces

## Phase 1: Soroban Delivery Escrow Contract (`contracts/delivery-escrow`)
- [x] Initialize Soroban Rust crate with `soroban-sdk` v28
- [x] Implement storage layout (`EscrowRecord`, `EscrowStatus`, `DataKey`) and error/event modules
- [x] Implement `initialize(admin, usdc_token)`
- [x] Implement `fund_escrow` locking simulated USDC on-chain
- [x] Implement `assign_rider` for rider assignment/acceptance
- [x] Implement `mark_delivered` and `confirm_and_release` with confirmation code hash verification & state-before-transfer duplicate-settlement guard
- [x] Implement `cancel_and_refund` for eligible cancellations with refund transfer & duplicate-settlement guard
- [x] Emit structured contract events (`EscrowFundedEvent`, `RiderAssignedEvent`, `DeliveryCompletedEvent`, `PaymentReleasedEvent`, `EscrowRefundedEvent`)
- [x] Implement comprehensive automated unit test suite (`src/test.rs` — 10/10 passing)

## Phase 2: Stellar Testnet Deployment & Verification
- [x] Compile optimized WASM (`stellar contract build` -> `delivery_escrow.wasm`, 10,037 bytes)
- [x] Generate and fund Testnet deployer, customer, and rider accounts via Friendbot
- [x] Deploy simulated USDC SAC (`CBIMG76HIG2UJDRT65WZ6KQITSGQQ4G5ANA4LAEOQUYYES3TTVKOKQF6`) and Delivery Escrow contract (`CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4`)
- [x] Execute live Testnet invocations (fund -> assign -> deliver -> confirm/release, duplicate-settlement rejection, fund -> cancel/refund)
- [x] Record contract ID, WASM hash, and verifiable Stellar Expert transaction hashes

## Phase 3: Backend API, Database & Event Indexer (`apps/backend`)
- [x] Scaffold NestJS + TypeScript backend
- [x] Configure PostgreSQL schema via Prisma ORM (`User`, `WalletNonce`, `RiderProfile`, `DeliveryRequest`, `DeliveryActivity`, `EscrowTransaction`, `SyncState`)
- [x] Implement SEP-0010 wallet challenge/verify authentication and JWT session management
- [x] Implement Customer & Rider registration, role-based dashboard endpoints, rider profiles, and delivery history
- [x] Implement Delivery Request CRUD, rider listing/assignment, and rider acceptance workflows
- [x] Implement delivery status tracking, unique confirmation code generation/verification, and activity timeline
- [x] Implement Stellar payment status & transaction reference endpoints
- [x] Build Soroban RPC event indexer service to reconcile on-chain escrow events into PostgreSQL
- [x] Setup Swagger/OpenAPI interactive documentation at `/docs`
- [x] Implement in-memory mock store and 17 automated system & regression tests (`vitest run` — 17/17 passing)
- [x] Add production entrypoint (`scripts/start-production.js`) and smoke test (`scripts/smoke-test.js`)
- [x] Containerize backend with multi-stage `Dockerfile` and `docker-compose.yml`

## Phase 4: Frontend Handshake & Integration Assets
- [x] Build and verify `packages/shared` TypeScript exports
- [x] Author `HANDSHAKE.md` mapping all 9 Key Screens to REST endpoints, payloads, and client-side Soroban signing flows

## Phase 5: Technical Report, CI/CD Pipeline & Deployment
- [x] Configure `render.yaml` Blueprint with dedicated paid PostgreSQL (`tumaride-db`, `basic-256mb` / 0.1 CPU, 1 GB disk)
- [x] Create GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml`)
- [x] Generate `TECHNICAL_REPORT.md` with Testnet contract ID, verifiable transaction hashes, explorer links, and test matrix
- [x] Document local containerization in `LOCAL_DOCKER.md`
- [x] Finalize `README.md` with developer setup and architecture documentation
- [x] Verify the original backend and contract deliverables. The remaining app-wide MVP checks are tracked below.

## Frontend MVVM Foundation
- [x] Set up feature-based Model, ViewModel, and View layers in the Next.js frontend.
- [x] Wire the home placeholder through MVVM and document the pattern for upcoming screens.
- [x] Verify ESLint, TypeScript, and a Webpack production build.
- [x] Build the core customer and rider screens and connect the live workspace views.

## Frontend Design Foundations
- [x] Self-host Manrope and add the design guide's palette and typography tokens.
- [x] Apply the theme to the home placeholder and document UI copy conventions.
- [x] Verify ESLint, TypeScript, Tailwind theme compilation, and a Webpack production build.

## Onboarding and Authentication UI
- [x] Build the splash, three intro slides, role selection, customer and rider forms, and completion screens.
- [x] Preview sign-in and registration locally with form validation and dashboard handoff.
- [x] Verify desktop and mobile navigation and asset loading in Chrome, and run the Turbopack production build.
- [x] Connect wallet sign-in through Freighter. Manual Testnet verification is tracked below.

## Role-Aware Dashboard UI
- [x] Build the customer overview and My Deliveries screens from Figma.
- [x] Reuse the dashboard shell for the rider overview and My Jobs.
- [x] Connect the browser-only onboarding preview role to both dashboard routes.
- [x] Add delivery filters, search, pagination, and detail previews.
- [x] Connect verified identity and delivery data. Remaining status refresh work is tracked below.

## Customer and Rider Wallet UI
- [x] Add Wallet & Escrow and Rider Earnings & Wallet to the shared dashboard.
- [x] Build the local escrow lock, delivery confirmation, and payment release preview.
- [x] Add transaction history, details, filters, search, pagination, and CSV export.
- [x] Verify both roles in Chrome, including mobile layout, and run the frontend production build.
- [x] Connect Testnet escrow signing and transaction history.

## Rider Dashboard and Find Deliveries
- [x] Connect the Rider Dashboard to nearby requests and the map.
- [x] Build search, distance and fee filters, sorting, and map selection.
- [x] Add request review, decline, acceptance, tracking, and the My Jobs handoff.
- [x] Verify the role guard, offline availability, desktop and mobile interactions, and production build.
- [x] Connect funded open requests, rider acceptance, and delivery status updates.

## Rider My Jobs and Activity
- [x] Open the active trip and accepted discovery requests from My Jobs.
- [x] Connect rider transaction history to the existing Earnings wallet.
- [x] Add Rider Profile & Settings with local save, discard, availability, notification, and payout wallet controls.
- [x] Verify rider flows in desktop and mobile Chrome and run frontend lint, TypeScript, and production build.

## Frontend API Integration
- [x] Audit the handshake against the NestJS routes and Soroban escrow contract.
- [x] Wire wallet Testnet contract configuration and explorer links to the existing public API.
- [x] Verify the config client's success and fallback paths against a local HTTP stand-in.
- [x] Verify wallet signature compatibility and restore authenticated sessions.
- [x] Load authenticated lists and supported profile fields from the API.
- [x] Connect escrow signing, full confirmation codes, and pending-hash reconciliation in the frontend.

## Freighter Authentication
- [x] Install the Freighter SDK and wire Testnet connection, challenge signing, and verification.
- [x] Store verified access tokens in an HttpOnly cookie and restore dashboard identity from `/auth/me`.
- [x] Exercise the signature rejection and compatible-success paths with a local backend stand-in and Chrome.
- [x] Enable backend SEP-53 verification while preserving raw Ed25519 compatibility.
- [x] Verify atomic nonce consumption and run the auth flow on local NestJS and PostgreSQL.

## Live Screen Mapping
- [x] Connect authenticated customer and rider overview, delivery history, and rider discovery to the API.
- [x] Connect customer request creation, rider lookup, detail timeline, and unfunded cancellation.
- [x] Connect rider pickup and in-transit updates and supported customer/rider profile fields.
- [x] Connect escrow transaction history, transaction lookup, and Testnet explorer references.
- [x] Verify confirmed envelopes at the frontend API boundary and retain pending transaction hashes for reconciliation.
- [x] Wire frontend Wallets Kit and Soroban calls for funding, assignment/acceptance, marking delivered, release, and funded refunds, including preassigned rider handling.


## Remaining MVP Gaps

### Customer and rider workflows
- [ ] Make the rider availability setting meaningful in the live flow. It already controls the customer’s rider list, but an unavailable rider can still accept a request. Enforce the same rule on acceptance or remove the acceptance implication from the UI.
- [ ] Add a refresh action for the selected delivery and its activity timeline. Customers should see rider progress, and riders should see settlement after customer confirmation without reopening the whole workspace.
- [ ] Document a repeatable two-wallet Freighter Testnet run, including the XLM and simulated USDC setup. Complete sign-in, create, fund, accept, pick up, deliver, and release in the browser. Verify funded cancellation/refund and recovery after leaving a transaction pending.

### API and escrow release checks
- [ ] Enforce delivery visibility in the backend. Allow the owning customer, assigned rider, and eligible riders browsing funded open requests.
- [ ] Require verified Testnet proof in the backend before recording escrow actions. Remove synthetic release and refund hashes from the live path. Make API retries and indexer reconciliation agree on status, transaction history, and activity, including when the indexer sees the transaction first.
- [ ] Confirm the backend auth and delivery regression suite is present and passes before release. The current checkout shows the previous system suite and mock Prisma files removed.

### Outside this MVP
Use Freighter sign-in, address-based discovery, manual delivery status updates,
and escrow transaction history. Defer Google/email sign-in, maps and live GPS,
ETAs and distance matching, messaging, notifications, document uploads, saved
addresses, wallet balances and standalone deposit/send/withdraw flows.
