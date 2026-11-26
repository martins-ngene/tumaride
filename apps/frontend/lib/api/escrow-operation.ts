import { Address, Contract, nativeToScVal, Operation, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";

export const escrowActions = ["fund", "assign", "accept", "deliver", "release", "refund"] as const;
export type EscrowAction = typeof escrowActions[number];
export type EscrowInput = { action: EscrowAction; riderId?: string; code?: string };
export type EscrowIntent = {
  contract: string;
  rpcUrl: string;
  networkPassphrase: string;
  actor: string;
  deliveryId: string;
  action: EscrowAction;
  rider?: string;
  amount?: string;
  confirmationHash?: string;
  code?: string;
  needsSignature: boolean;
};

function bytes(hex: string) {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

export function escrowOperation(intent: EscrowIntent) {
  const contract = new Contract(intent.contract);
  const id = nativeToScVal(BigInt(intent.deliveryId), { type: "u64" });
  switch (intent.action) {
    case "fund":
      return contract.call("fund_escrow", id, new Address(intent.actor).toScVal(),
        intent.rider ? new Address(intent.rider).toScVal() : xdr.ScVal.scvVoid(),
        nativeToScVal(BigInt(intent.amount!), { type: "i128" }),
        nativeToScVal(bytes(intent.confirmationHash!)));
    case "assign":
    case "accept":
      return contract.call("assign_rider", id, new Address(intent.actor).toScVal(), new Address(intent.rider!).toScVal());
    case "deliver":
      return contract.call("mark_delivered", id);
    case "release":
      return contract.call("confirm_and_release", id, nativeToScVal(new TextEncoder().encode(intent.code!)));
    case "refund":
      return contract.call("cancel_and_refund", id);
  }
}

export function matchesEscrowEnvelope(envelope: string, hash: string, intent: EscrowIntent) {
  const tx = TransactionBuilder.fromXDR(envelope, intent.networkPassphrase);
  if (!(tx instanceof Transaction) || tx.hash().toString("hex") !== hash || tx.source !== intent.actor || tx.operations.length !== 1) return false;
  const operation = tx.operations[0];
  const expected = Operation.fromXDRObject(escrowOperation(intent));
  return operation.type === "invokeHostFunction" && expected.type === "invokeHostFunction" &&
    (!operation.source || operation.source === intent.actor) &&
    operation.func.toXDR("base64") === expected.func.toXDR("base64");
}
