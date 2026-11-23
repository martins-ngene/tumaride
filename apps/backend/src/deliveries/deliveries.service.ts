import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  EscrowStatus,
  EscrowTxType,
  UserRole,
} from '@prisma/client';
import * as crypto from 'crypto';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcceptDeliveryDto,
  AssignRiderDto,
  CancelDeliveryDto,
  ConfirmDeliveryDto,
  CreateDeliveryDto,
  RecordEscrowFundingDto,
  UpdateDeliveryStatusDto,
} from './deliveries.dto';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchain: BlockchainService,
  ) {}

  private usdcToStroops(usdc: string): bigint {
    const [whole, frac = ''] = usdc.split('.');
    const padded = (frac + '0000000').slice(0, 7);
    const stroops = BigInt(whole) * 10_000_000n + BigInt(padded);
    if (stroops <= 0n) {
      throw new BadRequestException('Delivery fee must be greater than zero');
    }
    return stroops;
  }

  private generateConfirmationCode(): { code: string; hash: string } {
    const digits = crypto.randomInt(100000, 999999).toString();
    const code = `TUMA-${digits}`;
    const hash = crypto.createHash('sha256').update(code, 'utf8').digest('hex');
    return { code, hash };
  }

  private generateOnChainDeliveryId(): bigint {
    const ts = BigInt(Date.now());
    const rand = BigInt(crypto.randomInt(100, 999));
    return ts * 1000n + rand;
  }

  private serialize(delivery: any, viewerUserId?: string) {
    const isCustomer = viewerUserId && delivery.customerId === viewerUserId;
    return {
      ...delivery,
      onChainDeliveryId: delivery.onChainDeliveryId.toString(),
      feeStroops: delivery.feeStroops.toString(),
      confirmationCode: isCustomer ? delivery.confirmationCode : undefined,
      customerWallet: delivery.customer?.walletAddress,
      riderWallet: delivery.rider?.walletAddress ?? null,
      transactions: (delivery.transactions || []).map((tx: any) => ({
        ...tx,
        amountStroops: tx.amountStroops.toString(),
        explorerUrl: this.blockchain.getExplorerTxUrl(tx.txHash),
      })),
    };
  }

  async createDelivery(customerId: string, dto: CreateDeliveryDto) {
    const feeStroops = this.usdcToStroops(dto.feeUsdc);
    const { code, hash } = this.generateConfirmationCode();
    const onChainDeliveryId = this.generateOnChainDeliveryId();

    if (dto.preferredRiderId) {
      const rider = await this.prisma.user.findUnique({
        where: { id: dto.preferredRiderId },
      });
      if (!rider || rider.role !== UserRole.RIDER) {
        throw new BadRequestException('Preferred rider not found');
      }
      if (rider.id === customerId) {
        throw new BadRequestException('Customer cannot assign themselves as rider');
      }
    }

    const delivery = await this.prisma.deliveryRequest.create({
      data: {
        onChainDeliveryId,
        customerId,
        riderId: dto.preferredRiderId || null,
        pickupAddress: dto.pickupAddress,
        dropoffAddress: dto.dropoffAddress,
        instructions: dto.instructions || null,
        feeUsdc: dto.feeUsdc,
        feeStroops,
        status: DeliveryStatus.CREATED,
        escrowStatus: EscrowStatus.UNFUNDED,
        confirmationCode: code,
        confirmationCodeHash: hash,
      },
      include: {
        customer: true,
        rider: { include: { riderProfile: true } },
        activities: true,
        transactions: true,
      },
    });

    await this.prisma.deliveryActivity.create({
      data: {
        deliveryId: delivery.id,
        status: DeliveryStatus.CREATED,
        actorId: customerId,
        actorRole: UserRole.CUSTOMER,
        note: 'Delivery request created; awaiting USDC escrow funding.',
      },
    });

    return this.serialize(delivery, customerId);
  }

  async listDeliveries(
    userId: string,
    role: UserRole,
    filter?: { status?: DeliveryStatus; openOnly?: boolean },
  ) {
    let where: any = {};

    if (role === UserRole.CUSTOMER) {
      where.customerId = userId;
    } else if (filter?.openOnly) {
      where.riderId = null;
      where.status = DeliveryStatus.FUNDED;
    } else {
      where.OR = [
        { riderId: userId },
        { riderId: null, status: DeliveryStatus.FUNDED },
      ];
    }

    if (filter?.status) {
      where.status = filter.status;
    }

    const deliveries = await this.prisma.deliveryRequest.findMany({
      where,
      include: {
        customer: true,
        rider: { include: { riderProfile: true } },
        transactions: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return deliveries.map((d) => this.serialize(d, userId));
  }

  async getDeliveryById(deliveryId: string, userId: string) {
    const delivery = await this.prisma.deliveryRequest.findUnique({
      where: { id: deliveryId },
      include: {
        customer: true,
        rider: { include: { riderProfile: true } },
        activities: { orderBy: { createdAt: 'asc' } },
        transactions: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery request not found');
    }

    return this.serialize(delivery, userId);
  }

  async recordEscrowFunding(
    deliveryId: string,
    customerId: string,
    dto: RecordEscrowFundingDto,
  ) {
    const delivery = await this.prisma.deliveryRequest.findUnique({
      where: { id: deliveryId },
      include: { customer: true, rider: true },
    });

    if (!delivery) throw new NotFoundException('Delivery request not found');
    if (delivery.customerId !== customerId) {
      throw new ForbiddenException('Only the customer can fund this delivery');
    }
    if (delivery.escrowStatus !== EscrowStatus.UNFUNDED) {
      throw new ConflictException('Delivery escrow is already funded or settled');
    }

    const nextStatus = delivery.riderId
      ? DeliveryStatus.ASSIGNED
      : DeliveryStatus.FUNDED;

    const updated = await this.prisma.deliveryRequest.update({
      where: { id: deliveryId },
      data: {
        status: nextStatus,
        escrowStatus: EscrowStatus.LOCKED,
        fundTxHash: dto.txHash,
      },
      include: {
        customer: true,
        rider: { include: { riderProfile: true } },
        activities: { orderBy: { createdAt: 'asc' } },
        transactions: { orderBy: { createdAt: 'asc' } },
      },
    });

    await this.prisma.escrowTransaction.create({
      data: {
        deliveryId,
        txType: EscrowTxType.FUND,
        txHash: dto.txHash,
        amountStroops: delivery.feeStroops,
        amountUsdc: delivery.feeUsdc,
        fromWallet: delivery.customer.walletAddress,
        toWallet: this.blockchain.contractId || 'SOROBAN_ESCROW_CONTRACT',
      },
    });

    await this.prisma.deliveryActivity.create({
      data: {
        deliveryId,
        status: nextStatus,
        actorId: customerId,
        actorRole: UserRole.CUSTOMER,
        note: `Locked ${delivery.feeUsdc} USDC in Soroban escrow.`,
        txHash: dto.txHash,
      },
    });

    return this.getDeliveryById(deliveryId, customerId);
  }

  async assignRider(
    deliveryId: string,
    customerId: string,
    dto: AssignRiderDto,
  ) {
    const delivery = await this.prisma.deliveryRequest.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) throw new NotFoundException('Delivery request not found');
    if (delivery.customerId !== customerId) {
      throw new ForbiddenException('Only the customer can assign a rider');
    }
    if (
      delivery.status === DeliveryStatus.CONFIRMED ||
      delivery.status === DeliveryStatus.CANCELLED ||
      delivery.status === DeliveryStatus.REFUNDED
    ) {
      throw new ConflictException('Cannot assign rider to a settled delivery');
    }

    const rider = await this.prisma.user.findUnique({
      where: { id: dto.riderId },
    });
    if (!rider || rider.role !== UserRole.RIDER) {
      throw new BadRequestException('Selected user is not a registered rider');
    }

    await this.prisma.deliveryRequest.update({
      where: { id: deliveryId },
      data: {
        riderId: dto.riderId,
        status: DeliveryStatus.ASSIGNED,
      },
    });

    await this.prisma.deliveryActivity.create({
      data: {
        deliveryId,
        status: DeliveryStatus.ASSIGNED,
        actorId: customerId,
        actorRole: UserRole.CUSTOMER,
        note: `Assigned rider ${rider.fullName}.`,
        txHash: dto.txHash || null,
      },
    });

    return this.getDeliveryById(deliveryId, customerId);
  }

  async acceptDelivery(
    deliveryId: string,
    riderId: string,
    dto: AcceptDeliveryDto,
  ) {
    const delivery = await this.prisma.deliveryRequest.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) throw new NotFoundException('Delivery request not found');
    if (delivery.escrowStatus !== EscrowStatus.LOCKED) {
      throw new BadRequestException(
        'Delivery must be funded in Soroban escrow before acceptance',
      );
    }
    if (delivery.riderId && delivery.riderId !== riderId) {
      throw new ConflictException('Delivery is already assigned to another rider');
    }
    if (
      delivery.status !== DeliveryStatus.FUNDED &&
      delivery.status !== DeliveryStatus.ASSIGNED
    ) {
      throw new ConflictException('Delivery cannot be accepted in its current state');
    }

    await this.prisma.deliveryRequest.update({
      where: { id: deliveryId },
      data: {
        riderId,
        status: DeliveryStatus.ACCEPTED,
      },
    });

    await this.prisma.deliveryActivity.create({
      data: {
        deliveryId,
        status: DeliveryStatus.ACCEPTED,
        actorId: riderId,
        actorRole: UserRole.RIDER,
        note: 'Rider accepted delivery request.',
        txHash: dto.txHash || null,
      },
    });

    return this.getDeliveryById(deliveryId, riderId);
  }

  async updateDeliveryStatus(
    deliveryId: string,
    riderId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const delivery = await this.prisma.deliveryRequest.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) throw new NotFoundException('Delivery request not found');
    if (delivery.riderId !== riderId) {
      throw new ForbiddenException('Only the assigned rider can update delivery status');
    }

    const allowedTransitions: Record<string, DeliveryStatus[]> = {
      [DeliveryStatus.ACCEPTED]: [
        DeliveryStatus.PICKED_UP,
        DeliveryStatus.IN_TRANSIT,
        DeliveryStatus.DELIVERED,
      ],
      [DeliveryStatus.PICKED_UP]: [
        DeliveryStatus.IN_TRANSIT,
        DeliveryStatus.DELIVERED,
      ],
      [DeliveryStatus.IN_TRANSIT]: [DeliveryStatus.DELIVERED],
    };

    const allowed = allowedTransitions[delivery.status] || [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition from ${delivery.status} to ${dto.status}`,
      );
    }

    await this.prisma.deliveryRequest.update({
      where: { id: deliveryId },
      data: { status: dto.status },
    });

    await this.prisma.deliveryActivity.create({
      data: {
        deliveryId,
        status: dto.status,
        actorId: riderId,
        actorRole: UserRole.RIDER,
        note: dto.note || `Delivery status updated to ${dto.status}.`,
        txHash: dto.txHash || null,
      },
    });

    return this.getDeliveryById(deliveryId, riderId);
  }

  async confirmDelivery(
    deliveryId: string,
    customerId: string,
    dto: ConfirmDeliveryDto,
  ) {
    const delivery = await this.prisma.deliveryRequest.findUnique({
      where: { id: deliveryId },
      include: { customer: true, rider: true },
    });
    if (!delivery) throw new NotFoundException('Delivery request not found');
    if (delivery.customerId !== customerId) {
      throw new ForbiddenException('Only the customer can confirm this delivery');
    }

    // Duplicate settlement guard
    if (
      delivery.escrowStatus === EscrowStatus.RELEASED ||
      delivery.escrowStatus === EscrowStatus.REFUNDED ||
      delivery.status === DeliveryStatus.CONFIRMED
    ) {
      throw new ConflictException('Duplicate settlement rejected: delivery is already settled');
    }

    if (delivery.status !== DeliveryStatus.DELIVERED) {
      throw new BadRequestException(
        'Rider must mark delivery as DELIVERED before customer confirmation',
      );
    }

    const providedHash = crypto
      .createHash('sha256')
      .update(dto.confirmationCode.trim(), 'utf8')
      .digest('hex');

    if (providedHash !== delivery.confirmationCodeHash) {
      throw new BadRequestException('Invalid delivery confirmation code');
    }

    const releaseTxHash =
      dto.releaseTxHash ||
      `sim_release_${crypto.randomBytes(16).toString('hex')}`;

    await this.prisma.deliveryRequest.update({
      where: { id: deliveryId },
      data: {
        status: DeliveryStatus.CONFIRMED,
        escrowStatus: EscrowStatus.RELEASED,
        releaseTxHash,
      },
    });

    if (delivery.riderId) {
      await this.prisma.riderProfile
        .update({
          where: { userId: delivery.riderId },
          data: { completedDeliveries: { increment: 1 } },
        })
        .catch(() => null);
    }

    await this.prisma.escrowTransaction.create({
      data: {
        deliveryId,
        txType: EscrowTxType.RELEASE,
        txHash: releaseTxHash,
        amountStroops: delivery.feeStroops,
        amountUsdc: delivery.feeUsdc,
        fromWallet: this.blockchain.contractId || 'SOROBAN_ESCROW_CONTRACT',
        toWallet: delivery.rider?.walletAddress || 'RIDER_WALLET',
      },
    });

    await this.prisma.deliveryActivity.create({
      data: {
        deliveryId,
        status: DeliveryStatus.CONFIRMED,
        actorId: customerId,
        actorRole: UserRole.CUSTOMER,
        note: 'Customer confirmed delivery with unique code; Soroban escrow released to rider.',
        txHash: releaseTxHash,
      },
    });

    return this.getDeliveryById(deliveryId, customerId);
  }

  async cancelDelivery(
    deliveryId: string,
    customerId: string,
    dto: CancelDeliveryDto,
  ) {
    const delivery = await this.prisma.deliveryRequest.findUnique({
      where: { id: deliveryId },
      include: { customer: true },
    });
    if (!delivery) throw new NotFoundException('Delivery request not found');
    if (delivery.customerId !== customerId) {
      throw new ForbiddenException('Only the customer can cancel this delivery');
    }

    if (
      delivery.escrowStatus === EscrowStatus.RELEASED ||
      delivery.escrowStatus === EscrowStatus.REFUNDED ||
      delivery.status === DeliveryStatus.CANCELLED ||
      delivery.status === DeliveryStatus.REFUNDED
    ) {
      throw new ConflictException('Duplicate settlement rejected: delivery is already settled or cancelled');
    }

    const ineligibleStatuses = new Set<DeliveryStatus>([
      DeliveryStatus.DELIVERED,
      DeliveryStatus.CONFIRMED,
    ]);
    if (ineligibleStatuses.has(delivery.status)) {
      throw new BadRequestException(
        'Cancellation is not eligible once the rider has completed delivery',
      );
    }

    const wasFunded = delivery.escrowStatus === EscrowStatus.LOCKED;
    const nextStatus = wasFunded
      ? DeliveryStatus.REFUNDED
      : DeliveryStatus.CANCELLED;
    const nextEscrowStatus = wasFunded
      ? EscrowStatus.REFUNDED
      : EscrowStatus.UNFUNDED;

    const refundTxHash = wasFunded
      ? dto.refundTxHash || `sim_refund_${crypto.randomBytes(16).toString('hex')}`
      : null;

    await this.prisma.deliveryRequest.update({
      where: { id: deliveryId },
      data: {
        status: nextStatus,
        escrowStatus: nextEscrowStatus,
        cancelReason: dto.reason || 'Cancelled by customer',
        ...(refundTxHash ? { refundTxHash } : {}),
      },
    });

    if (wasFunded && refundTxHash) {
      await this.prisma.escrowTransaction.create({
        data: {
          deliveryId,
          txType: EscrowTxType.REFUND,
          txHash: refundTxHash,
          amountStroops: delivery.feeStroops,
          amountUsdc: delivery.feeUsdc,
          fromWallet: this.blockchain.contractId || 'SOROBAN_ESCROW_CONTRACT',
          toWallet: delivery.customer.walletAddress,
        },
      });
    }

    await this.prisma.deliveryActivity.create({
      data: {
        deliveryId,
        status: nextStatus,
        actorId: customerId,
        actorRole: UserRole.CUSTOMER,
        note: wasFunded
          ? `Delivery cancelled; ${delivery.feeUsdc} USDC refunded from Soroban escrow.`
          : 'Unfunded delivery request cancelled.',
        txHash: refundTxHash,
      },
    });

    return this.getDeliveryById(deliveryId, customerId);
  }

  async getTransactionHistory(userId: string) {
    const txs = await this.prisma.escrowTransaction.findMany({
      where: {
        delivery: {
          OR: [{ customerId: userId }, { riderId: userId }],
        },
      },
      include: {
        delivery: {
          select: {
            id: true,
            onChainDeliveryId: true,
            pickupAddress: true,
            dropoffAddress: true,
            status: true,
            escrowStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return txs.map((tx: any) => ({
      ...tx,
      amountStroops: tx.amountStroops.toString(),
      explorerUrl: this.blockchain.getExplorerTxUrl(tx.txHash),
      delivery: tx.delivery
        ? {
            id: tx.delivery.id,
            onChainDeliveryId: tx.delivery.onChainDeliveryId.toString(),
            pickupAddress: tx.delivery.pickupAddress,
            dropoffAddress: tx.delivery.dropoffAddress,
            status: tx.delivery.status,
            escrowStatus: tx.delivery.escrowStatus,
          }
        : undefined,
    }));
  }
}
