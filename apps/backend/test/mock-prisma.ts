import * as crypto from 'crypto';

function cuid() {
  return 'c' + crypto.randomBytes(10).toString('hex');
}

export function createMockPrisma() {
  const users: any[] = [];
  const walletNonces: any[] = [];
  const riderProfiles: any[] = [];
  const deliveries: any[] = [];
  const activities: any[] = [];
  const transactions: any[] = [];
  const syncStates: any[] = [];

  const attachUserRelations = (user: any, include?: any) => {
    if (!user) return null;
    const out = { ...user };
    if (include?.riderProfile) {
      out.riderProfile =
        riderProfiles.find((rp) => rp.userId === user.id) || null;
    }
    return out;
  };

  const attachDeliveryRelations = (delivery: any, include?: any) => {
    if (!delivery) return null;
    const out = { ...delivery };
    if (include?.customer) {
      out.customer = attachUserRelations(
        users.find((u) => u.id === delivery.customerId),
        include.customer?.include,
      );
    }
    if (include?.rider) {
      out.rider = delivery.riderId
        ? attachUserRelations(
            users.find((u) => u.id === delivery.riderId),
            include.rider?.include,
          )
        : null;
    }
    if (include?.activities) {
      out.activities = activities
        .filter((a) => a.deliveryId === delivery.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    if (include?.transactions) {
      out.transactions = transactions
        .filter((t) => t.deliveryId === delivery.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    return out;
  };

  return {
    walletNonce: {
      create: async ({ data }: any) => {
        const rec = {
          id: cuid(),
          consumed: false,
          createdAt: new Date(),
          ...data,
        };
        walletNonces.push(rec);
        return rec;
      },
      findUnique: async ({ where }: any) => {
        return (
          walletNonces.find(
            (n) =>
              (where.nonce && n.nonce === where.nonce) ||
              (where.id && n.id === where.id),
          ) || null
        );
      },
      update: async ({ where, data }: any) => {
        const rec = walletNonces.find((n) => n.id === where.id);
        if (!rec) throw new Error('WalletNonce not found');
        Object.assign(rec, data);
        return rec;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const rec of walletNonces) {
          if (where.id && rec.id !== where.id) continue;
          if (where.consumed !== undefined && rec.consumed !== where.consumed)
            continue;
          if (
            where.expiresAt?.gt &&
            new Date(rec.expiresAt).getTime() <=
              new Date(where.expiresAt.gt).getTime()
          ) {
            continue;
          }
          Object.assign(rec, data);
          count++;
        }
        return { count };
      },
    },
    user: {
      findUnique: async ({ where, include }: any) => {
        const user =
          users.find(
            (u) =>
              (where.id && u.id === where.id) ||
              (where.walletAddress && u.walletAddress === where.walletAddress),
          ) || null;
        return attachUserRelations(user, include);
      },
      findMany: async ({ where, include }: any) => {
        return users
          .filter((u) => {
            if (where?.role && u.role !== where.role) return false;
            if (where?.riderProfile?.isAvailable !== undefined) {
              const rp = riderProfiles.find((r) => r.userId === u.id);
              if (!rp || rp.isAvailable !== where.riderProfile.isAvailable)
                return false;
            }
            return true;
          })
          .map((u) => attachUserRelations(u, include));
      },
      create: async ({ data, include }: any) => {
        const now = new Date();
        const { riderProfile, ...userData } = data;
        const user = {
          id: cuid(),
          phone: null,
          email: null,
          createdAt: now,
          updatedAt: now,
          ...userData,
        };
        users.push(user);
        if (riderProfile?.create) {
          riderProfiles.push({
            id: cuid(),
            userId: user.id,
            vehicleType: 'Motorbike',
            licensePlate: null,
            isAvailable: true,
            completedDeliveries: 0,
            rating: 5.0,
            createdAt: now,
            updatedAt: now,
            ...riderProfile.create,
          });
        }
        return attachUserRelations(user, include);
      },
      update: async ({ where, data, include }: any) => {
        const user = users.find((u) => u.id === where.id);
        if (!user) throw new Error('User not found');
        Object.assign(user, data, { updatedAt: new Date() });
        return attachUserRelations(user, include);
      },
    },
    riderProfile: {
      create: async ({ data }: any) => {
        const now = new Date();
        const rec = {
          id: cuid(),
          completedDeliveries: 0,
          rating: 5.0,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        riderProfiles.push(rec);
        return rec;
      },
      update: async ({ where, data }: any) => {
        const rec = riderProfiles.find((r) => r.userId === where.userId);
        if (!rec) throw new Error('RiderProfile not found');
        if (data.completedDeliveries?.increment) {
          rec.completedDeliveries += data.completedDeliveries.increment;
        } else {
          Object.assign(rec, data);
        }
        rec.updatedAt = new Date();
        return rec;
      },
    },
    deliveryRequest: {
      create: async ({ data, include }: any) => {
        const now = new Date();
        const rec = {
          id: cuid(),
          riderId: null,
          instructions: null,
          fundTxHash: null,
          releaseTxHash: null,
          refundTxHash: null,
          cancelReason: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        deliveries.push(rec);
        return attachDeliveryRelations(rec, include);
      },
      findUnique: async ({ where, include }: any) => {
        const rec =
          deliveries.find(
            (d) =>
              (where.id && d.id === where.id) ||
              (where.onChainDeliveryId !== undefined &&
                d.onChainDeliveryId === where.onChainDeliveryId),
          ) || null;
        return attachDeliveryRelations(rec, include);
      },
      findMany: async ({ where, include }: any) => {
        return deliveries
          .filter((d) => {
            if (!where) return true;
            if (where.customerId && d.customerId !== where.customerId)
              return false;
            if (where.riderId !== undefined && d.riderId !== where.riderId)
              return false;
            if (where.status && d.status !== where.status) return false;
            if (where.OR) {
              const matched = where.OR.some((clause: any) => {
                if (clause.riderId !== undefined && d.riderId !== clause.riderId)
                  return false;
                if (clause.status && d.status !== clause.status) return false;
                return true;
              });
              if (!matched) return false;
            }
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((d) => attachDeliveryRelations(d, include));
      },
      update: async ({ where, data, include }: any) => {
        const rec = deliveries.find((d) => d.id === where.id);
        if (!rec) throw new Error('DeliveryRequest not found');
        Object.assign(rec, data, { updatedAt: new Date() });
        return attachDeliveryRelations(rec, include);
      },
    },
    deliveryActivity: {
      findFirst: async ({ where }: any) => {
        return (
          activities.find((a) => {
            if (where.deliveryId && a.deliveryId !== where.deliveryId)
              return false;
            if (where.status && a.status !== where.status) return false;
            if (where.txHash !== undefined && a.txHash !== where.txHash)
              return false;
            return true;
          }) || null
        );
      },
      create: async ({ data }: any) => {
        const rec = {
          id: cuid(),
          actorId: null,
          actorRole: null,
          note: null,
          txHash: null,
          createdAt: new Date(),
          ...data,
        };
        activities.push(rec);
        return rec;
      },
    },
    escrowTransaction: {
      create: async ({ data }: any) => {
        if (transactions.some((t) => t.txHash === data.txHash)) {
          throw new Error(`Unique constraint failed on txHash ${data.txHash}`);
        }
        const rec = {
          id: cuid(),
          ledgerSequence: null,
          createdAt: new Date(),
          ...data,
        };
        transactions.push(rec);
        return rec;
      },
      upsert: async ({ where, update, create }: any) => {
        const existing = transactions.find((t) => t.txHash === where.txHash);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const rec = {
          id: cuid(),
          ledgerSequence: null,
          createdAt: new Date(),
          ...create,
        };
        transactions.push(rec);
        return rec;
      },
      findMany: async ({ where, include }: any) => {
        return transactions
          .filter((t) => {
            if (!where?.delivery?.OR) return true;
            const d = deliveries.find((del) => del.id === t.deliveryId);
            if (!d) return false;
            return where.delivery.OR.some(
              (c: any) =>
                (c.customerId && d.customerId === c.customerId) ||
                (c.riderId && d.riderId === c.riderId),
            );
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((t) => {
            const d = deliveries.find((del) => del.id === t.deliveryId);
            return {
              ...t,
              ...(include?.delivery ? { delivery: d } : {}),
            };
          });
      },
    },
    syncState: {
      upsert: async ({ where, create }: any) => {
        let rec = syncStates.find((s) => s.id === where.id);
        if (!rec) {
          rec = { updatedAt: new Date(), ...create };
          syncStates.push(rec);
        }
        return rec;
      },
      update: async ({ where, data }: any) => {
        const rec = syncStates.find((s) => s.id === where.id);
        if (rec) Object.assign(rec, data, { updatedAt: new Date() });
        return rec;
      },
    },
    $connect: async () => {},
    $disconnect: async () => {},
  };
}
