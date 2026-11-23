# Workspace Agent Guidelines — Tuma Ride Backend & Smart Contracts

Welcome to the **Tuma Ride** backend and smart contract workspace. This document establishes the operational directives, architectural standards, security rules, and development conventions for this project.

---

## 1. Git Version Control: User-Only Manual Add, Commit, and Push

- **NEVER run `git add`, `git commit`, `git push`, or any command that stages, commits, or pushes changes**.
- **The USER must always be the one to manually add, commit, and push changes** so that they review all work before it is committed or published.
- Agents may run read-only git inspection commands (`git status`, `git diff`, `git log`) to verify working tree status, but **MUST NEVER** stage, commit, or push under any circumstances.

---

## 2. Zero-Tolerance Rule: Do NOT Touch or Access `.env` Files

- **Never touch, open, read, inspect, display, edit, or modify any `.env` file** (`.env`, `.env.local`, `.env.production`, etc.).
- Never log, print, output, or echo environment file contents.
- **Allowed Exception**: `.env.example` templates containing only dummy/placeholder values.

---

## 3. Scope & Team Responsibilities

- **Backend & Smart Contracts Scope (Our Scope)**:
  - **Soroban Delivery Escrow Contract (`contracts/delivery-escrow`)**: Simulated USDC escrow locking, rider assignment, authorized delivery confirmation release (unique confirmation code), eligible cancellation & refund, duplicate-settlement prevention, and structured contract events.
  - **Smart Contract Testing**: Comprehensive automated unit tests (`contracts/delivery-escrow/src/test.rs`) covering all positive, negative, cancellation, authorization, and duplicate-settlement scenarios.
  - **Stellar Testnet Deployment**: WASM compilation, contract deployment, initialization, and live verifiable Testnet invocations.
  - **NestJS Backend API (`apps/backend`)**: SEP-0010 wallet challenge/verify authentication, Customer & Rider registration and role-based dashboards, Delivery Request lifecycle management, confirmation code generation & verification, activity/transaction history, and background Soroban RPC event indexer.
  - **PostgreSQL & Prisma ORM**: Off-chain profiles, delivery requests, status/activity timeline, cached escrow/payment states, and notifications.
  - **Infrastructure**: Dedicated paid PostgreSQL (`tumaride-db`, `basic-256mb` / 0.1 CPU, 1 GB disk) in Render Blueprint (`render.yaml`), multi-stage Dockerization (`docker-compose.yml`), and GitHub Actions CI.
- **Frontend Scope (External / Handed Off to Frontend Team)**:
  - Maintained by the Frontend Engineer and UI/UX Designer.
  - We maintain `HANDSHAKE.md`, `packages/shared`, and interactive Swagger OpenAPI documentation at `/docs` as the authoritative integration contract for the frontend team.

---

## 4. Architectural & Security Mandates

- **Smart Contracts (Soroban SDK)**:
  - Always enforce `require_auth()` on transaction callers.
  - **Reentrancy & Duplicate-Settlement Guard**: Transition escrow status to `Released` or `Refunded` and commit state changes to storage *before* calling external token transfers. Any subsequent release or refund attempt MUST fail with an explicit error.
  - **Authorized Delivery Confirmation**: Escrow release requires both valid authorization and a matching delivery confirmation code hash (or authorized customer confirmation) so funds cannot be claimed prematurely or twice.
  - **Cancellation & Refund Eligibility**: Refunds are permitted only when the delivery is in an eligible pre-completion state; completed or already-settled escrows cannot be refunded.
  - Target Network: **Stellar Testnet**.
- **Backend & Data Privacy**:
  - **Zero Private Key Custody**: The backend never accepts, generates, or stores customer or rider private keys. All transaction signing occurs client-side via Stellar Wallets Kit.
  - **Dual-State Reconciliation**: Off-chain queries are served from PostgreSQL and reconciled against confirmed on-chain events via the background Soroban RPC indexer.
  - **Database Migration Guard**: Any unattended `prisma db push` command must include `--accept-data-loss` in production startup scripts (`scripts/start-production.js`) to prevent non-interactive deployment aborts.
  - **Render Cloud Deployment**: Provision dedicated paid PostgreSQL (`tumaride-db`, plan `basic-256mb` / 0.1 CPU, 1 GB disk) in `render.yaml`.
- **API Documentation**:
  - Maintain interactive Swagger / OpenAPI 3.0 documentation at `/docs`.

---

## 5. Continuity & Mandatory Checkpoints

- **Mandatory `RESUME.md` Checkpoint Rule**: After completing **any phase, milestone, testnet deployment, or test suite verification**, you **MUST** update `RESUME.md` alongside `todo.md` **before ending the turn**. `RESUME.md` and `**/RESUME.md` MUST remain gitignored by default in `.gitignore` so it is never staged, committed, or pushed.
- Maintain `todo.md` to track sprint progress and deliverables.
- Maintain `TECHNICAL_REPORT.md` as the verified technical report with Stellar Testnet contract IDs, transaction hashes, explorer links, and test matrix.
