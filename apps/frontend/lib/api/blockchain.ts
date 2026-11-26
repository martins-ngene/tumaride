export type BlockchainConfig =
  | { status: "available"; network: "TESTNET"; contractId: string; explorerUrl: string; rpcUrl: string; networkPassphrase: string }
  | { status: "unavailable" };

const unavailable: BlockchainConfig = { status: "unavailable" };
const apiUrl = process.env.TUMARIDE_API_URL ?? "http://localhost:4000/api";

export async function getBlockchainConfig(): Promise<BlockchainConfig> {
  try {
    const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/blockchain/config`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return unavailable;

    const data = await response.json();
    if (data?.network !== "TESTNET" ||
        data.networkPassphrase !== "Test SDF Network ; September 2015" ||
        typeof data.rpcUrl !== "string" || new URL(data.rpcUrl).protocol !== "https:" ||
        typeof data.escrowContractId !== "string" || !/^C[A-Z2-7]{55}$/.test(data.escrowContractId)) {
      return unavailable;
    }

    return {
      status: "available",
      network: data.network,
      contractId: data.escrowContractId,
      rpcUrl: data.rpcUrl,
      networkPassphrase: data.networkPassphrase,
      explorerUrl: `https://stellar.expert/explorer/testnet/contract/${data.escrowContractId}`,
    };
  } catch {
    return unavailable;
  }
}
