import { authBackend, authError, authResponse, setAuthToken } from "@/lib/api/auth";
import { parseAuthAccount } from "@/lib/auth-session";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return authError("Expected a JSON request.", 415);
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.walletAddress !== "string" || !/^G[A-Z2-7]{55}$/.test(body.walletAddress) ||
      typeof body.nonce !== "string" || !/^[a-f0-9]{48}$/.test(body.nonce) ||
      typeof body.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(body.signature) ||
      (body.role !== undefined && body.role !== "CUSTOMER" && body.role !== "RIDER")) {
    return authError("The wallet returned invalid sign-in data. Try again.", 400);
  }
  const { walletAddress, nonce, signature, role } = body;
  const details = Object.fromEntries(["fullName", "email", "phone"]
    .filter((key) => typeof body[key] === "string" && body[key].trim())
    .map((key) => [key, body[key].trim()]));
  try {
    const response = await authBackend("verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, nonce, signature, role, ...details }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      if (response.status === 401 && failure?.message === "Invalid Stellar wallet signature") {
        return authError("The sign-in service could not verify Freighter’s signature. Reconnect and try again.", 401);
      }
      return authError("Wallet sign-in could not be verified. Start again to request a fresh challenge.", response.status >= 500 ? 502 : response.status);
    }
    const data = await response.json();
    const account = parseAuthAccount(data?.user);
    if (!account || account.walletAddress !== walletAddress || typeof data?.accessToken !== "string" ||
        !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(data.accessToken)) {
      return authError("The sign-in service returned an invalid session.", 502);
    }
    await setAuthToken(data.accessToken);
    return authResponse({ account });
  } catch {
    return authError("The sign-in service is unavailable. Try again.", 502);
  }
}
