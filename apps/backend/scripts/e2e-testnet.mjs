#!/usr/bin/env node
import { execSync } from 'child_process';
import crypto from 'crypto';
import {
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  rpc as SorobanRpc,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4001/api';
const RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const PASSPHRASE =
  process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const CONTRACT_ID =
  process.env.TUMARIDE_ESCROW_CONTRACT_ID ||
  'CB7KRT357CZNYU3XEPAX26SHM37QGJW75Z3RVUGRSKMFUOZSKLZQ7PJ4';

const rpc = new SorobanRpc.Server(RPC_URL);
const contract = new Contract(CONTRACT_ID);

function getKeypair(alias) {
  const secret = execSync(`stellar keys secret ${alias}`, {
    encoding: 'utf8',
  }).trim();
  return Keypair.fromSecret(secret);
}

async function api(path, { method = 'GET', token, body, expectedStatus } = {}) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (expectedStatus && res.status !== expectedStatus) {
    throw new Error(
      `${method} /${path} expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(json)}`,
    );
  }
  if (!expectedStatus && !res.ok) {
    throw new Error(
      `${method} /${path} failed (${res.status}): ${JSON.stringify(json)}`,
    );
  }
  return { status: res.status, data: json };
}

async function signInSep53(kp, role, fullName) {
  const { data: challenge } = await api('auth/challenge', {
    method: 'POST',
    body: { walletAddress: kp.publicKey() },
  });
  const digest = crypto
    .createHash('sha256')
    .update('Stellar Signed Message:\n', 'utf8')
    .update(Buffer.from(challenge.message, 'utf8'))
    .digest();
  const signature = kp.sign(digest).toString('base64');
  const { data: session } = await api('auth/verify', {
    method: 'POST',
    body: {
      walletAddress: kp.publicKey(),
      nonce: challenge.nonce,
      signature,
      role,
      fullName,
      ...(role === 'RIDER' ? { vehicleType: 'Electric Bike', licensePlate: 'KME 482X' } : {}),
    },
  });
  return session;
}

