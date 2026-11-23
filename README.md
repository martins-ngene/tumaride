# Tuma Ride — Delivery Management Platform with Soroban Escrow

Tuma Ride connects customers and delivery riders with non-custodial Stellar wallet authentication and trustless simulated USDC escrow settlement via a Soroban smart contract on **Stellar Testnet**.

## Repository Structure

```text
tumaride/
├── contracts/delivery-escrow/   # Rust / Soroban delivery escrow smart contract
├── apps/backend/                # NestJS + Prisma + PostgreSQL API & Soroban RPC indexer
├── packages/shared/             # Shared TypeScript enums & DTO interfaces (@tumaride/shared)
├── HANDSHAKE.md                 # Authoritative Frontend Integration Contract
├── TECHNICAL_REPORT.md          # Verified Stellar Testnet tx hashes & 27/27 test matrix
├── LOCAL_DOCKER.md              # Local Docker Compose setup guide
├── render.yaml                  # Render Blueprint (API + dedicated paid PostgreSQL 16)
└── docker-compose.yml           # Local containerized NestJS + PostgreSQL stack
```

## Deployed Stellar Testnet Contracts

- **Delivery Escrow Contract:** `CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4` ([Explorer](https://stellar.expert/explorer/testnet/contract/CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4))
- **Simulated USDC SAC:** `CBIMG76HIG2UJDRT65WZ6KQITSGQQ4G5ANA4LAEOQUYYES3TTVKOKQF6` ([Explorer](https://stellar.expert/explorer/testnet/contract/CBIMG76HIG2UJDRT65WZ6KQITSGQQ4G5ANA4LAEOQUYYES3TTVKOKQF6))

## Developer Quick Start

### 1. Install & Build Workspaces
```bash
npm install
npm --prefix packages/shared run build
npm --prefix apps/backend run prisma:generate
npm --prefix apps/backend run build
```

### 2. Run Automated Tests (27 / 27)
```bash
# Soroban Smart Contract (10 tests)
npm run contract:test

# NestJS Backend System & Regression Suite (17 tests)
npm run backend:test
```

### 3. Run Locally
Copy `.env.example` to `.env`, configure `DATABASE_URL`, and start the API:
```bash
npm run backend:dev
```
- **API:** `http://localhost:4000/api`
- **Swagger / OpenAPI Docs:** `http://localhost:4000/docs`
- **Health Check:** `http://localhost:4000/health`

Or run the full containerized stack with PostgreSQL 16:
```bash
docker compose up --build
```
