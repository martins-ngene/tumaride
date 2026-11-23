import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DeliveryStatus, EscrowStatus } from '@prisma/client';
import { scValToNative } from '@stellar/stellar-sdk';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchain: BlockchainService,
  ) {}

  @Interval(10_000)
  async pollContractEvents() {
    if (
      process.env.INDEXER_ENABLED !== 'true' ||
      !this.blockchain.contractId ||
      !process.env.DATABASE_URL ||
      this.isPolling
    ) {
      return;
    }

    this.isPolling = true;
    try {
      const rpc = this.blockchain.getRpcServer();
      const latestLedger = await rpc.getLatestLedger();

      const sync = await this.prisma.syncState.upsert({
        where: { id: 'soroban-indexer' },
        update: {},
        create: {
          id: 'soroban-indexer',
          lastLedger: Math.max(1, latestLedger.sequence - 20),
        },
      });

      const startLedger = Math.max(
        sync.lastLedger + 1,
        latestLedger.sequence - 100,
      );
      if (startLedger > latestLedger.sequence) {
        return;
      }

      const response = await rpc.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [this.blockchain.contractId],
          },
        ],
        limit: 50,
      });

      for (const evt of response.events || []) {
        await this.reconcileEvent(evt);
      }

      await this.prisma.syncState.update({
        where: { id: 'soroban-indexer' },
        data: { lastLedger: latestLedger.sequence },
      });
    } catch (err) {
      this.logger.warn(
        `Soroban RPC event poll skipped: ${(err as Error).message}`,
      );
    } finally {
      this.isPolling = false;
    }
  }

  private async reconcileEvent(evt: any) {
    try {
      const topics = (evt.topic || []).map((t: any) => scValToNative(t));
      const eventName = String(topics[0] || '');
      const deliveryIdRaw = topics[1];
      if (!deliveryIdRaw) return;

      const onChainDeliveryId = BigInt(deliveryIdRaw);
      const delivery = await this.prisma.deliveryRequest.findUnique({
        where: { onChainDeliveryId },
      });
      if (!delivery) return;

      const txHash = evt.txHash || undefined;

      if (eventName.includes('escrow_funded')) {
        await this.prisma.deliveryRequest.update({
          where: { id: delivery.id },
          data: {
            escrowStatus: EscrowStatus.LOCKED,
            ...(delivery.status === DeliveryStatus.CREATED
              ? { status: DeliveryStatus.FUNDED }
              : {}),
            ...(txHash ? { fundTxHash: txHash } : {}),
          },
        });
      } else if (eventName.includes('delivery_completed')) {
        await this.prisma.deliveryRequest.update({
          where: { id: delivery.id },
          data: { status: DeliveryStatus.DELIVERED },
        });
      } else if (eventName.includes('payment_released')) {
        await this.prisma.deliveryRequest.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.CONFIRMED,
            escrowStatus: EscrowStatus.RELEASED,
            ...(txHash ? { releaseTxHash: txHash } : {}),
          },
        });
      } else if (eventName.includes('escrow_refunded')) {
        await this.prisma.deliveryRequest.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.REFUNDED,
            escrowStatus: EscrowStatus.REFUNDED,
            ...(txHash ? { refundTxHash: txHash } : {}),
          },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to reconcile Soroban event: ${(err as Error).message}`,
      );
    }
  }
}
