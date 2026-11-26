import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DeliveryStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  AcceptDeliveryDto,
  AssignRiderDto,
  CancelDeliveryDto,
  ConfirmDeliveryDto,
  CreateDeliveryDto,
  RecordEscrowFundingDto,
  UpdateDeliveryStatusDto,
} from './deliveries.dto';
import { DeliveriesService } from './deliveries.service';

@ApiTags('Deliveries & Escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({
    summary:
      'Create a new delivery request with pickup, drop-off, instructions, and USDC fee',
  })
  create(@Req() req: any, @Body() dto: CreateDeliveryDto) {
    return this.deliveriesService.createDelivery(req.user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List delivery requests scoped to the authenticated Customer or Rider',
  })
  @ApiQuery({ name: 'status', required: false, enum: DeliveryStatus })
  @ApiQuery({ name: 'openOnly', required: false, type: Boolean })
  list(
    @Req() req: any,
    @Query('status') status?: DeliveryStatus,
    @Query('openOnly') openOnly?: string,
  ) {
    return this.deliveriesService.listDeliveries(req.user.sub, req.user.role, {
      status,
      openOnly: openOnly === 'true',
    });
  }

  @Get('transactions/history')
  @ApiOperation({
    summary:
      'Get Stellar Testnet escrow transaction history with explorer references',
  })
  transactions(@Req() req: any) {
    return this.deliveriesService.getTransactionHistory(req.user.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get delivery details, activity timeline, and escrow payment status',
  })
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.deliveriesService.getDeliveryById(
      id,
      req.user.sub,
      req.user.role,
    );
  }

  @Post(':id/fund')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({
    summary: 'Record Soroban escrow funding transaction hash for a delivery',
  })
  fund(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: RecordEscrowFundingDto,
  ) {
    return this.deliveriesService.recordEscrowFunding(id, req.user.sub, dto);
  }

  @Post(':id/assign')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Assign an available rider to a delivery request' })
  assign(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: AssignRiderDto,
  ) {
    return this.deliveriesService.assignRider(id, req.user.sub, dto);
  }

  @Post(':id/accept')
  @Roles(UserRole.RIDER)
  @ApiOperation({ summary: 'Accept a funded or assigned delivery request' })
  accept(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: AcceptDeliveryDto,
  ) {
    return this.deliveriesService.acceptDelivery(id, req.user.sub, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.RIDER)
  @ApiOperation({
    summary: 'Update delivery progress (PICKED_UP, IN_TRANSIT, DELIVERED)',
  })
  updateStatus(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveriesService.updateDeliveryStatus(id, req.user.sub, dto);
  }

  @Post(':id/confirm')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({
    summary:
      'Confirm delivery using the unique confirmation code and record escrow release',
  })
  confirm(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ConfirmDeliveryDto,
  ) {
    return this.deliveriesService.confirmDelivery(id, req.user.sub, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({
    summary: 'Cancel an eligible delivery request and record Soroban escrow refund',
  })
  cancel(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: CancelDeliveryDto,
  ) {
    return this.deliveriesService.cancelDelivery(id, req.user.sub, dto);
  }
}
