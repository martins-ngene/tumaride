import { authBackend, authError, authResponse } from "@/lib/api/auth";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return authError("Expected a JSON request.", 415);
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.walletAddress !== "string" || !/^G[A-Z2-7]{55}$/.test(body.walletAddress)) {
    return authError("Choose a valid Stellar account in Freighter.", 400);
  }
  try {
    const response = await authBackend("challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: body.walletAddress }),
    });
    if (!response.ok) return authError("Could not start wallet sign-in. Try again.", response.status >= 500 ? 502 : response.status);
    const data = await response.json();
    if (typeof data?.nonce !== "string" || typeof data?.message !== "string" || typeof data?.expiresAt !== "string") {
      return authError("The sign-in service returned an invalid challenge.", 502);
    }
    return authResponse({ nonce: data.nonce, message: data.message, expiresAt: data.expiresAt });
  } catch {
    return authError("The sign-in service is unavailable. Try again.", 502);
  }
}
