import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  sub: string;
  walletAddress: string;
  role: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader: string | undefined = req.headers?.authorization;
    const cookieToken: string | undefined = req.cookies?.tumaride_token;

    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : cookieToken;

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      const secret =
        process.env.JWT_SECRET || 'tumaride-dev-jwt-secret-change-me';
      const payload = jwt.verify(token, secret) as AuthenticatedUser;
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }
}
