import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateProfileDto, UpdateRiderProfileDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Users & Dashboards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get authenticated user profile' })
  getProfile(@Req() req: any) {
    return this.usersService.getProfile(req.user.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update basic user profile details' })
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.sub, dto);
  }

  @Get('riders')
  @ApiOperation({ summary: 'List registered riders (filterable by availability)' })
  @ApiQuery({ name: 'available', required: false, type: Boolean })
  listRiders(@Query('available') available?: string) {
    const onlyAvailable = available !== 'false';
    return this.usersService.listAvailableRiders(onlyAvailable);
  }

  @Patch('rider-profile')
  @Roles(UserRole.RIDER)
  @ApiOperation({ summary: 'Update rider vehicle & availability status' })
  updateRiderProfile(@Req() req: any, @Body() dto: UpdateRiderProfileDto) {
    return this.usersService.updateRiderProfile(req.user.sub, dto);
  }

  @Get('dashboard/customer')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Customer role-based dashboard summary & history' })
  customerDashboard(@Req() req: any) {
    return this.usersService.getCustomerDashboard(req.user.sub);
  }

  @Get('dashboard/rider')
  @Roles(UserRole.RIDER)
  @ApiOperation({
    summary: 'Rider role-based dashboard, open requests, earnings & history',
  })
  riderDashboard(@Req() req: any) {
    return this.usersService.getRiderDashboard(req.user.sub);
  }
}
