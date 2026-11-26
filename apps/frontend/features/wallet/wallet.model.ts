export type WalletTab = "wallet" | "confirmation" | "transactions";
export type EscrowPhase = "awaiting" | "locked" | "released";
export type TransactionKind = "Escrow" | "Released" | "Refunds" | "Deposits" | "Payouts";
export type Transaction = {
  title: string;
  description: string;
  date: string;
  amount: number;
  kind: TransactionKind;
  status: string;
  reference: string;
};

export const deliveryAmount = 18.5;
export const previewConfirmationCode = "482917";

export const customerTransactions: Transaction[] = [
  { title: "Payment released", description: "Delivery #TR-2041", date: "Jun 20, 2025", amount: -18.5, kind: "Released", status: "Completed", reference: "13ba…76c9" },
  { title: "Payment released", description: "Delivery #TR-2036", date: "Jun 16, 2025", amount: -12, kind: "Released", status: "Completed", reference: "93a6…843f" },
  { title: "Wallet funded", description: "USDC deposit", date: "Jun 12, 2025", amount: 100, kind: "Deposits", status: "Completed", reference: "09c2…34ab" },
  { title: "Escrow refund", description: "Delivery #TR-2028", date: "Jun 09, 2025", amount: 15.75, kind: "Refunds", status: "Refunded", reference: "b121…f9aa" },
  { title: "Payment released", description: "Delivery #TR-2019", date: "Jun 07, 2025", amount: -16.2, kind: "Released", status: "Completed", reference: "0fe7…36ff" },
  { title: "Wallet funded", description: "USDC deposit", date: "Jun 05, 2025", amount: 50, kind: "Deposits", status: "Completed", reference: "985b…ab31" },
];

export const riderTransactions: Transaction[] = [
  { title: "Delivery earnings", description: "Delivery #TR-2040", date: "Jun 24, 2025", amount: 22.5, kind: "Released", status: "Completed", reference: "b073…ac52" },
  { title: "Delivery earnings", description: "Delivery #TR-2034", date: "Jun 23, 2025", amount: 14, kind: "Released", status: "Completed", reference: "790a…3c02" },
  { title: "Delivery earnings", description: "Delivery #TR-2032", date: "Jun 22, 2025", amount: 19.25, kind: "Released", status: "Completed", reference: "250f…bf05" },
  { title: "Wallet payout", description: "USDC withdrawal", date: "Jun 20, 2025", amount: -40, kind: "Payouts", status: "Completed", reference: "0ad9…1bb3" },
];

export function formatAmount(amount: number) {
  return amount.toFixed(2);
}
