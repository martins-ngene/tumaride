import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlockchainService } from './blockchain.service';

@ApiTags('Blockchain')
@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Get Stellar Testnet & Soroban Delivery Escrow contract config',
  })
  getConfig() {
    return this.blockchainService.getConfig();
  }

  @Get('tx/:hash')
  @ApiOperation({
    summary: 'Verify a Stellar Testnet transaction hash via Soroban RPC',
  })
  verifyTx(@Param('hash') hash: string) {
    return this.blockchainService.verifyTransaction(hash);
  }
}
