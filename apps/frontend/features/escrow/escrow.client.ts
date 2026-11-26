import type { EscrowAction, EscrowInput, EscrowIntent } from "@/lib/api/escrow-operation";

type Pending = { action: EscrowAction; hash: string; riderId?: string; expiresAt: number };

function pendingKey(account: string, delivery: string) {
  return `tumaride.escrow.${account}.${delivery}`;
}

export function readPending(account: string, delivery: string): Pending | null {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(account, delivery)) ?? "null");
  } catch { return null; }
}

async function callEscrow(id: string, payload: object) {
  const response = await fetch(`/api/escrow/${encodeURIComponent(id)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.message ?? "Escrow service unavailable.");
  return result;
}

let walletInitialized = false;

export async function runEscrow(
  id: string,
  address: string,
  input: EscrowInput,
  config: { rpcUrl: string },
  progress: (message: string) => void,
) {
  const [{ SorobanRpc, Transaction, TransactionBuilder, BASE_FEE }, { escrowOperation }] = await Promise.all([
    import("@stellar/stellar-sdk"), import("@/lib/api/escrow-operation"),
  ]);
  const key = pendingKey(address, id);
  let pending = readPending(address, id);
  if (pending && (pending.action !== input.action || pending.riderId !== input.riderId)) {
    throw new Error("Reconcile the pending escrow action for this delivery first.");
  }
  let rpc = new SorobanRpc.Server(config.rpcUrl);

  if (!pending) {
    progress("Preparing the Testnet transaction…");
    const { intent } = await callEscrow(id, { ...input, phase: "prepare" }) as { intent: EscrowIntent };
    if (intent.actor !== address) throw new Error("The signing wallet does not match the current session.");
    if (!intent.needsSignature) {
      await callEscrow(id, { ...input, phase: "record" });
      return;
    }
    rpc = new SorobanRpc.Server(intent.rpcUrl);
    const [{ isConnected, getNetwork }, { StellarWalletsKit }, { VarialModule, VARIAL_ID }, { Networks }] = await Promise.all([
      import("@stellar/freighter-api"),
      import("@creit.tech/stellar-wallets-kit/sdk"),
      import("@creit.tech/stellar-wallets-kit/modules/varial"),
      import("@creit.tech/stellar-wallets-kit/types"),
    ]);
    if (!(await isConnected()).isConnected) throw new Error("Open Freighter or Varial to sign the transaction.");
    const walletNetwork = await getNetwork();
    if (walletNetwork.error || walletNetwork.networkPassphrase !== intent.networkPassphrase) {
      throw new Error("Switch the wallet to Stellar Testnet and try again.");
    }
    if (!walletInitialized) {
      StellarWalletsKit.init({ modules: [new VarialModule()], network: Networks.TESTNET });
      walletInitialized = true;
    }
    StellarWalletsKit.setWallet(VARIAL_ID);
    const { address: connected } = await StellarWalletsKit.fetchAddress();
    if (connected !== address) throw new Error("Select the same wallet you used to sign in.");
    const account = await rpc.getAccount(address);
    const raw = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: intent.networkPassphrase })
      .addOperation(escrowOperation(intent)).setTimeout(180).build();
    const prepared = await rpc.prepareTransaction(raw);
    progress("Approve the transaction in your wallet…");
    const signed = await StellarWalletsKit.signTransaction(prepared.toXDR(), { address, networkPassphrase: intent.networkPassphrase });
    const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, intent.networkPassphrase);
    if (!(signedTx instanceof Transaction) || !signedTx.hash().equals(prepared.hash()) || !signedTx.signatures.length ||
        (signed.signerAddress && signed.signerAddress !== address)) throw new Error("The wallet returned a different transaction.");
    pending = { action: input.action, riderId: input.riderId, hash: signedTx.hash().toString("hex"), expiresAt: Number(signedTx.timeBounds?.maxTime ?? 0) };
    localStorage.setItem(key, JSON.stringify(pending));
    progress("Submitting to Stellar Testnet…");
    const submission = await rpc.sendTransaction(signedTx);
    if (submission.status === "ERROR") {
      localStorage.removeItem(key);
      throw new Error("Stellar rejected the transaction. Check your balance and delivery state before retrying.");
    }
  }

  progress(`Waiting for Testnet confirmation · ${pending.hash.slice(0, 12)}…`);
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await rpc.getTransaction(pending.hash);
    if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      progress("Recording the confirmed transaction…");
      await callEscrow(id, { ...input, phase: "record", txHash: pending.hash });
      localStorage.removeItem(key);
      return;
    }
    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED ||
        (pending.expiresAt > 0 && Number(result.latestLedgerCloseTime) > pending.expiresAt)) {
      localStorage.removeItem(key);
      throw new Error("The Testnet transaction failed or expired. You can submit a new one.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Testnet confirmation is pending. Use Resume escrow action to check again without signing twice.");
}
