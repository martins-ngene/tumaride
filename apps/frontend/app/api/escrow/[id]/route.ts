import { nativeToScVal, scValToNative, SorobanRpc, xdr } from "@stellar/stellar-sdk";
import { authError, authResponse, backendRequest, getAuthToken } from "@/lib/api/auth";
import { getBlockchainConfig } from "@/lib/api/blockchain";
import { escrowActions, matchesEscrowEnvelope, type EscrowAction, type EscrowIntent } from "@/lib/api/escrow-operation";
import { parseAuthAccount } from "@/lib/auth-session";

type Delivery = {
  customerId: string; riderId: string | null; riderWallet: string | null; onChainDeliveryId: string;
  status: string; escrowStatus: string; feeStroops: string; confirmationCode?: string; confirmationCodeHash: string;
};
type Decision = { allowed: boolean; done: boolean };

function decide(action: EscrowAction, delivery: Delivery, id: string, rider: boolean, riderId?: string): Decision {
  const { status, escrowStatus } = delivery;
  const owner = !rider && delivery.customerId === id;
  const assigned = rider && delivery.riderId === id;
  const locked = escrowStatus === "LOCKED";
  switch (action) {
    case "fund": return { allowed: owner && status === "CREATED" && escrowStatus === "UNFUNDED", done: owner && escrowStatus !== "UNFUNDED" };
    case "assign": return { allowed: owner && locked && status === "FUNDED" && !delivery.riderId && !!riderId, done: owner && !!riderId && delivery.riderId === riderId };
    case "accept": return { allowed: rider && locked && (!delivery.riderId || assigned) && ["FUNDED", "ASSIGNED"].includes(status), done: assigned && ["ACCEPTED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CONFIRMED"].includes(status) };
    case "deliver": return { allowed: assigned && locked && status === "IN_TRANSIT", done: assigned && ["DELIVERED", "CONFIRMED"].includes(status) };
    case "release": return { allowed: owner && locked && status === "DELIVERED", done: owner && escrowStatus === "RELEASED" };
    case "refund": return { allowed: owner && locked && ["FUNDED", "ASSIGNED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"].includes(status), done: owner && escrowStatus === "REFUNDED" };
  }
}

function acceptedOnChain(rpc: SorobanRpc.Server, intent: EscrowIntent) {
  const key = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Escrow"), nativeToScVal(BigInt(intent.deliveryId), { type: "u64" })]);
  return rpc.getContractData(intent.contract, key, SorobanRpc.Durability.Persistent).then(({ val }) => {
    const record = scValToNative(val.contractData().val());
    return record.rider === intent.actor && Number(record.status) === 1;
  });
}

