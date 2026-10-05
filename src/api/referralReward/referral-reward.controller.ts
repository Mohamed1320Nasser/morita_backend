import {
  JsonController,
  Get,
  Put,
  Post,
  Param,
  Body,
  QueryParams,
  Authorized,
  HttpCode,
} from 'routing-controllers';
import { Service } from 'typedi';
import ReferralRewardService from './referral-reward.service';
import { UpdateReferralRewardConfigDto, GetRewardsDto, GetOrderRewardsDto, CancelOrderRewardDto } from './dtos';
import ReferralOrderRewardService from '../referral/referral-order-reward.service';
import { GetLeaderboardDto } from '../referral/dtos';
import API from '../../common/config/api.types';

@JsonController('/referral-reward')
@Service()
export default class ReferralRewardController {
  constructor(
    private referralRewardService: ReferralRewardService,
    private referralOrderRewardService: ReferralOrderRewardService
  ) {}

  /**
   * Get public configuration (safe fields only)
   */
  @Get('/config')
  @HttpCode(200)
  async getPublicConfig() {
    const config = await this.referralRewardService.getConfig();

    return {
      isEnabled: config.isEnabled,
      rewardMode: config.rewardMode,
      perReferralEnabled: config.perReferralEnabled,
      perReferralAmount: config.perReferralAmount,
      milestonesEnabled: config.milestonesEnabled,
      milestones: config.milestones,
      requireOnboarding: config.requireOnboarding,
      minimumDaysInServer: config.minimumDaysInServer,
      notifyDiscord: config.notifyDiscord,
      notifyDM: config.notifyDM,
      currencyName: config.currencyName,
      orderRewardEnabled: config.orderRewardEnabled,
      orderRewardType: config.orderRewardType,
      orderRewardValue: config.orderRewardValue,
      orderRewardMaxPerOrder: config.orderRewardMaxPerOrder,
      orderRewardMinOrderValue: config.orderRewardMinOrderValue,
      orderRewardOrderCount: config.orderRewardOrderCount,
      orderRewardWindowDays: config.orderRewardWindowDays,
      orderRewardHoldDays: config.orderRewardHoldDays,
    };
  }

  /**
   * Get full configuration (Admin only)
   */
  @Get('/admin/config')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async getConfig() {
    return await this.referralRewardService.getConfig();
  }

  /**
   * Update configuration (Admin only)
   */
  @Put('/admin/config')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async updateConfig(@Body() dto: UpdateReferralRewardConfigDto) {
    const config = await this.referralRewardService.updateConfig(dto);
    return {
      success: true,
      message: 'Referral reward configuration updated successfully',
      data: config,
    };
  }

  /**
   * Get statistics (Admin only)
   */
  @Get('/admin/stats')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async getStats() {
    return await this.referralRewardService.getStats();
  }

  /**
   * Get all rewards with pagination (Admin only)
   */
  @Get('/admin/rewards')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async getAllRewards(@QueryParams() query: GetRewardsDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    return await this.referralRewardService.getAllRewards(page, limit, query.search);
  }

  /**
   * Order rewards (Admin only): list with status filter and totals
   */
  @Get('/admin/order-rewards')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async getOrderRewards(@QueryParams() query: GetOrderRewardsDto) {
    return await this.referralOrderRewardService.list({
      page: query.page || 1,
      limit: query.limit || 10,
      status: query.status,
      search: query.search,
    });
  }

  /**
   * Cancel a pending order reward (Admin only), e.g. suspected self-referral
   */
  @Post('/admin/order-rewards/:id/cancel')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async cancelOrderReward(@Param('id') id: string, @Body() body: CancelOrderRewardDto) {
    return await this.referralOrderRewardService.cancel(id, body?.reason);
  }

  /**
   * Get top referrers leaderboard
   */
  @Get('/leaderboard')
  @HttpCode(200)
  async getLeaderboard(@QueryParams() query: GetLeaderboardDto) {
    const limit = query.limit || 10;
    return await this.referralRewardService.getTopReferrers(limit);
  }
}
