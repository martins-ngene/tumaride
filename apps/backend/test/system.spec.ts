import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createMockPrisma } from './mock-prisma';

describe('Tuma Ride Backend — End-to-End System & Regression Suite', () => {
  let app: INestApplication;
  const mockPrisma = createMockPrisma();

  const customerKp = Keypair.random();
  const riderKp = Keypair.random();
  const otherRiderKp = Keypair.random();

  let customerToken: string;
  let riderToken: string;
  let otherRiderToken: string;
  let riderUserId: string;
  let deliveryId: string;
  let confirmationCode: string;
  let cancelDeliveryId: string;

  async function loginWithWallet(
    kp: Keypair,
    role: 'CUSTOMER' | 'RIDER',
    fullName: string,
  ) {
    const challengeRes = await request(app.getHttpServer())
      .post('/api/auth/challenge')
      .send({ walletAddress: kp.publicKey() })
      .expect(201);

    const sig = kp
      .sign(Buffer.from(challengeRes.body.message, 'utf8'))
      .toString('base64');

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

    return verifyRes.body;
  }

  beforeAll(async () => {
    process.env.INDEXER_ENABLED = 'false';
    process.env.TUMARIDE_ESCROW_CONTRACT_ID =
      'CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. GET /health returns service status and Testnet contract config', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('tumaride-backend');
  });

  it('2. GET /api/blockchain/config exposes Stellar Testnet & contract metadata', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/blockchain/config')
      .expect(200);
    expect(res.body.network).toBe('TESTNET');
    expect(res.body.escrowContractId).toBe(
      'CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4',
    );
  });

  it('3. Rejects invalid Stellar wallet signature during SEP-0010 login', async () => {
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
  });

  it('4. Registers Customer and Riders via cryptographic Stellar wallet authentication', async () => {
    const customerSession = await loginWithWallet(
      customerKp,
      'CUSTOMER',
      'Amina Okafor',
    );
    customerToken = customerSession.accessToken;
    expect(customerSession.user.role).toBe('CUSTOMER');

    const riderSession = await loginWithWallet(
      riderKp,
      'RIDER',
      'David Kamau',
    );
    riderToken = riderSession.accessToken;
    riderUserId = riderSession.user.id;
    expect(riderSession.user.role).toBe('RIDER');
    expect(riderSession.user.riderProfile.isAvailable).toBe(true);

    const otherRiderSession = await loginWithWallet(
      otherRiderKp,
      'RIDER',
      'Grace Mensah',
    );
    otherRiderToken = otherRiderSession.accessToken;
  });

  it('5. Lists available riders and allows rider profile updates', async () => {
    const ridersRes = await request(app.getHttpServer())
      .get('/api/users/riders')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(ridersRes.body.length).toBe(2);

    const patchRes = await request(app.getHttpServer())
      .patch('/api/users/rider-profile')
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ vehicleType: 'Electric Bike', licensePlate: 'KME 482X' })
      .expect(200);
    expect(patchRes.body.vehicleType).toBe('Electric Bike');
  });

  it('6. Customer creates a delivery request with unique confirmation code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/deliveries')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pickupAddress: 'Westlands Mall, Nairobi',
        dropoffAddress: 'Kilimani Junction, Nairobi',
        instructions: 'Call on arrival at Gate B',
        feeUsdc: '15.00',
      })
      .expect(201);

    deliveryId = res.body.id;
    confirmationCode = res.body.confirmationCode;
    expect(res.body.status).toBe('CREATED');
    expect(res.body.escrowStatus).toBe('UNFUNDED');
    expect(res.body.feeStroops).toBe('150000000');
    expect(confirmationCode).toMatch(/^TUMA-\d{6}$/);
    expect(res.body.confirmationCodeHash).toHaveLength(64);
  });

  it('7. Rider cannot accept an unfunded delivery request', async () => {
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/accept`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({})
      .expect(400);
  });

  it('8. Customer funds delivery escrow with simulated USDC txHash', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/fund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        txHash:
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      })
      .expect(201);

    expect(res.body.status).toBe('FUNDED');
    expect(res.body.escrowStatus).toBe('LOCKED');
    expect(res.body.transactions).toHaveLength(1);
  });

  it('9. Rider accepts funded delivery and hides confirmation code from rider view', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/accept`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({})
      .expect(201);

    expect(res.body.status).toBe('ACCEPTED');
    expect(res.body.riderId).toBe(riderUserId);
    expect(res.body.confirmationCode).toBeUndefined();
  });

  it('10. Unassigned rider cannot update delivery status', async () => {
    await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${otherRiderToken}`)
      .send({ status: 'IN_TRANSIT' })
      .expect(403);
  });

  it('11. Assigned rider updates status through PICKED_UP -> IN_TRANSIT -> DELIVERED', async () => {
    await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'PICKED_UP', note: 'Collected package' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'IN_TRANSIT', note: 'En route to Kilimani' })
      .expect(200);

    const deliveredRes = await request(app.getHttpServer())
      .patch(`/api/deliveries/${deliveryId}/status`)
      .set('Authorization', `Bearer ${riderToken}`)
      .send({ status: 'DELIVERED', note: 'Handed to recipient' })
      .expect(200);

    expect(deliveredRes.body.status).toBe('DELIVERED');
  });

  it('12. Rejects cancellation once delivery is marked DELIVERED', async () => {
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Changed mind late' })
      .expect(400);
  });

  it('13. Rejects delivery confirmation with invalid confirmation code', async () => {
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode: 'TUMA-000000' })
      .expect(400);
  });

  it('14. Customer confirms delivery with valid code and releases escrow payment', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        confirmationCode,
        releaseTxHash:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      })
      .expect(201);

    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.escrowStatus).toBe('RELEASED');
    expect(res.body.releaseTxHash).toBe(
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
  });

  it('15. Rejects duplicate settlement on an already confirmed delivery', async () => {
    await request(app.getHttpServer())
      .post(`/api/deliveries/${deliveryId}/confirm`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ confirmationCode })
      .expect(409);
  });

  it('16. Eligible cancellation on a funded delivery triggers refund and rejects duplicate refund', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/deliveries')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        pickupAddress: 'CBD, Nairobi',
        dropoffAddress: 'Lavington, Nairobi',
        feeUsdc: '10.00',
      })
      .expect(201);

    cancelDeliveryId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/deliveries/${cancelDeliveryId}/fund`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        txHash:
          'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      })
      .expect(201);

    const refundRes = await request(app.getHttpServer())
      .post(`/api/deliveries/${cancelDeliveryId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        reason: 'Recipient unavailable',
        refundTxHash:
          'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      })
      .expect(201);

    expect(refundRes.body.status).toBe('REFUNDED');
    expect(refundRes.body.escrowStatus).toBe('REFUNDED');

    // Duplicate refund rejected
    await request(app.getHttpServer())
      .post(`/api/deliveries/${cancelDeliveryId}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Try twice' })
      .expect(409);
  });

  it('17. Role-based dashboards and transaction history return accurate metrics', async () => {
    const custDash = await request(app.getHttpServer())
      .get('/api/users/dashboard/customer')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(custDash.body.summary.totalDeliveries).toBe(2);
    expect(custDash.body.summary.completedDeliveries).toBe(1);
    expect(custDash.body.summary.cancelledOrRefunded).toBe(1);
    expect(custDash.body.summary.totalSettledUsdc).toBe('15.00');

    const riderDash = await request(app.getHttpServer())
      .get('/api/users/dashboard/rider')
      .set('Authorization', `Bearer ${riderToken}`)
      .expect(200);
    expect(riderDash.body.summary.completedDeliveries).toBe(1);
    expect(riderDash.body.summary.totalEarnedUsdc).toBe('15.00');

    // Customer cannot access Rider dashboard (RBAC)
    await request(app.getHttpServer())
      .get('/api/users/dashboard/rider')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    const txHistory = await request(app.getHttpServer())
      .get('/api/deliveries/transactions/history')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(txHistory.body.length).toBe(4); // 2 FUND + 1 RELEASE + 1 REFUND
    expect(txHistory.body[0].explorerUrl).toContain(
      'https://stellar.expert/explorer/testnet/tx/',
    );
  });
});
