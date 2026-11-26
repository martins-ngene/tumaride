import { Suspense } from "react";
import { getBlockchainConfig } from "@/lib/api/blockchain";
import { WalletView } from "@/features/wallet/wallet.view";

type Search = Promise<{ tab?: string }>;

async function WalletRoute({ searchParams }: { searchParams: Search }) {
  const [{ tab }, config] = await Promise.all([searchParams, getBlockchainConfig()]);
  return <WalletView config={config} key={tab} initialTab={tab === "transactions" ? "transactions" : "wallet"} />;
}

export default function WalletPage({ searchParams }: { searchParams: Search }) {
  return <Suspense><WalletRoute searchParams={searchParams} /></Suspense>;
}
