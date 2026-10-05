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
  UseBefore,
} from 'routing-controllers';
import { Service } from 'typedi';
import ReferralService from './referral.service';
import { DiscordAuthMiddleware } from '../../common/middlewares/discordAuth.middleware';
import {
  TrackReferralDto,
  GiveRewardDto,
  GetLeaderboardDto,
  GetReferralsDto,
  GetNetworkDto,
} from './dtos';
import API from '../../common/config/api.types';

@JsonController('/referral')
@Service()
export default class ReferralController {
  constructor(private referralService: ReferralService) {}

  @Post('/track')
  @HttpCode(201)
  @UseBefore(DiscordAuthMiddleware)
  async trackReferral(@Body() dto: TrackReferralDto) {
    return await this.referralService.trackReferral(dto);
  }

  @Post('/link/:discordId/:userId')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async linkReferralToUser(
    @Param('discordId') discordId: string,
    @Param('userId') userId: number
  ) {
    return await this.referralService.linkReferralToUser(discordId, userId);
  }

  /**
   * Called by the bot right after onboarding. Returns { status: PAID | HELD | NONE, ... };
   * a HELD reward is paid later by /process-pending.
   */
  @Post('/reward')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async giveReward(@Body() dto: GiveRewardDto) {
    return await this.referralService.giveReferralReward(dto);
  }

  /** Bot cron: pays every held referral that has become eligible. */
  @Post('/process-pending')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async processPending() {
    return await this.referralService.processPendingRewards();
  }

  @Get('/stats/discord/:discordId')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
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
  async getLeaderboard(@QueryParams() query: GetLeaderboardDto) {
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
  async getReferralNetwork(
    @Param('userId') userId: number,
    @QueryParams() query: GetNetworkDto
  ) {
    return await this.referralService.getReferralNetwork(userId, query.filter);
  }

  // ---- Bot-only endpoints below: all require the bot API key ----

  @Post('/invite/get-or-create')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async getOrCreateInvite(@Body() body: { discordId: string; guildId: string }) {
    return await this.referralService.getOrCreateInvite(body.discordId, body.guildId);
  }

  @Post('/invite/sync')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async syncInvites(@Body() body: { guildId: string }) {
    return await this.referralService.syncDiscordInvites(body.guildId);
  }

  @Post('/invite/create')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async createInvite(@Body() body: { inviteCode: string; inviteUrl: string; discordId: string; channelId?: string; uses?: number }) {
    return await this.referralService.createInviteRecord(body);
  }

  @Post('/invite/deactivate')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async deactivateInvite(@Body() body: { inviteCode: string }) {
    return await this.referralService.deactivateInvite(body.inviteCode);
  }

  @Get('/invite/list')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async listInvites() {
    return await this.referralService.listInvites();
  }

  @Post('/invite/update-usage')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async updateInviteUsage(@Body() body: { inviteCode: string; uses: number }) {
    return await this.referralService.updateInviteUsage(body.inviteCode, body.uses);
  }

  @Post('/member-left')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async memberLeft(@Body() body: { discordId: string; leftAt: string; leaveType: string }) {
    return await this.referralService.markMemberLeft(body.discordId, body.leaveType);
  }

  @Post('/member-rejoined')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async memberRejoined(@Body() body: { discordId: string; rejoinedAt: string }) {
    return await this.referralService.markMemberRejoined(body.discordId);
  }

  @Post('/sync-members')
  @HttpCode(200)
  @UseBefore(DiscordAuthMiddleware)
  async syncMembers(@Body() body: { guildMembers: Array<{ id: string }> }) {
    return await this.referralService.syncAllMemberStatus(body?.guildMembers);
  }
}
