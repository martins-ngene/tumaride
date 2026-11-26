import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  BlockchainService,
  EscrowProofParams,
} from '../src/blockchain/blockchain.service';
import { IndexerService } from '../src/indexer/indexer.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createMockPrisma } from './mock-prisma';

const TX_FUND_1 = '1'.repeat(64);
const TX_ASSIGN_1 = '2'.repeat(64);
const TX_DELIVER_1 = '3'.repeat(64);
const TX_RELEASE_1 = '4'.repeat(64);
const TX_RELEASE_DUP = '5'.repeat(64);
const TX_FUND_2 = '6'.repeat(64);
const TX_ASSIGN_2 = '7'.repeat(64);
const TX_DELIVER_2 = '8'.repeat(64);
const TX_RELEASE_2 = '9'.repeat(64);
const TX_FUND_3 = 'a'.repeat(64);
const TX_REFUND_3 = 'b'.repeat(64);
const TX_REFUND_DUP = 'c'.repeat(64);
const TX_UNVERIFIED = 'f'.repeat(64);

describe('Tuma Ride Backend — End-to-End System & Regression Suite', () => {
  let app: INestApplication;
  let indexer: IndexerService;
  const mockPrisma = createMockPrisma();

  const verifiedTxs = new Map<
    string,
    { action: string; onChainDeliveryId: string; ledger: number }
  >();
  const preassignedOnChain = new Set<string>();

  const mockBlockchain = {
    network: 'TESTNET',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4',
    usdcTokenContractId:
      'CBIMG76HIG2UJDRT65WZ6KQITSGQQ4G5ANA4LAEOQUYYES3TTVKOKQF6',
    getExplorerTxUrl: (txHash: string) =>
      `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    getExplorerContractUrl: () =>
      'https://stellar.expert/explorer/testnet/contract/CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4',
    getConfig: () => ({
      network: 'TESTNET',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
      escrowContractId:
        'CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4',
      usdcTokenContractId:
        'CBIMG76HIG2UJDRT65WZ6KQITSGQQ4G5ANA4LAEOQUYYES3TTVKOKQF6',
      contractExplorerUrl:
        'https://stellar.expert/explorer/testnet/contract/CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4',
    }),
    verifyTransaction: async (txHash: string) => ({
      txHash,
      verified: verifiedTxs.has(txHash),
      status: verifiedTxs.has(txHash) ? 'SUCCESS' : 'NOT_FOUND',
      ledger: verifiedTxs.get(txHash)?.ledger,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    }),
    verifyEscrowAction: async (params: EscrowProofParams) => {
      const entry = verifiedTxs.get(params.txHash);
      const matched =
        !!entry &&
        entry.action === params.action &&
        entry.onChainDeliveryId === params.onChainDeliveryId.toString();
      return {
        txHash: params.txHash,
        verified: matched,
        status: matched ? 'SUCCESS' : 'PROOF_MISMATCH',
        ledger: entry?.ledger,
        explorerUrl: `https://stellar.expert/explorer/testnet/tx/${params.txHash}`,
        reason: matched
          ? undefined
          : `Unverified or mismatched Testnet proof for ${params.action}`,
      };
    },
    isRiderAssignedOnChain: async (
      onChainDeliveryId: bigint,
      riderWallet: string,
    ) => preassignedOnChain.has(`${onChainDeliveryId.toString()}:${riderWallet}`),
  };

  const customerKp = Keypair.random();
  const otherCustomerKp = Keypair.random();
  const riderKp = Keypair.random();
  const otherRiderKp = Keypair.random();

  let customerToken: string;
  let otherCustomerToken: string;
  let riderToken: string;
  let otherRiderToken: string;
  let riderUserId: string;

  let deliveryId: string;
  let onChainDeliveryId: string;
  let confirmationCode: string;

  async function loginWithWallet(
    kp: Keypair,
    role: 'CUSTOMER' | 'RIDER',
    fullName: string,
    useSep53 = true,
  ) {
    const challengeRes = await request(app.getHttpServer())
      .post('/api/auth/challenge')
      .send({ walletAddress: kp.publicKey() })
      .expect(201);

    const messageBuf = Buffer.from(challengeRes.body.message, 'utf8');
    const payloadToSign = useSep53
      ? crypto
          .createHash('sha256')
          .update('Stellar Signed Message:\n', 'utf8')
          .update(messageBuf)
          .digest()
      : messageBuf;
    const sig = kp.sign(payloadToSign).toString('base64');

    const verifyRes = await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({
        walletAddress: kp.publicKey(),
        nonce: challengeRes.body.nonce,
        signature: sig,
        role,
        fullName,
        vehicleType: role === 'RIDER' ? 'Motorbike' : undefined,
      })
      .expect(201);

    return {
      ...verifyRes.body,
      nonce: challengeRes.body.nonce,
      signature: sig,
    };
  }

  beforeAll(async () => {
    process.env.INDEXER_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(BlockchainService)
      .useValue(mockBlockchain)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    indexer = moduleRef.get(IndexerService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. GET /health and GET /api/blockchain/config return service and Testnet metadata', async () => {
    const health = await request(app.getHttpServer()).get('/health').expect(200);
    expect(health.body.status).toBe('ok');

    const cfg = await request(app.getHttpServer())
      .get('/api/blockchain/config')
      .expect(200);
    expect(cfg.body.network).toBe('TESTNET');
    expect(cfg.body.escrowContractId).toBe(mockBlockchain.contractId);
  });

  it('2. Rejects invalid signature and enforces single-use atomic nonce consumption for SEP-53 and raw Ed25519 auth', async () => {
    const challengeRes = await request(app.getHttpServer())
      .post('/api/auth/challenge')
      .send({ walletAddress: customerKp.publicKey() })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({
        walletAddress: customerKp.publicKey(),
        nonce: challengeRes.body.nonce,
        signature: Buffer.from('bad-signature').toString('base64'),
        role: 'CUSTOMER',
      })
      .expect(401);

    // SEP-53 login (Freighter format)
    const customerSession = await loginWithWallet(
      customerKp,
      'CUSTOMER',
      'Amina Okafor',
      true,
    );
    customerToken = customerSession.accessToken;
    expect(customerSession.user.role).toBe('CUSTOMER');

    // Replaying the same nonce must fail with 401
    await request(app.getHttpServer())
      .post('/api/auth/verify')
      .send({
        walletAddress: customerKp.publicKey(),
        nonce: customerSession.nonce,
        signature: customerSession.signature,
        role: 'CUSTOMER',
      })
      .expect(401);

    // Raw Ed25519 compatibility login
    const otherCustomer = await loginWithWallet(
      otherCustomerKp,
      'CUSTOMER',
      'Brian Otieno',
      false,
    );
    otherCustomerToken = otherCustomer.accessToken;

    const riderSession = await loginWithWallet(
      riderKp,
      'RIDER',
      'David Kamau',
      true,
    );
    riderToken = riderSession.accessToken;
    riderUserId = riderSession.user.id;

    const otherRiderSession = await loginWithWallet(
      otherRiderKp,
      'RIDER',
      'Grace Mensah',
      true,
    );
    otherRiderToken = otherRiderSession.accessToken;
  });

  it('3. Customer creates delivery and backend enforces strict delivery visibility rules', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/deliveries')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pickupAddress: 'Westlands Mall, Nairobi',
        dropoffAddress: 'Kilimani Junction, Nairobi',
        instructions: 'Call at Gate B',
        feeUsdc: '15.00',
      })
      .expect(201);

    deliveryId = res.body.id;
    onChainDeliveryId = res.body.onChainDeliveryId;
    confirmationCode = res.body.confirmationCode;
    expect(confirmationCode).toMatch(/^TUMA-\d{6}$/);

    // Owning customer can view
    await request(app.getHttpServer())
      .get(`/api/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    // Unrelated customer cannot view
    await request(app.getHttpServer())
      .get(`/api/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(403);

    // Rider cannot view an UNFUNDED delivery
    await request(app.getHttpServer())
      .get(`/api/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(403);
  });

  it('4. Requires verified Testnet proof for funding, supports idempotent retries, and opens funded visibility to riders', async () => {
    // Unverified hash rejected
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/fund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ txHash: TX_UNVERIFIED })
      .expect(400);

    // Register verified proof and fund
    verifiedTxs.set(TX_FUND_1, {
      action: 'fund',
      onChainDeliveryId,
      ledger: 1001,
    });
    const funded = await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/fund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ txHash: TX_FUND_1 })
      .expect(201);
    expect(funded.body.status).toBe('FUNDED');
    expect(funded.body.escrowStatus).toBe('LOCKED');
    expect(funded.body.transactions).toHaveLength(1);

    // Idempotent retry of same verified hash succeeds without duplicating records
    const retried = await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/fund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ txHash: TX_FUND_1 })
      .expect(201);
    expect(retried.body.transactions).toHaveLength(1);

    // Eligible rider can now view the funded open delivery (confirmationCode hidden)
    const riderView = await request(app.getHttpServer())
      .get(`/api/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);
    expect(riderView.body.confirmationCode).toBeUndefined();

    // Unrelated customer still gets 403
    await request(app.getHttpServer())
      .get(`/api/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(403);
  });

  it('5. Enforces rider availability on acceptance and requires verified Testnet proof', async () => {
    verifiedTxs.set(TX_ASSIGN_1, {
      action: 'assign',
      onChainDeliveryId,
      ledger: 1002,
    });

    // Rider marks themselves unavailable -> hidden from customer list & blocked from accepting
    await request(app.getHttpServer())
      .patch('/api/users/rider-profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ isAvailable: false })
      .expect(200);

    const availableRiders = await request(app.getHttpServer())
      .get('/api/users/riders')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(availableRiders.body.some((r: any) => r.id === riderUserId)).toBe(
      false,
    );

    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/accept`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ txHash: TX_ASSIGN_1 })
      .expect(403);

    // Rider turns availability back on
    await request(app.getHttpServer())
      .patch('/api/users/rider-profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ isAvailable: true })
      .expect(200);

    // Unverified txHash rejected
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/accept`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ txHash: TX_UNVERIFIED })
      .expect(400);

    // Verified txHash succeeds
    const accepted = await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/accept`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ txHash: TX_ASSIGN_1 })
      .expect(201);
    expect(accepted.body.status).toBe('ACCEPTED');
    expect(accepted.body.riderId).toBe(riderUserId);

    // Other rider can no longer view assigned delivery
    await request(app.getHttpServer())
      .get(`/api/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${otherRiderToken}`)
      .expect(403);
  });

  it('6. Rider progresses delivery and requires verified mark_delivered proof for DELIVERED', async () => {
    await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${otherRiderToken}`)
      .send({ status: 'PICKED_UP' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'PICKED_UP' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'IN_TRANSIT' })
      .expect(200);

    // Missing txHash for DELIVERED rejected
    await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'DELIVERED' })
      .expect(400);

    verifiedTxs.set(TX_DELIVER_1, {
      action: 'deliver',
      onChainDeliveryId,
      ledger: 1003,
    });

    const delivered = await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'DELIVERED', txHash: TX_DELIVER_1 })
      .expect(200);
    expect(delivered.body.status).toBe('DELIVERED');
  });

  it('7. Confirm & release requires valid code + verified Testnet proof, allows idempotent retry, and rejects duplicate settlement', async () => {
    // Late cancel rejected
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Too late', refundTxHash: TX_REFUND_3 })
      .expect(400);

    // Missing releaseTxHash rejected (no synthetic hashes)
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode })
      .expect(400);

    // Invalid confirmation code rejected
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode: 'TUMA-000000', releaseTxHash: TX_RELEASE_1 })
      .expect(400);

    // Unverified releaseTxHash rejected
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode, releaseTxHash: TX_UNVERIFIED })
      .expect(400);

    // Verified releaseTxHash succeeds
    verifiedTxs.set(TX_RELEASE_1, {
      action: 'release',
      onChainDeliveryId,
      ledger: 1004,
    });
    const confirmed = await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode, releaseTxHash: TX_RELEASE_1 })
      .expect(201);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(confirmed.body.escrowStatus).toBe('RELEASED');
    expect(confirmed.body.releaseTxHash).toBe(TX_RELEASE_1);

    // Idempotent retry with same verified hash returns 201 without duplicating
    const retried = await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode, releaseTxHash: TX_RELEASE_1 })
      .expect(201);
    expect(retried.body.transactions).toHaveLength(2); // 1 FUND + 1 RELEASE

    // Duplicate settlement attempt with different hash rejected with 409
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode, releaseTxHash: TX_RELEASE_DUP })
      .expect(409);
  });

  it('8. Indexer-first reconciliation agrees identically with API retries on status, transactions, and activity', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/deliveries')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pickupAddress: 'Karen, Nairobi',
        dropoffAddress: 'Upper Hill, Nairobi',
        feeUsdc: '20.00',
      })
      .expect(201);

    const d2Id = created.body.id;
    const d2ChainId = created.body.onChainDeliveryId;
    const d2Code = created.body.confirmationCode;

    verifiedTxs.set(TX_FUND_2, {
      action: 'fund',
      onChainDeliveryId: d2ChainId,
      ledger: 2001,
    });
    verifiedTxs.set(TX_ASSIGN_2, {
      action: 'assign',
      onChainDeliveryId: d2ChainId,
      ledger: 2002,
    });
    verifiedTxs.set(TX_DELIVER_2, {
      action: 'deliver',
      onChainDeliveryId: d2ChainId,
      ledger: 2003,
    });
    verifiedTxs.set(TX_RELEASE_2, {
      action: 'release',
      onChainDeliveryId: d2ChainId,
      ledger: 2004,
    });

    // Indexer sees escrow_funded BEFORE API call
    await indexer.reconcileEvent({
      topic: ['escrow_funded_event', d2ChainId],
      txHash: TX_FUND_2,
      ledger: 2001,
    });

    // API retry of funding agrees idempotently
    const fundedAfterIndexer = await request(app.getHttpServer())
      .post(`/api/deliveries/${d2Id}/fund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ txHash: TX_FUND_2 })
      .expect(201);
    expect(fundedAfterIndexer.body.escrowStatus).toBe('LOCKED');
    expect(fundedAfterIndexer.body.transactions).toHaveLength(1);

    // Rider accepts & marks delivered
    await request(app.getHttpServer())
      .post(`/api/deliveries/${d2Id}/accept`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ txHash: TX_ASSIGN_2 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/deliveries/${d2Id}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'DELIVERED', txHash: TX_DELIVER_2 })
      .expect(200);

    // Indexer sees payment_released BEFORE customer API confirm call
    await indexer.reconcileEvent({
      topic: ['payment_released_event', d2ChainId],
      txHash: TX_RELEASE_2,
      ledger: 2004,
    });

    // Customer API confirm call with same verified txHash reconciles idempotently
    const confirmedAfterIndexer = await request(app.getHttpServer())
      .post(`/api/deliveries/${d2Id}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode: d2Code, releaseTxHash: TX_RELEASE_2 })
      .expect(201);

    expect(confirmedAfterIndexer.body.status).toBe('CONFIRMED');
    expect(confirmedAfterIndexer.body.escrowStatus).toBe('RELEASED');
    expect(confirmedAfterIndexer.body.transactions).toHaveLength(2);
    const confirmedActivities = confirmedAfterIndexer.body.activities.filter(
      (a: any) => a.status === 'CONFIRMED',
    );
    expect(confirmedActivities).toHaveLength(1);
  });

  it('9. Funded cancellation requires verified refund proof (no synthetic hashes), supports idempotent retry, and rejects duplicate refunds', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/deliveries')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pickupAddress: 'CBD, Nairobi',
        dropoffAddress: 'Lavington, Nairobi',
        feeUsdc: '10.00',
      })
      .expect(201);

    const d3Id = created.body.id;
    const d3ChainId = created.body.onChainDeliveryId;

    verifiedTxs.set(TX_FUND_3, {
      action: 'fund',
      onChainDeliveryId: d3ChainId,
      ledger: 3001,
    });
    verifiedTxs.set(TX_REFUND_3, {
      action: 'refund',
      onChainDeliveryId: d3ChainId,
      ledger: 3002,
    });

    await request(app.getHttpServer())
      .post(`/api/deliveries/${d3Id}/fund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ txHash: TX_FUND_3 })
      .expect(201);

    // Missing refundTxHash rejected
    await request(app.getHttpServer())
      .post(`/api/deliveries/${d3Id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Missing hash' })
      .expect(400);

    // Unverified refundTxHash rejected
    await request(app.getHttpServer())
      .post(`/api/deliveries/${d3Id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Bad hash', refundTxHash: TX_UNVERIFIED })
      .expect(400);

    // Verified refund succeeds
    const refunded = await request(app.getHttpServer())
      .post(`/api/deliveries/${d3Id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Recipient unavailable', refundTxHash: TX_REFUND_3 })
      .expect(201);
    expect(refunded.body.status).toBe('REFUNDED');
    expect(refunded.body.escrowStatus).toBe('REFUNDED');

    // Idempotent retry with same hash succeeds
    await request(app.getHttpServer())
      .post(`/api/deliveries/${d3Id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Retry', refundTxHash: TX_REFUND_3 })
      .expect(201);

    // Different refund hash rejected with 409
    await request(app.getHttpServer())
      .post(`/api/deliveries/${d3Id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Duplicate', refundTxHash: TX_REFUND_DUP })
      .expect(409);

    // Unfunded delivery cancellation succeeds without refundTxHash
    const unfunded = await request(app.getHttpServer())
      .post('/api/deliveries')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pickupAddress: 'Yaya Centre',
        dropoffAddress: 'Gigiri',
        feeUsdc: '8.00',
      })
      .expect(201);

    const cancelledUnfunded = await request(app.getHttpServer())
      .post(`/api/deliveries/${unfunded.body.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Changed mind before funding' })
      .expect(201);
    expect(cancelledUnfunded.body.status).toBe('CANCELLED');
    expect(cancelledUnfunded.body.escrowStatus).toBe('UNFUNDED');
  });

  it('10. Role-based dashboards, RBAC, and transaction history return accurate non-duplicated metrics', async () => {
    const custDash = await request(app.getHttpServer())
      .get('/api/users/dashboard/customer')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(custDash.body.summary.totalDeliveries).toBe(4);
    expect(custDash.body.summary.completedDeliveries).toBe(2);
    expect(custDash.body.summary.cancelledOrRefunded).toBe(2);
    expect(custDash.body.summary.totalSettledUsdc).toBe('35.00');

    const riderDash = await request(app.getHttpServer())
      .get('/api/users/dashboard/rider')
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);
    expect(riderDash.body.summary.completedDeliveries).toBe(2);
    expect(riderDash.body.summary.totalEarnedUsdc).toBe('35.00');
    expect(riderDash.body.user.riderProfile.completedDeliveries).toBe(2);

    // Customer cannot access Rider dashboard
    await request(app.getHttpServer())
      .get('/api/users/dashboard/rider')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    const txHistory = await request(app.getHttpServer())
      .get('/api/deliveries/transactions/history')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    // 3 FUND + 2 RELEASE + 1 REFUND = 6 unique verified txs
    expect(txHistory.body).toHaveLength(6);
    expect(txHistory.body[0].explorerUrl).toContain(
      'https://stellar.expert/explorer/testnet/tx/',
    );
  });
});
