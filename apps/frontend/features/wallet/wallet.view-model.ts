"use client";

import { useState } from "react";
import { customerTransactions, deliveryAmount, formatAmount, previewConfirmationCode, riderTransactions, type EscrowPhase, type Transaction, type WalletTab } from "./wallet.model";

const pageSize = 5;

export function useWalletViewModel(initialTab: WalletTab, rider: boolean) {
  const [tab, setTab] = useState<WalletTab>(initialTab);
  const [phase, setPhase] = useState<EscrowPhase>("awaiting");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [showBalance, setShowBalance] = useState(true);

  const escrowTransaction: Transaction = {
    title: phase === "released" ? "Payment released" : "Escrow locked",
    description: "Delivery #TR-2048", date: "Jun 24, 2025", amount: -deliveryAmount,
    reference: "6c14…a92f", kind: phase === "released" ? "Released" : "Escrow",
    status: phase === "released" ? "Completed" : "In escrow",
  };
  const transactions = rider ? riderTransactions : phase === "awaiting" ? customerTransactions : [escrowTransaction, ...customerTransactions];
  const filtered = transactions.filter((tx) => (filter === "All" || tx.kind === filter) &&
    [tx.title, tx.description, tx.reference].some((text) => text.toLowerCase().includes(query.trim().toLowerCase())));
  const balance = rider ? 128.4 : 246.8 - (phase === "awaiting" ? 0 : deliveryAmount);

  function selectTab(next: WalletTab) {
    setTab(next);
    setError("");
  }

  function lockEscrow() {
    if (phase === "awaiting") setPhase("locked");
    else selectTab("confirmation");
  }

  function confirmDelivery() {
    if (phase !== "locked") {
      setError("Lock the preview escrow before confirming delivery.");
    } else if (code !== previewConfirmationCode) {
      setError("Enter the six-digit preview code shown above.");
    } else {
      setPhase("released");
      setError("");
    }
  }

  function exportCsv() {
    const rows = filtered.map((tx) => [tx.title, tx.description, tx.date, formatAmount(tx.amount), tx.status, tx.reference]);
    const csv = [["Transaction","Description","Date","USDC","Status","Reference"], ...rows]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.download = "tuma-ride-preview-transactions.csv";
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    tab, selectTab, phase, code, setCode, error, balance, showBalance, toggleBalance: () => setShowBalance(!showBalance),
    lockEscrow, confirmDelivery, transactions, filtered, query, filter, page, setPage, pageSize, selected, setSelected, exportCsv,
    changeQuery: (value: string) => { setQuery(value); setPage(1); },
    changeFilter: (value: string) => { setFilter(value); setPage(1); },
  };
}
