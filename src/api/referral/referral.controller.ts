import {
  JsonController,
  Get,
  Post,
  Body,
  Param,
  QueryParams,
  Authorized,
  CurrentUser,
  HttpCode,
} from 'routing-controllers';
import { Service } from 'typedi';
import ReferralService from './referral.service';
import {
  TrackReferralDto,
  GiveRewardDto,
  GetLeaderboardDto,
  GetReferralsDto,
} from './dtos';
import API from '../../common/config/api.types';
import logger from '../../common/loggers';

@JsonController('/referral')
@Service()
export default class ReferralController {
  constructor(private referralService: ReferralService) {}

  @Post('/track')
  @HttpCode(201)
  async trackReferral(@Body() dto: TrackReferralDto) {
    return await this.referralService.trackReferral(dto);
  }

  @Post('/link/:discordId/:userId')
  @HttpCode(200)
  async linkReferralToUser(
    @Param('discordId') discordId: string,
    @Param('userId') userId: number
  ) {
    return await this.referralService.linkReferralToUser(discordId, userId);
  }

  @Post('/reward')
  @HttpCode(200)
  async giveReward(@Body() dto: GiveRewardDto) {
    const result = await this.referralService.giveReferralReward(dto);

    // If no referral exists (organic join), return a success response with null data
    if (result === null) {
      return {
        success: true,
        message: 'No referral found - user joined organically',
        data: null,
      };
    }

    return {
      success: true,
      message: 'Referral reward given successfully',
      data: result,
    };
  }

  @Get('/stats/discord/:discordId')
  @HttpCode(200)
  async getStatsByDiscordId(@Param('discordId') discordId: string) {
    return await this.referralService.getUserReferralStats(discordId);
  }

  @Get('/me/stats')
  @Authorized(API.Role.system)
  @HttpCode(200)
  async getMyStats(@CurrentUser() user: API.User) {
    return await this.referralService.getUserReferralStats(undefined, user.id);
  }


  @Get('/leaderboard')
  @HttpCode(200)
  async getLeaderboard(@QueryParams() query: GetLeaderboardDto & { sortBy?: string }) {
    const limit = query.limit || 10;
    const sortBy = query.sortBy || 'total';
    return await this.referralService.getLeaderboard(limit, sortBy);
  }

  @Get('/admin/all')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async getAllReferrals(@QueryParams() query: GetReferralsDto) {
    return await this.referralService.getAllReferrals(query);
  }

  @Get('/admin/user/:userId')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async getUserStats(@Param('userId') userId: number) {
    return await this.referralService.getUserReferralStats(undefined, userId);
  }

  @Get('/admin/fraud-analytics')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async getFraudAnalytics() {
    return await this.referralService.getFraudAnalytics();
  }

  @Get('/admin/network/:userId')
  @Authorized(API.Role.admin)
  @HttpCode(200)
  async getReferralNetwork(@Param('userId') userId: number) {
    return await this.referralService.getReferralNetwork(userId);
  }

  @Post('/invite/get-or-create')
  @HttpCode(200)
  async getOrCreateInvite(@Body() body: { discordId: string; guildId: string }) {
    const result = await this.referralService.getOrCreateInvite(body.discordId, body.guildId);
    logger.info(`[Referral Controller] getOrCreateInvite returning:`, result);
    return result;
  }

  @Post('/invite/sync')
  @HttpCode(200)
  async syncInvites(@Body() body: { guildId: string }) {
    return await this.referralService.syncDiscordInvites(body.guildId);
  }

  @Post('/invite/create')
  @HttpCode(200)
  async createInvite(@Body() body: { inviteCode: string; inviteUrl: string; discordId: string; channelId?: string; uses?: number }) {
    return await this.referralService.createInviteRecord(body);
  }

  @Get('/invite/list')
  @HttpCode(200)
  async listInvites(@QueryParams() query: { guildId?: string }) {
    return await this.referralService.listInvites();
  }

  @Post('/invite/update-usage')
  @HttpCode(200)
  async updateInviteUsage(@Body() body: { inviteCode: string; uses: number }) {
    return await this.referralService.updateInviteUsage(body.inviteCode, body.uses);
  }

  @Post('/member-left')
  @HttpCode(200)
  async memberLeft(@Body() body: { discordId: string; leftAt: string; leaveType: string }) {
    return await this.referralService.markMemberLeft(body.discordId, body.leaveType);
  }

  @Post('/member-rejoined')
  @HttpCode(200)
  async memberRejoined(@Body() body: { discordId: string; rejoinedAt: string }) {
    return await this.referralService.markMemberRejoined(body.discordId);
  }

  @Post('/sync-members')
  @HttpCode(200)
  async syncMembers(@Body() body: { guildMembers: Array<{ id: string }> }) {
    return await this.referralService.syncAllMemberStatus(body.guildMembers);
  }
}
