"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthAccount } from "@/lib/auth-session";
import { restoreWalletSession } from "@/lib/wallet-session.client";

const AccountContext = createContext<AuthAccount | null>(null);

export function useWalletAccount() {
  return useContext(AccountContext);
}

export function DashboardSession({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthAccount | null | undefined>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    restoreWalletSession(controller.signal).then(
      (verified) => { if (!controller.signal.aborted) setAccount(verified); },
      () => { if (!controller.signal.aborted) setFailed(true); },
    );
    return () => controller.abort();
  }, [attempt]);

  if (failed) return <main className="mx-auto max-w-lg p-8">
    <h1 className="text-display text-foreground">Wallet session unavailable</h1>
    <p className="mt-3">We couldn’t check your session. Try again to open your dashboard.</p>
    <button type="button" className="mt-4 underline" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Retry</button>
  </main>;
  if (account === undefined) return <p className="p-8" role="status">Checking your session…</p>;
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}
