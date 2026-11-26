import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  DeliveryStatus,
  EscrowStatus,
  EscrowTxType,
  UserRole,
} from '@prisma/client';
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

  private async ensureActivity(data: {
    deliveryId: string;
    status: DeliveryStatus;
    actorId?: string | null;
    actorRole?: UserRole | null;
    note: string;
    txHash?: string | null;
  }) {
    const existing = await this.prisma.deliveryActivity.findFirst({
      where: {
        deliveryId: data.deliveryId,
        status: data.status,
        ...(data.txHash ? { txHash: data.txHash } : {}),
      },
    });
    if (!existing) {
      await this.prisma.deliveryActivity.create({ data });
    }
  }

  async reconcileEvent(evt: any) {
    try {
      const topics = (evt.topic || []).map((t: any) =>
        typeof t === 'string' || typeof t === 'number' || typeof t === 'bigint'
          ? t
          : scValToNative(t),
      );
      const eventName = String(topics[0] || '');
      const deliveryIdRaw = topics[1];
      if (!deliveryIdRaw) return;

      const onChainDeliveryId = BigInt(deliveryIdRaw);
      const delivery = await this.prisma.deliveryRequest.findUnique({
        where: { onChainDeliveryId },
        include: { customer: true, rider: true },
      });
      if (!delivery) return;

      const txHash: string | undefined = evt.txHash || undefined;
      const ledgerSequence: number | undefined =
        typeof evt.ledger === 'number' ? evt.ledger : undefined;

      if (eventName.includes('escrow_funded')) {
        const nextStatus =
          delivery.status === DeliveryStatus.CREATED
            ? delivery.riderId
              ? DeliveryStatus.ASSIGNED
              : DeliveryStatus.FUNDED
            : delivery.status;

        await this.prisma.deliveryRequest.update({
          where: { id: delivery.id },
          data: {
            escrowStatus: EscrowStatus.LOCKED,
            status: nextStatus,
            ...(txHash ? { fundTxHash: txHash } : {}),
          },
        });

        if (txHash) {
          await this.prisma.escrowTransaction.upsert({
            where: { txHash },
            update: { ...(ledgerSequence ? { ledgerSequence } : {}) },
            create: {
              deliveryId: delivery.id,
              txType: EscrowTxType.FUND,
              txHash,
              amountStroops: delivery.feeStroops,
              amountUsdc: delivery.feeUsdc,
              fromWallet: delivery.customer.walletAddress,
              toWallet: this.blockchain.contractId || 'SOROBAN_ESCROW_CONTRACT',
              ledgerSequence: ledgerSequence ?? null,
            },
          });
        }

        await this.ensureActivity({
          deliveryId: delivery.id,
          status:
            delivery.riderId ? DeliveryStatus.ASSIGNED : DeliveryStatus.FUNDED,
          actorId: delivery.customerId,
          actorRole: UserRole.CUSTOMER,
          note: `Locked ${delivery.feeUsdc} USDC in Soroban escrow.`,
          txHash: txHash ?? null,
        });
      } else if (eventName.includes('rider_assigned')) {
        const value = evt.value
          ? typeof evt.value === 'object' && 'rider' in evt.value
            ? evt.value
            : scValToNative(evt.value)
          : null;
        const riderWallet = value?.rider;
        const matchedRider = riderWallet
          ? await this.prisma.user.findUnique({
              where: { walletAddress: String(riderWallet) },
            })
          : null;

        if (matchedRider && !delivery.riderId) {
          await this.prisma.deliveryRequest.update({
            where: { id: delivery.id },
            data: {
              riderId: matchedRider.id,
              ...(delivery.status === DeliveryStatus.FUNDED
                ? { status: DeliveryStatus.ASSIGNED }
                : {}),
            },
          });
          await this.ensureActivity({
            deliveryId: delivery.id,
            status: DeliveryStatus.ASSIGNED,
            actorId: matchedRider.id,
            actorRole: UserRole.RIDER,
            note: `Assigned rider ${matchedRider.fullName}.`,
            txHash: txHash ?? null,
          });
        }
      } else if (eventName.includes('delivery_completed')) {
        if (
          delivery.status !== DeliveryStatus.CONFIRMED &&
          delivery.status !== DeliveryStatus.REFUNDED
        ) {
          await this.prisma.deliveryRequest.update({
            where: { id: delivery.id },
            data: { status: DeliveryStatus.DELIVERED },
          });
        }

        await this.ensureActivity({
          deliveryId: delivery.id,
          status: DeliveryStatus.DELIVERED,
          actorId: delivery.riderId,
          actorRole: UserRole.RIDER,
          note: 'Delivery status updated to DELIVERED.',
          txHash: txHash ?? null,
        });
      } else if (eventName.includes('payment_released')) {
        const wasAlreadyReleased =
          delivery.escrowStatus === EscrowStatus.RELEASED;

        await this.prisma.deliveryRequest.update({
          where: { id: delivery.id },
          data: {
            status: DeliveryStatus.CONFIRMED,
            escrowStatus: EscrowStatus.RELEASED,
            ...(txHash ? { releaseTxHash: txHash } : {}),
          },
        });

        if (!wasAlreadyReleased && delivery.riderId) {
          await this.prisma.riderProfile
            .update({
              where: { userId: delivery.riderId },
              data: { completedDeliveries: { increment: 1 } },
            })
            .catch(() => null);
        }

        if (txHash) {
          await this.prisma.escrowTransaction.upsert({
            where: { txHash },
            update: { ...(ledgerSequence ? { ledgerSequence } : {}) },
            create: {
              deliveryId: delivery.id,
              txType: EscrowTxType.RELEASE,
              txHash,
              amountStroops: delivery.feeStroops,
              amountUsdc: delivery.feeUsdc,
              fromWallet:
                this.blockchain.contractId || 'SOROBAN_ESCROW_CONTRACT',
              toWallet: delivery.rider?.walletAddress || 'RIDER_WALLET',
              ledgerSequence: ledgerSequence ?? null,
            },
          });
        }

        await this.ensureActivity({
          deliveryId: delivery.id,
          status: DeliveryStatus.CONFIRMED,
          actorId: delivery.customerId,
          actorRole: UserRole.CUSTOMER,
          note: 'Customer confirmed delivery with unique code; Soroban escrow released to rider.',
          txHash: txHash ?? null,
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

        if (txHash) {
          await this.prisma.escrowTransaction.upsert({
            where: { txHash },
            update: { ...(ledgerSequence ? { ledgerSequence } : {}) },
            create: {
              deliveryId: delivery.id,
              txType: EscrowTxType.REFUND,
              txHash,
              amountStroops: delivery.feeStroops,
              amountUsdc: delivery.feeUsdc,
              fromWallet:
                this.blockchain.contractId || 'SOROBAN_ESCROW_CONTRACT',
              toWallet: delivery.customer.walletAddress,
              ledgerSequence: ledgerSequence ?? null,
            },
          });
        }

        await this.ensureActivity({
          deliveryId: delivery.id,
          status: DeliveryStatus.REFUNDED,
          actorId: delivery.customerId,
          actorRole: UserRole.CUSTOMER,
          note: `Delivery cancelled; ${delivery.feeUsdc} USDC refunded from Soroban escrow.`,
          txHash: txHash ?? null,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to reconcile Soroban event: ${(err as Error).message}`,
      );
    }
  }
}
