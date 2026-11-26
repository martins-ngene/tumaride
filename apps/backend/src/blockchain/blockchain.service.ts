import { Injectable, Logger } from '@nestjs/common';
import {
  nativeToScVal,
  Operation,
  rpc as SorobanRpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

export interface TxVerificationResult {
  txHash: string;
  verified: boolean;
  status: string;
  ledger?: number;
  explorerUrl: string;
  reason?: string;
}

export type EscrowActionKind =
  | 'fund'
  | 'assign'
  | 'deliver'
  | 'release'
  | 'refund';

export interface EscrowProofParams {
  txHash: string;
  action: EscrowActionKind;
  onChainDeliveryId: bigint;
  actorWallet?: string;
  riderWallet?: string;
  amountStroops?: bigint;
}

const ACTION_FUNCTION_MAP: Record<EscrowActionKind, string> = {
  fund: 'fund_escrow',
  assign: 'assign_rider',
  deliver: 'mark_delivered',
  release: 'confirm_and_release',
  refund: 'cancel_and_refund',
};

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

  private async fetchRawTransaction(txHash: string): Promise<{
    status: string;
    ledger?: number;
    envelopeXdr?: string;
  }> {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: { hash: txHash },
      }),
    });
    if (!res.ok) {
      throw new Error(`Soroban RPC HTTP ${res.status}`);
    }
    const payload: any = await res.json();
    if (payload.error) {
      throw new Error(payload.error.message || 'Soroban RPC error');
    }
    return payload.result || { status: 'NOT_FOUND' };
  }

  async verifyTransaction(txHash: string): Promise<TxVerificationResult> {
    const explorerUrl = this.getExplorerTxUrl(txHash);
    if (!txHash || !/^[a-f0-9]{64}$/i.test(txHash)) {
      return {
        txHash,
        verified: false,
        status: 'INVALID_HASH',
        explorerUrl,
        reason: 'Transaction hash must be a 64-character hex string.',
      };
    }

    try {
      const response = await this.fetchRawTransaction(txHash);
      return {
        txHash,
        verified: response.status === 'SUCCESS',
        status: response.status,
        ledger: response.ledger,
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
        reason: (err as Error).message,
      };
    }
  }

  async verifyEscrowAction(
    params: EscrowProofParams,
  ): Promise<TxVerificationResult> {
    const explorerUrl = this.getExplorerTxUrl(params.txHash);
    if (!params.txHash || !/^[a-f0-9]{64}$/i.test(params.txHash)) {
      return {
        txHash: params.txHash,
        verified: false,
        status: 'INVALID_HASH',
        explorerUrl,
        reason: 'A valid 64-character Stellar Testnet transaction hash is required.',
      };
    }

    if (!this.contractId) {
      return {
        txHash: params.txHash,
        verified: false,
        status: 'CONTRACT_UNCONFIGURED',
        explorerUrl,
        reason: 'TUMARIDE_ESCROW_CONTRACT_ID is not configured on the backend.',
      };
    }

    try {
      const response = await this.fetchRawTransaction(params.txHash);
      if (response.status !== 'SUCCESS' || !response.envelopeXdr) {
        return {
          txHash: params.txHash,
          verified: false,
          status: response.status,
          explorerUrl,
          reason: `Transaction is not confirmed as SUCCESS on Stellar Testnet (status: ${response.status}).`,
        };
      }

      const envelope = TransactionBuilder.fromXDR(
        response.envelopeXdr,
        this.networkPassphrase,
      );
      if (!(envelope instanceof Transaction)) {
        return {
          txHash: params.txHash,
          verified: false,
          status: 'INVALID_ENVELOPE',
          explorerUrl,
          reason: 'Transaction envelope is not a standard Soroban transaction.',
        };
      }

      const expectedFn = ACTION_FUNCTION_MAP[params.action];
      let matched = false;

      for (const op of envelope.operations) {
        if (op.type !== 'invokeHostFunction') continue;
        const invokeOp = op as Operation.InvokeHostFunction;
        if (
          invokeOp.func.switch().name !==
          'hostFunctionTypeInvokeContract'
        ) {
          continue;
        }
        const invokeArgs = invokeOp.func.invokeContract();
        const invokedContract = scValToNative(
          xdr.ScVal.scvAddress(invokeArgs.contractAddress()),
        );
        const fnName = invokeArgs.functionName().toString('utf8');
        const args = invokeArgs.args().map((arg) => scValToNative(arg));

        if (invokedContract !== this.contractId || fnName !== expectedFn) {
          continue;
        }

        const deliveryIdArg = args[0] !== undefined ? BigInt(args[0]) : null;
        if (deliveryIdArg !== params.onChainDeliveryId) {
          continue;
        }

        if (params.action === 'fund') {
          if (params.actorWallet && args[1] !== params.actorWallet) continue;
          if (
            params.amountStroops !== undefined &&
            BigInt(args[3]) !== params.amountStroops
          ) {
            continue;
          }
        } else if (params.action === 'assign') {
          if (params.actorWallet && args[1] !== params.actorWallet) continue;
          if (params.riderWallet && args[2] !== params.riderWallet) continue;
        }

        matched = true;
        break;
      }

      if (!matched) {
        return {
          txHash: params.txHash,
          verified: false,
          status: 'PROOF_MISMATCH',
          ledger: 'ledger' in response ? response.ledger : undefined,
          explorerUrl,
          reason: `Transaction ${params.txHash} does not invoke ${expectedFn} for delivery ${params.onChainDeliveryId.toString()} on contract ${this.contractId}.`,
        };
      }

      return {
        txHash: params.txHash,
        verified: true,
        status: response.status,
        ledger: 'ledger' in response ? response.ledger : undefined,
        explorerUrl,
      };
    } catch (err) {
      this.logger.warn(
        `Soroban RPC proof verification failed for ${params.txHash}: ${(err as Error).message}`,
      );
      return {
        txHash: params.txHash,
        verified: false,
        status: 'RPC_UNAVAILABLE',
        explorerUrl,
        reason: `Unable to verify transaction on Stellar Testnet RPC: ${(err as Error).message}`,
      };
    }
  }

  async isRiderAssignedOnChain(
    onChainDeliveryId: bigint,
    riderWallet: string,
  ): Promise<boolean> {
    if (!this.contractId) return false;
    try {
      const key = xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Escrow'),
        nativeToScVal(onChainDeliveryId, { type: 'u64' }),
      ]);
      const entry = await this.rpcServer.getContractData(
        this.contractId,
        key,
        SorobanRpc.Durability.Persistent,
      );
      const record = scValToNative(entry.val.contractData().val());
      return record?.rider === riderWallet && Number(record?.status) === 1;
    } catch (err) {
      this.logger.warn(
        `On-chain rider assignment check failed for delivery ${onChainDeliveryId.toString()}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  getRpcServer(): SorobanRpc.Server {
    return this.rpcServer;
  }
}
