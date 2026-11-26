export type AuthAccount = { id: string; walletAddress: string; role: "CUSTOMER" | "RIDER"; fullName: string };

export function parseAuthAccount(value: unknown): AuthAccount | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const { id, walletAddress, role, fullName } = record;
  if (typeof id !== "string" || typeof walletAddress !== "string" || typeof fullName !== "string" ||
      (role !== "CUSTOMER" && role !== "RIDER")) return null;
  return { id, walletAddress, role, fullName };
}
