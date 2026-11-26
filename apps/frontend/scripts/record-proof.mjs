#!/usr/bin/env node
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { Keypair } from '@stellar/stellar-sdk';

const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve('playwright', {
    paths: [
      process.cwd(),
      '/Users/martinium-dev/projects/buildershq-projects/ticketchain/ticketchain-frontend/node_modules',
    ],
  }),
);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4001/api';
const DOCS_URL = process.env.DOCS_URL || 'http://127.0.0.1:4001/docs';

const outDir = path.resolve(process.cwd(), 'apps/frontend/public/recordings');
const shotsDir = path.join(outDir, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });

function getKeypair(alias) {
  const secret = execSync(`stellar keys secret ${alias}`, {
    encoding: 'utf8',
  }).trim();
  return Keypair.fromSecret(secret);
}

async function signInSep53(alias, role, fullName) {
  const kp = getKeypair(alias);
  const cRes = await fetch(`${API_BASE}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: kp.publicKey() }),
  });
  const challenge = await cRes.json();
  const digest = crypto
    .createHash('sha256')
    .update('Stellar Signed Message:\n', 'utf8')
    .update(Buffer.from(challenge.message, 'utf8'))
    .digest();
  const signature = kp.sign(digest).toString('base64');

  const vRes = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress: kp.publicKey(),
      nonce: challenge.nonce,
      signature,
      role,
      fullName,
    }),
  });
  const session = await vRes.json();
  if (!session?.accessToken) {
    throw new Error(`Failed to sign in ${alias}: ${JSON.stringify(session)}`);
  }
  return session.accessToken;
}

async function pause(ms = 2200) {
  return new Promise((r) => setTimeout(r, ms));
}

async function showCaption(page, text) {
  await page
    .evaluate((label) => {
      let el = document.getElementById('tumaride-demo-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'tumaride-demo-caption';
        Object.assign(el.style, {
          position: 'fixed',
          bottom: '22px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: '2147483647',
          background: 'rgba(8, 12, 18, 0.90)',
          color: '#f1f5f9',
          border: '1px solid rgba(16, 185, 129, 0.55)',
          borderRadius: '999px',
          padding: '10px 22px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '15px',
          fontWeight: '600',
          letterSpacing: '0.01em',
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        });
        document.body.appendChild(el);
      }
      el.textContent = label;
      el.style.display = 'block';
    }, text)
    .catch(() => {});
}

async function hideCaption(page) {
  await page
    .evaluate(() => {
      const el = document.getElementById('tumaride-demo-caption');
      if (el) el.style.display = 'none';
    })
    .catch(() => {});
}

async function smoothScroll(page, y) {
  await page
    .evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y)
    .catch(() => {});
  await pause(1200);
}

async function snap(page, filename, caption, holdMs = 2600) {
  await hideCaption(page);
  await pause(350);
  await page.screenshot({ path: path.join(shotsDir, filename), fullPage: false });
  console.log(`  [shot] ${filename}`);
  if (caption) await showCaption(page, caption);
  await pause(holdMs);
}

async function main() {
  console.log('Authenticating Customer & Rider via real SEP-53...');
  const customerToken = await signInSep53(
    'tumaride-customer',
    'CUSTOMER',
    'Amina Okafor',
  );
  const riderToken = await signInSep53(
    'tumaride-rider',
    'RIDER',
    'David Kamau',
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: outDir,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  // 1. Onboarding screens (human-paced)
  console.log('Recording Onboarding & Auth screens...');
  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
  await snap(
    page,
    '01_onboarding_splash.png',
    'Step 1 · Tuma Ride Onboarding & Stellar Delivery Escrow',
    2800,
  );

  for (let step = 0; step < 3; step++) {
    const nextBtn = page
      .locator('button', { hasText: /Next|Get Started|Continue|Skip/i })
      .first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await pause(1300);
    }
  }
  await snap(
    page,
    '02_onboarding_role_selection.png',
    'Step 2 · Role Selection — Customer vs Delivery Rider',
    2600,
  );

  const customerRoleBtn = page
    .locator('button', { hasText: /Customer/i })
    .first();
  if (await customerRoleBtn.isVisible().catch(() => false)) {
    await customerRoleBtn.click();
    await pause(1200);
    const continueBtn = page
      .locator('button', { hasText: /Continue|Next/i })
      .first();
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click();
      await pause(1200);
    }
  }
  await snap(
    page,
    '03_onboarding_wallet_auth.png',
    'Step 3 · Non-Custodial Freighter Wallet Sign-In (SEP-53)',
    2600,
  );

  // 2. Customer Live Workspace
  console.log('Recording Customer Live Workspace...');
  await context.addCookies([
    {
      name: 'tumaride_session',
      value: customerToken,
      url: FRONTEND_URL,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);

  await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 10000 });
  await snap(
    page,
    '04_customer_dashboard_overview.png',
    'Step 4 · Customer Dashboard — Live Deliveries & Settled USDC',
    3000,
  );

  // Open New Delivery form with readable human-speed typing
  const newDeliveryBtn = page.locator('button', { hasText: 'New delivery' });
  if (await newDeliveryBtn.isVisible().catch(() => false)) {
    await newDeliveryBtn.click();
    await pause(1000);
    await showCaption(page, 'Step 5 · Creating a New Delivery Request');
    await page
      .locator('input[name="pickupAddress"]')
      .pressSequentially('Sarit Centre, Westlands', { delay: 45 });
    await pause(400);
    await page
      .locator('input[name="dropoffAddress"]')
      .pressSequentially('Yaya Centre, Kilimani', { delay: 45 });
    await pause(400);
    await page
      .locator('textarea[name="instructions"]')
      .pressSequentially('Leave with reception desk; call on arrival', {
        delay: 35,
      });
    await pause(400);
    await page
      .locator('input[name="feeUsdc"]')
      .pressSequentially('14.50', { delay: 80 });
    await snap(
      page,
      '05_customer_create_delivery_form.png',
      'Step 5 · Delivery Details, Instructions & USDC Fee Entered',
      2600,
    );

    await page.locator('button', { hasText: 'Create request' }).click();
    await pause(1600);
    await smoothScroll(page, 260);

    const summaryEl = page.locator('summary', {
      hasText: /Show delivery confirmation code/i,
    });
    if (await summaryEl.isVisible().catch(() => false)) {
      await summaryEl.click();
      await pause(1000);
    }
    await snap(
      page,
      '06_customer_created_delivery_code_and_fund.png',
      'Step 6 · Unique Confirmation Code Generated & Ready to Fund Escrow',
      3000,
    );
  }

  // My Deliveries + Confirmed Timeline + Refresh + Refunded State
  await page.goto(`${FRONTEND_URL}/dashboard/deliveries`, {
    waitUntil: 'networkidle',
  });
  await snap(
    page,
    '07_customer_my_deliveries_list.png',
    'Step 7 · Customer My Deliveries — Search & Status History',
    2600,
  );

  const confirmedRow = page
    .locator('button', { hasText: /Confirmed/i })
    .first();
  if (await confirmedRow.isVisible().catch(() => false)) {
    await confirmedRow.click();
    await pause(1200);
    await smoothScroll(page, 320);
    await snap(
      page,
      '08_customer_confirmed_delivery_timeline.png',
      'Step 8 · Confirmed Delivery — Full Activity Timeline & Released Escrow',
      3000,
    );

    const refreshBtn = page.locator('button', { hasText: /^Refresh$/ });
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
      await pause(1200);
      await snap(
        page,
        '09_customer_delivery_refreshed_state.png',
        'Step 9 · One-Click Selected Delivery Refresh (Live Status Sync)',
        2400,
      );
    }
  }

  await smoothScroll(page, 0);
  const refundedRow = page.locator('button', { hasText: /Refunded/i }).first();
  if (await refundedRow.isVisible().catch(() => false)) {
    await refundedRow.click();
    await pause(1200);
    await smoothScroll(page, 260);
    await snap(
      page,
      '10_customer_refunded_delivery_detail.png',
      'Step 10 · Eligible Cancellation — Full USDC Refund Verified On-Chain',
      2800,
    );
  }

  // Customer Wallet & Escrow History
  await page.goto(`${FRONTEND_URL}/dashboard/wallet`, {
    waitUntil: 'networkidle',
  });
  await snap(
    page,
    '11_customer_wallet_escrow_history.png',
    'Step 11 · Wallet & Escrow — Verifiable Stellar Testnet Transactions',
    3200,
  );

  // Customer Profile
  await page.goto(`${FRONTEND_URL}/dashboard/profile`, {
    waitUntil: 'networkidle',
  });
  await snap(
    page,
    '12_customer_profile_settings.png',
    'Step 12 · Customer Profile & Account Settings',
    2200,
  );

  // 3. Rider Live Workspace
  console.log('Recording Rider Live Workspace...');
  await context.addCookies([
    {
      name: 'tumaride_session',
      value: riderToken,
      url: FRONTEND_URL,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);

  await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'networkidle' });
  await snap(
    page,
    '13_rider_dashboard_overview.png',
    'Step 13 · Rider Dashboard — Earned USDC & Completed Jobs',
    3000,
  );

  await page.goto(`${FRONTEND_URL}/dashboard/find-deliveries`, {
    waitUntil: 'networkidle',
  });
  await snap(
    page,
    '14_rider_find_deliveries.png',
    'Step 14 · Rider Find Deliveries — Open Funded Requests',
    2500,
  );

  await page.goto(`${FRONTEND_URL}/dashboard/deliveries`, {
    waitUntil: 'networkidle',
  });
  await pause(900);
  const riderJobRow = page.locator('button', { hasText: /Confirmed/i }).first();
  if (await riderJobRow.isVisible().catch(() => false)) {
    await riderJobRow.click();
    await pause(1200);
    await smoothScroll(page, 260);
  }
  await snap(
    page,
    '15_rider_my_jobs_and_timeline.png',
    'Step 15 · Rider My Jobs — Activity Timeline (Confirmation Code Redacted)',
    2800,
  );

  await page.goto(`${FRONTEND_URL}/dashboard/wallet`, {
    waitUntil: 'networkidle',
  });
  await snap(
    page,
    '16_rider_earnings_wallet.png',
    'Step 16 · Rider Earnings & Verified Stellar Testnet Payouts',
    3000,
  );

  await page.goto(`${FRONTEND_URL}/dashboard/profile`, {
    waitUntil: 'networkidle',
  });
  await snap(
    page,
    '17_rider_profile_availability.png',
    'Step 17 · Rider Profile & Live Availability Control',
    2600,
  );

  // 4. Swagger OpenAPI Docs
  await page.goto(DOCS_URL, { waitUntil: 'networkidle' });
  await snap(
    page,
    '18_swagger_openapi_docs.png',
    'Step 18 · Interactive Swagger / OpenAPI Documentation (/docs)',
    2800,
  );
  await smoothScroll(page, 420);
  await pause(1500);

  const videoPath = await page.video().path();
  await context.close();

  // 5. Mobile responsive screenshot
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await mobileCtx.addCookies([
    {
      name: 'tumaride_session',
      value: customerToken,
      url: FRONTEND_URL,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto(`${FRONTEND_URL}/dashboard`, {
    waitUntil: 'networkidle',
  });
  await pause(800);
  await mobilePage.screenshot({
    path: path.join(shotsDir, '19_mobile_responsive_dashboard.png'),
    fullPage: false,
  });
  console.log('  [shot] 19_mobile_responsive_dashboard.png');
  await mobileCtx.close();

  await browser.close();

  const targetVideo = path.join(outDir, 'tumaride_full_flow_demo.webm');
  if (fs.existsSync(videoPath) && videoPath !== targetVideo) {
    fs.renameSync(videoPath, targetVideo);
  }
  console.log(`\nSaved human-paced walkthrough video: ${targetVideo}`);
}

main().catch((err) => {
  console.error('RECORDING FAILED:', err);
  process.exit(1);
});
