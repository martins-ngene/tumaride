import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { WalletChallengeDto, WalletVerifyDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createChallenge(dto: WalletChallengeDto) {
    if (!StrKey.isValidEd25519PublicKey(dto.walletAddress)) {
      throw new BadRequestException('Invalid Stellar Ed25519 public key');
    }

    const nonce = crypto.randomBytes(24).toString('hex');
    const timeoutSec = Number(process.env.WALLET_CHALLENGE_TIMEOUT_SECONDS || 300);
    const expiresAt = new Date(Date.now() + timeoutSec * 1000);
    const message = `Tuma Ride Authentication Challenge\nWallet: ${dto.walletAddress}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}`;

    await this.prisma.walletNonce.create({
      data: {
        walletAddress: dto.walletAddress,
        nonce,
        message,
        expiresAt,
      },
    });

    return {
      walletAddress: dto.walletAddress,
      nonce,
      message,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyAndLogin(dto: WalletVerifyDto) {
    if (!StrKey.isValidEd25519PublicKey(dto.walletAddress)) {
      throw new BadRequestException('Invalid Stellar Ed25519 public key');
    }

    const challenge = await this.prisma.walletNonce.findUnique({
      where: { nonce: dto.nonce },
    });

    if (
      !challenge ||
      challenge.walletAddress !== dto.walletAddress ||
      challenge.consumed
    ) {
      throw new UnauthorizedException('Invalid or already consumed challenge nonce');
    }

    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('Authentication challenge has expired');
    }

    const keypair = Keypair.fromPublicKey(dto.walletAddress);
    const messageBuf = Buffer.from(challenge.message, 'utf8');
    const signatureBuf = Buffer.from(dto.signature, 'base64');

    const sep53Digest = crypto
      .createHash('sha256')
      .update('Stellar Signed Message:\n', 'utf8')
      .update(messageBuf)
      .digest();

    let isValid = false;
    try {
      isValid =
        signatureBuf.length === 64 &&
        (keypair.verify(sep53Digest, signatureBuf) ||
          keypair.verify(messageBuf, signatureBuf));
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid Stellar wallet signature');
    }

    const consumed = await this.prisma.walletNonce.updateMany({
      where: { id: challenge.id, consumed: false, expiresAt: { gt: new Date() } },
      data: { consumed: true },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException(
        'Authentication challenge expired or was already consumed',
      );
    }

    let user = await this.prisma.user.findUnique({
      where: { walletAddress: dto.walletAddress },
      include: { riderProfile: true },
    });

    if (!user) {
      const role = dto.role || UserRole.CUSTOMER;
      const defaultName =
        dto.fullName?.trim() ||
        `${role === UserRole.RIDER ? 'Rider' : 'Customer'} ${dto.walletAddress.slice(0, 6)}`;

      user = await this.prisma.user.create({
        data: {
          walletAddress: dto.walletAddress,
          role,
          fullName: defaultName,
          phone: dto.phone,
          email: dto.email,
          ...(role === UserRole.RIDER
            ? {
                riderProfile: {
                  create: {
                    vehicleType: dto.vehicleType || 'Motorbike',
                    licensePlate: dto.licensePlate || null,
                    isAvailable: true,
                  },
                },
              }
            : {}),
        },
        include: { riderProfile: true },
      });
    }

    const secret = process.env.JWT_SECRET || 'tumaride-dev-jwt-secret-change-me';
    const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
    const accessToken = jwt.sign(
      {
        sub: user.id,
        walletAddress: user.walletAddress,
        role: user.role,
      },
      secret,
      { expiresIn },
    );

    return {
      accessToken,
      user,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { riderProfile: true },
    });
    if (!user) {
      throw new UnauthorizedException('User account not found');
    }
    return user;
  }
}
