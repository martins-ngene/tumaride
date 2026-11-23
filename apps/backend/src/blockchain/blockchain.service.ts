import { Injectable, Logger } from '@nestjs/common';
import { rpc as SorobanRpc } from '@stellar/stellar-sdk';

export interface TxVerificationResult {
  txHash: string;
  verified: boolean;
  status: string;
  ledger?: number;
  explorerUrl: string;
}

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly rpcServer: SorobanRpc.Server;

  readonly network: string;
  readonly rpcUrl: string;
  readonly networkPassphrase: string;
  readonly contractId: string;
  readonly usdcTokenContractId: string;

  constructor() {
    this.network = process.env.STELLAR_NETWORK || 'TESTNET';
    this.rpcUrl =
      process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
    this.networkPassphrase =
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      'Test SDF Network ; September 2015';
    this.contractId = process.env.TUMARIDE_ESCROW_CONTRACT_ID || '';
    this.usdcTokenContractId =
      process.env.USDC_TOKEN_CONTRACT_ID ||
      'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

    this.rpcServer = new SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.rpcUrl.startsWith('http://'),
    });
  }

  getExplorerTxUrl(txHash: string): string {
    const net = this.network.toLowerCase() === 'public' ? 'public' : 'testnet';
    return `https://stellar.expert/explorer/${net}/tx/${txHash}`;
  }

  getExplorerContractUrl(): string {
    const net = this.network.toLowerCase() === 'public' ? 'public' : 'testnet';
    return `https://stellar.expert/explorer/${net}/contract/${this.contractId}`;
  }

  getConfig() {
    return {
      network: this.network,
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      escrowContractId: this.contractId,
      usdcTokenContractId: this.usdcTokenContractId,
      contractExplorerUrl: this.contractId
        ? this.getExplorerContractUrl()
        : null,
    };
  }

  async verifyTransaction(txHash: string): Promise<TxVerificationResult> {
    const explorerUrl = this.getExplorerTxUrl(txHash);
    if (!txHash || txHash.length < 16) {
      return {
        txHash,
        verified: false,
        status: 'INVALID_HASH',
        explorerUrl,
      };
    }

    try {
      const response = await this.rpcServer.getTransaction(txHash);
      return {
        txHash,
        verified: response.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        status: response.status,
        ledger: 'ledger' in response ? response.ledger : undefined,
        explorerUrl,
      };
    } catch (err) {
      this.logger.warn(
        `Soroban RPC tx lookup skipped/failed for ${txHash}: ${(err as Error).message}`,
      );
      return {
        txHash,
        verified: false,
        status: 'RPC_UNAVAILABLE',
        explorerUrl,
      };
    }
  }

  getRpcServer(): SorobanRpc.Server {
    return this.rpcServer;
  }
}
