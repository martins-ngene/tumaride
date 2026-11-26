import { parseAuthAccount, type AuthAccount } from "./auth-session";

export async function restoreWalletSession(signal: AbortSignal): Promise<AuthAccount | null> {
  const response = await fetch("/api/auth/session", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Could not restore the wallet session.");
  const body = await response.json();
  if (body?.account === null) return null;
  const account = parseAuthAccount(body?.account);
  if (!account) throw new Error("The wallet session response was invalid.");
  return account;
}

export async function endWalletSession() {
  const response = await fetch("/api/auth/session", { method: "DELETE" });
  if (!response.ok) throw new Error("Could not sign out. Try again.");
}