async function matchesOnChain(rpcUrl: string, hash: string, intent: EscrowIntent) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: { hash } }),
    cache: "no-store",
  });
  if (!res.ok) return false;
  const payload = await res.json().catch(() => null);
  const result = payload?.result;
  if (result?.status !== "SUCCESS" || typeof result?.envelopeXdr !== "string") return false;
  return matchesEscrowEnvelope(result.envelopeXdr, hash, intent);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getAuthToken();
  if (!token) return authError("Sign in with your wallet first.", 401);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return authError("Expected a JSON request.", 415);
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !escrowActions.includes(body?.action) || !["prepare", "record"].includes(body?.phase)) {
    return authError("Invalid escrow request.", 400);
  }
  const action = body.action as EscrowAction;
  const riderId = typeof body.riderId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(body.riderId) ? body.riderId : undefined;
  const txHash = typeof body.txHash === "string" && /^[a-f0-9]{64}$/.test(body.txHash) ? body.txHash : undefined;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const [me, detail, config] = await Promise.all([
      backendRequest("auth/me", { headers }), backendRequest(`deliveries/${id}`, { headers }), getBlockchainConfig(),
    ]);
    const account = me.ok ? parseAuthAccount(await me.json()) : null;
    if (!account) return authError("Could not verify the wallet session.", 401);
    if (!detail.ok) return authError("Couldn’t load the delivery.", detail.status === 404 ? 404 : 502);
    const delivery = await detail.json() as Delivery;
    if (action === "accept" && account.role === "RIDER" && account.riderAvailable === false) {
      return authError("Unavailable riders cannot accept delivery requests. Enable availability in Profile & settings first.", 403);
    }
    const { allowed, done } = decide(action, delivery, account.id, account.role === "RIDER", riderId);
    if (!allowed && !done) return authError("This escrow action is unavailable for the current delivery state.", 409);
    if (config.status !== "available") return authError("Stellar Testnet configuration is unavailable.", 503);

    let rider = action === "accept" ? account.walletAddress : delivery.riderWallet ?? undefined;
    if (action === "assign") {
      const response = await backendRequest("users/riders?onlyAvailable=false", { headers });
      if (!response.ok) return authError("Couldn’t load the selected rider.", 502);
      const choices: { id: string; walletAddress: string }[] = await response.json();
      rider = choices.find((choice) => choice.id === riderId)?.walletAddress;
      if (!rider) return authError("The selected rider is unavailable.", 409);
    }

    const code = action === "release" && typeof body.code === "string" ? body.code.trim() : undefined;
    if (action === "release" && (!code || code !== delivery.confirmationCode)) {
      return authError("Enter the full confirmation code for this delivery.", 400);
    }
    if (action === "fund" && !/^[a-f0-9]{64}$/i.test(delivery.confirmationCodeHash)) {
      return authError("The delivery has no valid confirmation hash.", 409);
    }
    if (action === "fund" && delivery.riderId && !rider) return authError("The assigned rider’s wallet is unavailable.", 409);

    const intent: EscrowIntent = {
      contract: config.contractId, rpcUrl: config.rpcUrl, networkPassphrase: config.networkPassphrase,
      actor: account.walletAddress, deliveryId: delivery.onChainDeliveryId, action, rider,
      amount: delivery.feeStroops, confirmationHash: action === "fund" ? delivery.confirmationCodeHash : undefined,
      code, needsSignature: true,
    };
    const rpc = new SorobanRpc.Server(config.rpcUrl);
    if (action === "accept" && delivery.riderId === account.id && !txHash && !done) {
      intent.needsSignature = !(await acceptedOnChain(rpc, intent));
    }

    if (body.phase === "prepare") {
      return done ? authError("This action is already recorded. Refresh the delivery.", 409) : authResponse({ intent });
    }
    if (intent.needsSignature) {
      const matches = txHash && (await matchesOnChain(config.rpcUrl, txHash, intent) ||
        (done && action === "fund" && intent.rider && await matchesOnChain(config.rpcUrl, txHash, { ...intent, rider: undefined })));
      if (!matches) return authError("A matching successful Testnet transaction is required.", 409);
    }
    if (done) return authResponse({ recorded: true });

    const endpoint = action === "deliver" ? "status" : action === "release" ? "confirm" : action === "refund" ? "cancel" : action;
    const payload = action === "release" ? { confirmationCode: code, releaseTxHash: txHash } :
      action === "refund" ? { reason: "Customer requested refund", refundTxHash: txHash } :
      action === "assign" ? { riderId, txHash } :
      action === "deliver" ? { status: "DELIVERED", txHash } : { txHash };
    const response = await backendRequest(`deliveries/${id}/${endpoint}`, {
      method: action === "deliver" ? "PATCH" : "POST", headers, body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      return authError(typeof error?.message === "string" && response.status < 500 ? error.message : "Couldn’t record the escrow action.", response.status >= 500 ? 502 : response.status);
    }
    return authResponse({ recorded: true });
  } catch {
    return authError("The API or Stellar Testnet RPC did not respond. Retry to reconcile the action.", 502);
  }
}