async function submitSorobanOp(kp, operation) {
  const account = await rpc.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(kp);
  const sent = await rpc.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    throw new Error(`Soroban sendTransaction ERROR: ${JSON.stringify(sent.errorResult)}`);
  }

  for (let i = 0; i < 30; i++) {
    const rpcRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: { hash: sent.hash },
      }),
    });
    const payload = await rpcRes.json();
    const res = payload.result || { status: 'NOT_FOUND' };
    if (res.status === 'SUCCESS') {
      return { hash: sent.hash, ledger: res.ledger };
    }
    if (res.status === 'FAILED') {
      throw new Error(`Soroban tx ${sent.hash} FAILED`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for tx ${sent.hash}`);
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g).map((b) => parseInt(b, 16)));
}

async function main() {
  const customerKp = getKeypair('tumaride-customer');
  const riderKp = getKeypair('tumaride-rider');
  const proofs = {};

  console.log('1. SEP-53 Sign-in for Customer & Rider...');
  const custSession = await signInSep53(customerKp, 'CUSTOMER', 'Amina Okafor');
  const riderSession = await signInSep53(riderKp, 'RIDER', 'David Kamau');
  console.log(`   Customer: ${custSession.user.walletAddress}`);
  console.log(`   Rider:    ${riderSession.user.walletAddress}`);

  console.log('2. Create Delivery A (12.00 USDC) & check unfunded visibility guard...');
  const { data: deliveryA } = await api('deliveries', {
    method: 'POST',
    token: custSession.accessToken,
    body: {
      pickupAddress: 'Westlands Mall, Nairobi',
      dropoffAddress: 'Kilimani Junction, Nairobi',
      instructions: 'Call on arrival at Gate B',
      feeUsdc: '12.00',
    },
  });
  await api(`deliveries/${deliveryA.id}`, {
    token: riderSession.accessToken,
    expectedStatus: 403,
  });
  console.log(`   Created ${deliveryA.id} (onChainId=${deliveryA.onChainDeliveryId}, code=${deliveryA.confirmationCode})`);

  console.log('3. Fund Delivery A on Stellar Testnet & verify idempotent retry...');
  const fundA = await submitSorobanOp(
    customerKp,
    contract.call(
      'fund_escrow',
      nativeToScVal(BigInt(deliveryA.onChainDeliveryId), { type: 'u64' }),
      new Address(customerKp.publicKey()).toScVal(),
      xdr.ScVal.scvVoid(),
      nativeToScVal(BigInt(deliveryA.feeStroops), { type: 'i128' }),
      nativeToScVal(hexToBytes(deliveryA.confirmationCodeHash)),
    ),
  );
  proofs.deliveryA_fund = fundA.hash;
  await api(`deliveries/${deliveryA.id}/fund`, {
    method: 'POST',
    token: custSession.accessToken,
    body: { txHash: fundA.hash },
  });
  // Idempotent retry (pending-tx recovery)
  await api(`deliveries/${deliveryA.id}/fund`, {
    method: 'POST',
    token: custSession.accessToken,
    body: { txHash: fundA.hash },
    expectedStatus: 201,
  });
  console.log(`   Funded TX: https://stellar.expert/explorer/testnet/tx/${fundA.hash}`);

  console.log('4. Enforce Rider Availability (403 when offline) & Accept on Testnet...');
  await api('users/rider-profile', {
    method: 'PATCH',
    token: riderSession.accessToken,
    body: { isAvailable: false },
  });
  const assignA = await submitSorobanOp(
    riderKp,
    contract.call(
      'assign_rider',
      nativeToScVal(BigInt(deliveryA.onChainDeliveryId), { type: 'u64' }),
      new Address(riderKp.publicKey()).toScVal(),
      new Address(riderKp.publicKey()).toScVal(),
    ),
  );
  proofs.deliveryA_accept = assignA.hash;
  await api(`deliveries/${deliveryA.id}/accept`, {
    method: 'POST',
    token: riderSession.accessToken,
    body: { txHash: assignA.hash },
    expectedStatus: 403,
  });
  await api('users/rider-profile', {
    method: 'PATCH',
    token: riderSession.accessToken,
    body: { isAvailable: true },
  });
  await api(`deliveries/${deliveryA.id}/accept`, {
    method: 'POST',
    token: riderSession.accessToken,
    body: { txHash: assignA.hash },
  });
  console.log(`   Accept TX: https://stellar.expert/explorer/testnet/tx/${assignA.hash}`);

  console.log('5. Rider progresses PICKED_UP -> IN_TRANSIT -> DELIVERED (on-chain)...');
  await api(`deliveries/${deliveryA.id}/status`, {
    method: 'PATCH',
    token: riderSession.accessToken,
    body: { status: 'PICKED_UP', note: 'Collected parcel at Westlands Mall' },
  });
  await api(`deliveries/${deliveryA.id}/status`, {
    method: 'PATCH',
    token: riderSession.accessToken,
    body: { status: 'IN_TRANSIT', note: 'En route to Kilimani Junction' },
  });
  const deliverA = await submitSorobanOp(
    riderKp,
    contract.call(
      'mark_delivered',
      nativeToScVal(BigInt(deliveryA.onChainDeliveryId), { type: 'u64' }),
    ),
  );
  proofs.deliveryA_deliver = deliverA.hash;
  await api(`deliveries/${deliveryA.id}/status`, {
    method: 'PATCH',
    token: riderSession.accessToken,
    body: {
      status: 'DELIVERED',
      note: 'Handed parcel to recipient',
      txHash: deliverA.hash,
    },
  });
  console.log(`   Delivered TX: https://stellar.expert/explorer/testnet/tx/${deliverA.hash}`);

  console.log('6. Customer confirms with unique code & releases payment on Testnet...');
  const releaseA = await submitSorobanOp(
    customerKp,
    contract.call(
      'confirm_and_release',
      nativeToScVal(BigInt(deliveryA.onChainDeliveryId), { type: 'u64' }),
      nativeToScVal(new TextEncoder().encode(deliveryA.confirmationCode)),
    ),
  );
  proofs.deliveryA_release = releaseA.hash;
  await api(`deliveries/${deliveryA.id}/confirm`, {
    method: 'POST',
    token: custSession.accessToken,
    body: {
      confirmationCode: deliveryA.confirmationCode,
      releaseTxHash: releaseA.hash,
    },
  });
  // Idempotent retry + Duplicate settlement 409 check
  await api(`deliveries/${deliveryA.id}/confirm`, {
    method: 'POST',
    token: custSession.accessToken,
    body: {
      confirmationCode: deliveryA.confirmationCode,
      releaseTxHash: releaseA.hash,
    },
    expectedStatus: 201,
  });
  await api(`deliveries/${deliveryA.id}/confirm`, {
    method: 'POST',
    token: custSession.accessToken,
    body: {
      confirmationCode: deliveryA.confirmationCode,
      releaseTxHash: '9'.repeat(64),
    },
    expectedStatus: 409,
  });
  console.log(`   Released TX: https://stellar.expert/explorer/testnet/tx/${releaseA.hash}`);

  console.log('7. Create Delivery B (8.00 USDC) -> Fund -> Eligible Cancel & Refund on Testnet...');
  const { data: deliveryB } = await api('deliveries', {
    method: 'POST',
    token: custSession.accessToken,
    body: {
      pickupAddress: 'CBD, Nairobi',
      dropoffAddress: 'Lavington, Nairobi',
      instructions: 'Fragile parcel',
      feeUsdc: '8.00',
    },
  });
  const fundB = await submitSorobanOp(
    customerKp,
    contract.call(
      'fund_escrow',
      nativeToScVal(BigInt(deliveryB.onChainDeliveryId), { type: 'u64' }),
      new Address(customerKp.publicKey()).toScVal(),
      xdr.ScVal.scvVoid(),
      nativeToScVal(BigInt(deliveryB.feeStroops), { type: 'i128' }),
      nativeToScVal(hexToBytes(deliveryB.confirmationCodeHash)),
    ),
  );
  proofs.deliveryB_fund = fundB.hash;
  await api(`deliveries/${deliveryB.id}/fund`, {
    method: 'POST',
    token: custSession.accessToken,
    body: { txHash: fundB.hash },
  });
  const refundB = await submitSorobanOp(
    customerKp,
    contract.call(
      'cancel_and_refund',
      nativeToScVal(BigInt(deliveryB.onChainDeliveryId), { type: 'u64' }),
    ),
  );
  proofs.deliveryB_refund = refundB.hash;
  await api(`deliveries/${deliveryB.id}/cancel`, {
    method: 'POST',
    token: custSession.accessToken,
    body: { reason: 'Recipient unavailable', refundTxHash: refundB.hash },
  });
  console.log(`   Funded B TX:   https://stellar.expert/explorer/testnet/tx/${fundB.hash}`);
  console.log(`   Refunded B TX: https://stellar.expert/explorer/testnet/tx/${refundB.hash}`);

  console.log('\n=== LIVE TWO-WALLET TESTNET E2E PASSED ===');
  console.log(JSON.stringify(proofs, null, 2));
}

main().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
