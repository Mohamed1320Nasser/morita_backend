import {
  JsonController,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Authorized,
  CurrentUser,
} from 'routing-controllers';
import { Service } from 'typedi';
import LoyaltyTierService from './loyalty-tier.service';
import { CreateLoyaltyTierDto, UpdateLoyaltyTierDto } from './dtos';
import API from '../../common/config/api.types';

@JsonController('/loyalty-tiers')
@Service()
export default class LoyaltyTierController {
  constructor(private loyaltyTierService: LoyaltyTierService) {}

  @Get('/')
  async getAllTiers() {
    return await this.loyaltyTierService.getAllTiers();
  }

  @Get('/:id')
  async getTierById(@Param('id') id: string) {
    return await this.loyaltyTierService.getTierById(id);
  }

  @Post('/')
  @Authorized(API.Role.admin)
  async createTier(@Body() data: CreateLoyaltyTierDto) {
    return await this.loyaltyTierService.createTier(data);
  }

  @Put('/:id')
  @Authorized(API.Role.admin)
  async updateTier(@Param('id') id: string, @Body() data: UpdateLoyaltyTierDto) {
    return await this.loyaltyTierService.updateTier(id, data);
  }

  @Delete('/:id')
  @Authorized(API.Role.admin)
  async deleteTier(@Param('id') id: string) {
    await this.loyaltyTierService.deleteTier(id);
    return { message: 'Loyalty tier deleted successfully' };
  }

  @Get('/me/info')
  @Authorized()
  async getMyTierInfo(@CurrentUser() user: API.User) {
    const info = await this.loyaltyTierService.getUserTierInfo(user.id);

    return {
      currentTier: info.currentTier,
      totalSpent: info.totalSpent.toNumber(),
      nextTier: info.nextTier,
      amountUntilNextTier: info.amountUntilNextTier?.toNumber() || null,
      tierHistory: info.tierHistory,
    };
  }

  @Post('/recalculate-all')
  @Authorized(API.Role.admin)
  async recalculateAllUserTiers() {
    const stats = await this.loyaltyTierService.recalculateAllUserTiers();
    return {
      message: 'Tier recalculation completed',
      ...stats,
    };
  }

  @Get('/user/:userId')
  async getUserTierInfo(@Param('userId') userId: number) {
    const info = await this.loyaltyTierService.getUserTierInfo(userId);

    return {
      currentTier: info.currentTier,
      totalSpent: info.totalSpent.toNumber(),
      nextTier: info.nextTier,
      amountUntilNextTier: info.amountUntilNextTier?.toNumber() || null,
      tierHistory: info.tierHistory,
    };
  }

  @Post('/user/:userId/update')
  @Authorized(API.Role.admin)
  async updateUserTier(@Param('userId') userId: number) {
    const result = await this.loyaltyTierService.updateUserTier(userId);

    return {
      tierChanged: result.tierChanged,
      oldTier: result.oldTier,
      newTier: result.newTier,
      totalSpent: result.totalSpent.toNumber(),
      message: result.tierChanged
        ? `Tier updated from ${result.oldTier?.name || 'None'} to ${result.newTier?.name || 'None'}`
        : 'Tier unchanged',
    };
  }
}
