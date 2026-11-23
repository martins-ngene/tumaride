import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, EscrowStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto, UpdateRiderProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { riderProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
      include: { riderProfile: true },
    });
  }

  async listAvailableRiders(onlyAvailable = true) {
    return this.prisma.user.findMany({
      where: {
        role: UserRole.RIDER,
        ...(onlyAvailable ? { riderProfile: { isAvailable: true } } : {}),
      },
      include: { riderProfile: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateRiderProfile(userId: string, dto: UpdateRiderProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { riderProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.RIDER) {
      throw new ForbiddenException('Only riders can update rider profile');
    }

    if (!user.riderProfile) {
      return this.prisma.riderProfile.create({
        data: {
          userId,
          vehicleType: dto.vehicleType || 'Motorbike',
          licensePlate: dto.licensePlate || null,
          isAvailable: dto.isAvailable ?? true,
        },
      });
    }

    return this.prisma.riderProfile.update({
      where: { userId },
      data: {
        ...(dto.vehicleType !== undefined
          ? { vehicleType: dto.vehicleType }
          : {}),
        ...(dto.licensePlate !== undefined
          ? { licensePlate: dto.licensePlate }
          : {}),
        ...(dto.isAvailable !== undefined
          ? { isAvailable: dto.isAvailable }
          : {}),
      },
    });
  }

  async getCustomerDashboard(userId: string) {
    const [user, deliveries] = await Promise.all([
      this.getProfile(userId),
      this.prisma.deliveryRequest.findMany({
        where: { customerId: userId },
        include: {
          rider: { include: { riderProfile: true } },
          transactions: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const activeStatuses = new Set<DeliveryStatus>([
      DeliveryStatus.CREATED,
      DeliveryStatus.FUNDED,
      DeliveryStatus.ASSIGNED,
      DeliveryStatus.ACCEPTED,
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.DELIVERED,
    ]);

    const lockedStroops = deliveries
      .filter((d) => d.escrowStatus === EscrowStatus.LOCKED)
      .reduce((acc, d) => acc + BigInt(d.feeStroops), 0n);

    const releasedStroops = deliveries
      .filter((d) => d.escrowStatus === EscrowStatus.RELEASED)
      .reduce((acc, d) => acc + BigInt(d.feeStroops), 0n);

    return {
      user,
      summary: {
        totalDeliveries: deliveries.length,
        activeDeliveries: deliveries.filter((d) => activeStatuses.has(d.status))
          .length,
        completedDeliveries: deliveries.filter(
          (d) => d.status === DeliveryStatus.CONFIRMED,
        ).length,
        cancelledOrRefunded: deliveries.filter(
          (d) =>
            d.status === DeliveryStatus.CANCELLED ||
            d.status === DeliveryStatus.REFUNDED,
        ).length,
        escrowLockedUsdc: (Number(lockedStroops) / 1e7).toFixed(2),
        totalSettledUsdc: (Number(releasedStroops) / 1e7).toFixed(2),
      },
      recentDeliveries: deliveries.slice(0, 10).map((d) => ({
        ...d,
        onChainDeliveryId: d.onChainDeliveryId.toString(),
        feeStroops: d.feeStroops.toString(),
        transactions: (d.transactions || []).map((t) => ({
          ...t,
          amountStroops: t.amountStroops.toString(),
        })),
      })),
    };
  }

  async getRiderDashboard(userId: string) {
    const [user, myDeliveries, openDeliveries] = await Promise.all([
      this.getProfile(userId),
      this.prisma.deliveryRequest.findMany({
        where: { riderId: userId },
        include: { customer: true, transactions: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deliveryRequest.findMany({
        where: {
          riderId: null,
          status: DeliveryStatus.FUNDED,
        },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const earnedStroops = myDeliveries
      .filter((d) => d.escrowStatus === EscrowStatus.RELEASED)
      .reduce((acc, d) => acc + BigInt(d.feeStroops), 0n);

    const pendingStroops = myDeliveries
      .filter((d) => d.escrowStatus === EscrowStatus.LOCKED)
      .reduce((acc, d) => acc + BigInt(d.feeStroops), 0n);

    const serialize = (d: any) => ({
      ...d,
      confirmationCode: undefined,
      onChainDeliveryId: d.onChainDeliveryId.toString(),
      feeStroops: d.feeStroops.toString(),
      transactions: (d.transactions || []).map((t: any) => ({
        ...t,
        amountStroops: t.amountStroops.toString(),
      })),
    });

    return {
      user,
      summary: {
        assignedOrActive: myDeliveries.filter(
          (d) =>
            d.status !== DeliveryStatus.CONFIRMED &&
            d.status !== DeliveryStatus.CANCELLED &&
            d.status !== DeliveryStatus.REFUNDED,
        ).length,
        completedDeliveries: myDeliveries.filter(
          (d) => d.status === DeliveryStatus.CONFIRMED,
        ).length,
        availableOpenRequests: openDeliveries.length,
        totalEarnedUsdc: (Number(earnedStroops) / 1e7).toFixed(2),
        pendingEscrowUsdc: (Number(pendingStroops) / 1e7).toFixed(2),
      },
      activeAndHistory: myDeliveries.slice(0, 15).map(serialize),
      openRequests: openDeliveries.slice(0, 15).map(serialize),
    };
  }
}
