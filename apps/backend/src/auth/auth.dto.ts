import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class WalletChallengeDto {
  @ApiProperty({
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    description: 'Stellar G-address public key',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'walletAddress must be a valid Stellar public key (G...)',
  })
  walletAddress: string;
}

export class WalletVerifyDto {
  @ApiProperty({
    example: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'walletAddress must be a valid Stellar public key (G...)',
  })
  walletAddress: string;

  @ApiProperty({ description: 'Nonce received from /auth/challenge' })
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @ApiProperty({
    description:
      'Base64-encoded Ed25519 signature of the challenge message signed by the Stellar wallet',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.CUSTOMER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 'Amina Okafor' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: '+254712345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'amina@tumaride.app' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    example: 'Motorbike',
    description: 'Vehicle type when registering as a RIDER',
  })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({
    example: 'KME 482X',
    description: 'License plate when registering as a RIDER',
  })
  @IsOptional()
  @IsString()
  licensePlate?: string;
}
