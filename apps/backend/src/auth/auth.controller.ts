import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { WalletChallengeDto, WalletVerifyDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('challenge')
  @ApiOperation({
    summary: 'Request a SEP-0010 style Stellar wallet authentication challenge',
  })
  challenge(@Body() dto: WalletChallengeDto) {
    return this.authService.createChallenge(dto);
  }

  @Post('verify')
  @ApiOperation({
    summary:
      'Verify signed wallet challenge to register or log in as Customer or Rider',
  })
  verify(@Body() dto: WalletVerifyDto) {
    return this.authService.verifyAndLogin(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get authenticated user profile and role' })
  me(@Req() req: any) {
    return this.authService.getMe(req.user.sub);
  }
}
