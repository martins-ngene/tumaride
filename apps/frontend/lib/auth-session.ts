export type AuthAccount = {
  id: string;
  walletAddress: string;
  role: "CUSTOMER" | "RIDER";
  fullName: string;
  riderAvailable?: boolean;
};

export function parseAuthAccount(value: unknown): AuthAccount | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const { id, walletAddress, role, fullName, riderProfile } = record;
  if (typeof id !== "string" || typeof walletAddress !== "string" || typeof fullName !== "string" ||
      (role !== "CUSTOMER" && role !== "RIDER")) return null;
  const profile = typeof riderProfile === "object" && riderProfile !== null ? riderProfile as Record<string, unknown> : null;
  const riderAvailable = typeof profile?.isAvailable === "boolean" ? profile.isAvailable : undefined;
  return { id, walletAddress, role, fullName, ...(riderAvailable !== undefined ? { riderAvailable } : {}) };
}
