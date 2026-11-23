import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { DeliveryStatus } from '@prisma/client';

export class CreateDeliveryDto {
  @ApiProperty({ example: 'Westlands Mall, Nairobi' })
  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @ApiProperty({ example: 'Kilimani Junction, Nairobi' })
  @IsString()
  @IsNotEmpty()
  dropoffAddress: string;

  @ApiPropertyOptional({ example: 'Call upon arrival at gate B' })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiProperty({
    example: '15.00',
    description: 'Delivery fee in simulated USDC (up to 7 decimal places)',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,7})?$/, {
    message: 'feeUsdc must be a positive decimal string (e.g. "15.00")',
  })
  feeUsdc: string;

  @ApiPropertyOptional({
    description: 'Optional preferred rider user ID to pre-assign',
  })
  @IsOptional()
  @IsString()
  preferredRiderId?: string;
}

export class RecordEscrowFundingDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    description: 'Stellar Testnet transaction hash from client-side fund_escrow',
  })
  @IsString()
  @IsNotEmpty()
  txHash: string;
}

export class AssignRiderDto {
  @ApiProperty({ description: 'Rider user ID to assign' })
  @IsString()
  @IsNotEmpty()
  riderId: string;

  @ApiPropertyOptional({
    description: 'Optional on-chain assign_rider txHash if already funded',
  })
  @IsOptional()
  @IsString()
  txHash?: string;
}

export class AcceptDeliveryDto {
  @ApiPropertyOptional({
    description: 'Optional on-chain assign_rider txHash signed by rider',
  })
  @IsOptional()
  @IsString()
  txHash?: string;
}

export class UpdateDeliveryStatusDto {
  @ApiProperty({
    enum: [
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.DELIVERED,
    ],
  })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;

  @ApiPropertyOptional({ example: 'Package handed to recipient' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: 'On-chain mark_delivered txHash when marking DELIVERED',
  })
  @IsOptional()
  @IsString()
  txHash?: string;
}

export class ConfirmDeliveryDto {
  @ApiProperty({ example: 'TUMA-482910' })
  @IsString()
  @IsNotEmpty()
  confirmationCode: string;

  @ApiPropertyOptional({
    description: 'On-chain confirm_and_release txHash signed by customer',
  })
  @IsOptional()
  @IsString()
  releaseTxHash?: string;
}

export class CancelDeliveryDto {
  @ApiPropertyOptional({ example: 'Customer changed pickup schedule' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'On-chain cancel_and_refund txHash if escrow was funded',
  })
  @IsOptional()
  @IsString()
  refundTxHash?: string;
}
