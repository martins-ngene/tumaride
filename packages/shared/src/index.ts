export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  RIDER = 'RIDER',
}

export enum DeliveryStatus {
  CREATED = 'CREATED',
  FUNDED = 'FUNDED',
  ASSIGNED = 'ASSIGNED',
  ACCEPTED = 'ACCEPTED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum EscrowStatus {
  UNFUNDED = 'UNFUNDED',
  LOCKED = 'LOCKED',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
}

export enum EscrowTxType {
  FUND = 'FUND',
  RELEASE = 'RELEASE',
  REFUND = 'REFUND',
}

export interface UserProfileDto {
  id: string;
  walletAddress: string;
  role: UserRole;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  createdAt: string;
  riderProfile?: RiderProfileDto | null;
}

export interface RiderProfileDto {
  id: string;
  userId: string;
  vehicleType: string;
  licensePlate?: string | null;
  isAvailable: boolean;
  completedDeliveries: number;
  rating: number;
}

export interface DeliveryActivityDto {
  id: string;
  deliveryId: string;
  status: DeliveryStatus;
  actorId?: string | null;
  actorRole?: UserRole | null;
  note?: string | null;
  txHash?: string | null;
  createdAt: string;
}

export interface EscrowTransactionDto {
  id: string;
  deliveryId: string;
  txType: EscrowTxType;
  txHash: string;
  amountStroops: string;
  amountUsdc: string;
  fromWallet: string;
  toWallet: string;
  ledgerSequence?: number | null;
  explorerUrl: string;
  createdAt: string;
}

export interface DeliveryRequestDto {
  id: string;
  onChainDeliveryId: string;
  customerId: string;
  customerWallet: string;
  riderId?: string | null;
  riderWallet?: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  instructions?: string | null;
  feeUsdc: string;
  feeStroops: string;
  status: DeliveryStatus;
  escrowStatus: EscrowStatus;
  confirmationCode?: string;
  confirmationCodeHash: string;
  fundTxHash?: string | null;
  releaseTxHash?: string | null;
  refundTxHash?: string | null;
  createdAt: string;
  updatedAt: string;
  activities?: DeliveryActivityDto[];
  transactions?: EscrowTransactionDto[];
}

export interface CreateDeliveryRequestDto {
  pickupAddress: string;
  dropoffAddress: string;
  instructions?: string;
  feeUsdc: string;
  preferredRiderId?: string;
}

export interface ConfirmDeliveryDto {
  confirmationCode: string;
  releaseTxHash?: string;
}

export interface CancelDeliveryDto {
  reason?: string;
  refundTxHash?: string;
}

export interface WalletChallengeResponseDto {
  walletAddress: string;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface AuthSessionResponseDto {
  accessToken: string;
  user: UserProfileDto;
}
