import { authBackend, authError, authResponse, clearAuthToken, getAuthToken } from "@/lib/api/auth";
import { parseAuthAccount } from "@/lib/auth-session";

export async function GET() {
  const token = await getAuthToken();
  if (!token) return authResponse({ account: null });
  try {
    const response = await authBackend("me", { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 || response.status === 403) {
      await clearAuthToken();
      return authResponse({ account: null });
    }
    if (!response.ok) return authError("Could not restore the wallet session. Retry to continue.", 502);
    const account = parseAuthAccount(await response.json());
    return account ? authResponse({ account }) : authError("The sign-in service returned an invalid account.", 502);
  } catch {
    return authError("Could not restore the wallet session. Retry to continue.", 502);
  }
}

export async function DELETE() {
  await clearAuthToken();
  return authResponse({ account: null });
}
