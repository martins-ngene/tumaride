import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Service liveness & readiness probe' })
  check() {
    return {
      status: 'ok',
      service: 'tumaride-backend',
      network: process.env.STELLAR_NETWORK || 'TESTNET',
      contractId: process.env.TUMARIDE_ESCROW_CONTRACT_ID || null,
      timestamp: new Date().toISOString(),
    };
  }
}
