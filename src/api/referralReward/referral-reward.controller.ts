import {
  JsonController,
  Get,
  Put,
  Body,
  QueryParams,
  Authorized,
  HttpCode,
} from 'routing-controllers';
import { Service } from 'typedi';
import ReferralRewardService from './referral-reward.service';
import { UpdateReferralRewardConfigDto, GetRewardsDto } from './dtos';
import API from '../../common/config/api.types';

@JsonController('/referral-reward')
@Service()
export default class ReferralRewardController {
  constructor(private referralRewardService: ReferralRewardService) {}

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
      currencyName: config.currencyName,
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
   * Get top referrers leaderboard
   */
  @Get('/leaderboard')
  @HttpCode(200)
  async getLeaderboard(@QueryParams() query: { limit?: number }) {
    const limit = query.limit || 10;
    return await this.referralRewardService.getTopReferrers(limit);
  }
}
