import { parseAuthAccount, type AuthAccount } from "@/lib/auth-session";

const testnet = "Test SDF Network ; September 2015";

type Registration = { role: AuthAccount["role"]; fullName?: string; email?: string; phone?: string };

async function post(path: "challenge" | "verify", body: object) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(typeof result?.message === "string" ? result.message : "Wallet sign-in could not be completed.");
  }
  return result;
}

export async function signInWithFreighter(registration?: Registration): Promise<AuthAccount> {
  const { isConnected, requestAccess, getNetwork, signMessage } = await import("@stellar/freighter-api");
  if (!(await isConnected()).isConnected) throw new Error("Open Tuma Ride in a browser with the Freighter extension installed.");

  const access = await requestAccess();
  if (access.error || !access.address) throw new Error("Allow Tuma Ride to connect in Freighter, then try again.");
  const network = await getNetwork();
  if (network.error || network.networkPassphrase !== testnet) throw new Error("Switch Freighter to Stellar Testnet and try again.");

  const { nonce, message, expiresAt } = await post("challenge", { walletAddress: access.address });
  if (!(Date.parse(expiresAt) > Date.now())) throw new Error("The wallet challenge expired. Connect again for a fresh challenge.");

  const signed = await signMessage(message, { address: access.address, networkPassphrase: testnet });
  if (signed.error || typeof signed.signedMessage !== "string") throw new Error("Approve the message signature in Freighter to continue.");
  if (signed.signerAddress !== access.address) throw new Error("Freighter signed with a different account. Select the connected account and try again.");

  const { account } = await post("verify", { ...registration, walletAddress: access.address, nonce, signature: signed.signedMessage });
  const verifiedAccount = parseAuthAccount(account);
  if (!verifiedAccount || verifiedAccount.walletAddress !== access.address) throw new Error("Tuma Ride could not restore the verified account.");
  return verifiedAccount;
}
