import { Service } from 'typedi';
import prisma from '../../common/prisma/client';
import logger from '../../common/loggers';
import { NotFoundError, BadRequestError } from 'routing-controllers';
import { Decimal } from '@prisma/client/runtime/library';
import { TrackReferralDto, GiveRewardDto, GetReferralsDto } from './dtos';
import ReferralRewardService from '../referralReward/referral-reward.service';

@Service()
export default class ReferralService {
  constructor(private referralRewardService: ReferralRewardService) {}

  async trackReferral(dto: TrackReferralDto) {
    const referrer = await prisma.user.findUnique({
      where: { discordId: dto.referrerDiscordId },
      include: { referredBy: true },
    });

    if (!referrer) {
      throw new NotFoundError(`Referrer not found`);
    }

    const existing = await prisma.referral.findFirst({
      where: { referredDiscordId: dto.referredDiscordId },
    });

    if (existing) {
      return existing;
    }

    if (referrer.referredByUserId) {
      const referrerParent = await prisma.user.findUnique({
        where: { id: referrer.referredByUserId },
        select: { discordId: true },
      });

      if (referrerParent?.discordId === dto.referredDiscordId) {
        throw new BadRequestError('Circular referral detected');
      }
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReferrals = await prisma.referral.count({
      where: {
        referrerId: referrer.id,
        joinedAt: { gte: twentyFourHoursAgo },
      },
    });

    if (recentReferrals >= 10) {
      throw new BadRequestError('Rate limit exceeded: Maximum 10 referrals per 24 hours');
    }

    if (dto.referrerDiscordId === dto.referredDiscordId) {
      throw new BadRequestError('Self-referral not allowed');
    }

    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referrerDiscordId: dto.referrerDiscordId,
        referredDiscordId: dto.referredDiscordId,
        inviteCode: dto.inviteCode || null,
        rewardGiven: false,
      },
    });

    return referral;
  }

  async linkReferralToUser(discordId: string, userId: number) {
      const referral = await prisma.referral.findFirst({
        where: {
          referredDiscordId: discordId,
          referredUserId: null,
        },
      });

      if (!referral) {
        return null;
      }

      const updated = await prisma.referral.update({
        where: { id: referral.id },
        data: {
          referredUserId: userId,
          onboardedAt: new Date(),
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { referredByUserId: referral.referrerId },
      });


      return updated;
  }

  async giveReferralReward(dto: GiveRewardDto) {
      const config = await this.referralRewardService.getConfig();

      if (!config.isEnabled) {
        return null;
      }

      const referral = await prisma.referral.findFirst({
        where: {
          referredDiscordId: dto.referredDiscordId,
          rewardGiven: false,
        },
        include: {
          referrer: {
            include: { wallet: true },
          },
        },
      });

      if (!referral) {
        return null;
      }

      const rewardAmount = dto.amount || await this.referralRewardService.calculateRewardAmount(referral.referrerId);

      if (rewardAmount <= 0) {
        return null;
      }

      if (config.maxRewardsPerDay > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const rewardsToday = await prisma.referral.count({
          where: {
            referrerId: referral.referrerId,
            rewardGiven: true,
            rewardGivenAt: { gte: today },
          },
        });

        if (rewardsToday >= config.maxRewardsPerDay) {
          throw new BadRequestError(`Daily reward limit reached (${config.maxRewardsPerDay} per day)`);
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        let wallet = await tx.wallet.findUnique({
          where: { userId: referral.referrerId },
        });

        if (!wallet) {
          wallet = await tx.wallet.create({
            data: {
              userId: referral.referrerId,
              walletType: 'CUSTOMER',
              balance: 0,
              pendingBalance: 0,
              currency: 'USD',
            },
          });
        }

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: {
              increment: rewardAmount,
            },
          },
        });

        await tx.user.update({
          where: { id: referral.referrerId },
          data: {
            referralRewards: {
              increment: rewardAmount,
            },
            totalReferrals: {
              increment: 1,
            },
          },
        });

        const updatedReferral = await tx.referral.update({
          where: { id: referral.id },
          data: {
            rewardGiven: true,
            rewardAmount: new Decimal(rewardAmount),
            rewardGivenAt: new Date(),
          },
        });

        await tx.referralReward.create({
          data: {
            referralId: referral.id,
            referrerId: referral.referrerId,
            referredUserId: referral.referredUserId!,
            amount: new Decimal(rewardAmount),
            reason: 'Referral completed onboarding',
          },
        });

        return updatedReferral;
      });

      return {
        referralId: result.id,
        referrerUserId: referral.referrerId,
        referrerDiscordId: referral.referrerDiscordId,
        amount: rewardAmount,
      };
  }

  async getUserReferralStats(discordId?: string, userId?: number) {
      if (!discordId && !userId) {
        throw new BadRequestError('Either discordId or userId must be provided');
      }

      const user = await prisma.user.findFirst({
        where: discordId ? { discordId } : { id: userId },
        include: {
          referrals: {
            orderBy: { joinedAt: 'desc' },
            take: 10,
            include: {
              referredUser: {
                select: {
                  id: true,
                  discordUsername: true,
                  discordDisplayName: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      const pendingReferrals = await prisma.referral.count({
        where: {
          referrerId: user.id,
          rewardGiven: false,
          onboardedAt: null,
        },
      });

      const successfulReferrals = await prisma.referral.count({
        where: {
          referrerId: user.id,
          rewardGiven: true,
        },
      });

      const leftCount = await prisma.referral.count({
        where: {
          referrerId: user.id,
          hasLeftServer: true,
        },
      });

      return {
        userId: user.id,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        totalReferrals: user.totalReferrals,
        successfulReferrals,
        pendingReferrals,
        leftCount,
        totalRewards: user.referralRewards.toNumber(),
        recentReferrals: user.referrals.map((r) => ({
          id: r.id,
          referredDiscordId: r.referredDiscordId,
          referredUser: r.referredUser,
          joinedAt: r.joinedAt,
          onboardedAt: r.onboardedAt,
          rewardGiven: r.rewardGiven,
          rewardAmount: r.rewardAmount?.toNumber() || 0,
          hasLeftServer: r.hasLeftServer,
          daysInServer: r.daysInServer,
        })),
      };
  }

  async getLeaderboard(limit: number = 10, sortBy: string = 'total') {
      const topReferrers = await prisma.user.findMany({
        where: {
          totalReferrals: { gt: 0 },
        },
        orderBy: { totalReferrals: 'desc' },
        take: limit * 2,
        select: {
          id: true,
          discordId: true,
          discordUsername: true,
          discordDisplayName: true,
          totalReferrals: true,
          referralRewards: true,
          referrals: {
            select: {
              hasLeftServer: true,
              daysInServer: true,
            },
          },
        },
      });

      const usersWithRetention = topReferrers.map((user) => {
        const total = user.totalReferrals;
        const leftCount = user.referrals.filter((r) => r.hasLeftServer).length;
        const activeCount = total - leftCount;
        const retentionRate = total > 0 ? (activeCount / total) * 100 : 0;

        return {
          userId: user.id,
          discordId: user.discordId,
          discordUsername: user.discordUsername,
          discordDisplayName: user.discordDisplayName,
          totalReferrals: total,
          activeCount,
          leftCount,
          retentionRate,
          totalRewards: user.referralRewards.toNumber(),
        };
      });

      if (sortBy === 'active') {
        usersWithRetention.sort((a, b) => b.activeCount - a.activeCount);
      } else if (sortBy === 'retention') {
        usersWithRetention.sort((a, b) => b.retentionRate - a.retentionRate);
      } else if (sortBy === 'left') {
        usersWithRetention.sort((a, b) => b.leftCount - a.leftCount);
      }

      return usersWithRetention.slice(0, limit).map((user, index) => ({
        ...user,
        rank: index + 1,
      }));
  }

  async getAllReferrals(dto: GetReferralsDto) {
      const page = dto.page || 1;
      const limit = dto.limit || 20;
      const skip = (page - 1) * limit;

      const where: any = {};

      // Handle status filter (takes precedence over individual boolean filters)
      if (dto.status && dto.status !== 'all') {
        switch (dto.status) {
          case 'rewarded':
            where.rewardGiven = true;
            break;
          case 'pending':
            where.rewardGiven = false;
            where.onboardedAt = { not: null };
            break;
          case 'not_onboarded':
            where.onboardedAt = null;
            break;
        }
      } else {
        // Fallback to individual boolean filters if status not provided
        if (dto.rewardGiven !== undefined) {
          where.rewardGiven = dto.rewardGiven;
        }

        if (dto.onboarded !== undefined) {
          where.onboardedAt = dto.onboarded ? { not: null } : null;
        }
      }

      const [referrals, total] = await Promise.all([
        prisma.referral.findMany({
          where,
          skip,
          take: limit,
          orderBy: { joinedAt: 'desc' },
          include: {
            referrer: {
              select: {
                id: true,
                discordUsername: true,
                discordDisplayName: true,
                email: true,
              },
            },
            referredUser: {
              select: {
                id: true,
                discordUsername: true,
                discordDisplayName: true,
                email: true,
              },
            },
          },
        }),
        prisma.referral.count({ where }),
      ]);

      return {
        data: referrals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
  }


  async getFraudAnalytics() {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const suspiciousUsers = await prisma.user.findMany({
        where: {
          totalReferrals: { gt: 0 },
          referrals: {
            some: {
              joinedAt: { gte: twentyFourHoursAgo },
            },
          },
        },
        select: {
          id: true,
          discordId: true,
          discordUsername: true,
          discordDisplayName: true,
          totalReferrals: true,
          referralRewards: true,
          referrals: {
            where: { joinedAt: { gte: twentyFourHoursAgo } },
            select: {
              id: true,
              referredDiscordId: true,
              joinedAt: true,
              rewardGiven: true,
            },
          },
        },
        orderBy: { totalReferrals: 'desc' },
        take: 20,
      });

      const usersWithRates = await Promise.all(suspiciousUsers.map(async (user) => {
        const last24hCount = user.referrals.length;

        const leftCount = await prisma.referral.count({
          where: {
            referrerId: user.id,
            hasLeftServer: true,
          },
        });

        const activeCount = user.totalReferrals - leftCount;
        const retentionRate = user.totalReferrals > 0 ? (activeCount / user.totalReferrals) * 100 : 0;

        let riskLevel = last24hCount >= 8 ? 'HIGH' : last24hCount >= 5 ? 'MEDIUM' : 'LOW';

        if (user.totalReferrals >= 10 && retentionRate < 30) {
          riskLevel = 'HIGH';
        } else if (user.totalReferrals >= 5 && retentionRate < 50) {
          if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
        }

        return {
          userId: user.id,
          discordId: user.discordId,
          discordUsername: user.discordUsername,
          discordDisplayName: user.discordDisplayName,
          totalReferrals: user.totalReferrals,
          activeCount,
          leftCount,
          retentionRate,
          totalRewards: user.referralRewards.toNumber(),
          last24hReferrals: last24hCount,
          riskLevel,
        };
      }));

      const allTopReferrers = await prisma.user.findMany({
        where: {
          totalReferrals: { gt: 0 },
        },
        select: {
          id: true,
          discordId: true,
          discordUsername: true,
          discordDisplayName: true,
          totalReferrals: true,
          referralRewards: true,
        },
        orderBy: { totalReferrals: 'desc' },
        take: 10,
      });

      const topReferrersWithRetention = await Promise.all(allTopReferrers.map(async (user) => {
        const leftCount = await prisma.referral.count({
          where: {
            referrerId: user.id,
            hasLeftServer: true,
          },
        });

        const activeCount = user.totalReferrals - leftCount;
        const retentionRate = user.totalReferrals > 0 ? (activeCount / user.totalReferrals) * 100 : 0;

        const last24hCount = await prisma.referral.count({
          where: {
            referrerId: user.id,
            joinedAt: { gte: twentyFourHoursAgo },
          },
        });

        let riskLevel = 'LOW';
        if (last24hCount >= 8 || (user.totalReferrals >= 10 && retentionRate < 30)) {
          riskLevel = 'HIGH';
        } else if (last24hCount >= 5 || (user.totalReferrals >= 5 && retentionRate < 50)) {
          riskLevel = 'MEDIUM';
        }

        return {
          userId: user.id,
          discordId: user.discordId,
          discordUsername: user.discordUsername,
          discordDisplayName: user.discordDisplayName,
          totalReferrals: user.totalReferrals,
          activeCount,
          leftCount,
          retentionRate,
          totalRewards: user.referralRewards.toNumber(),
          last24hReferrals: last24hCount,
          riskLevel,
        };
      }));

      const [
        totalReferrals,
        pendingReferrals,
        completedReferrals,
        last24hReferrals,
        last7dReferrals,
      ] = await Promise.all([
        prisma.referral.count(),
        prisma.referral.count({ where: { rewardGiven: false, onboardedAt: null } }),
        prisma.referral.count({ where: { rewardGiven: true } }),
        prisma.referral.count({ where: { joinedAt: { gte: twentyFourHoursAgo } } }),
        prisma.referral.count({ where: { joinedAt: { gte: sevenDaysAgo } } }),
      ]);

      return {
        overview: {
          totalReferrals,
          pendingReferrals,
          completedReferrals,
          last24hReferrals,
          last7dReferrals,
        },
        suspiciousUsers: usersWithRates.filter((u) => u.riskLevel !== 'LOW'),
        topReferrers: topReferrersWithRetention,
      };
  }

  async getReferralNetwork(userId: number, filter?: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          referrals: {
            include: {
              referredUser: {
                select: {
                  id: true,
                  discordUsername: true,
                  discordDisplayName: true,
                  totalReferrals: true,
                  referrals: {
                    select: {
                      id: true,
                      referredUserId: true,
                      referredDiscordId: true,
                      rewardGiven: true,
                    },
                  },
                },
              },
            },
            orderBy: { joinedAt: 'desc' },
          },
          referredBy: {
            select: {
              id: true,
              discordUsername: true,
              discordDisplayName: true,
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      const leftCount = await prisma.referral.count({
        where: {
          referrerId: user.id,
          hasLeftServer: true,
        },
      });

      const activeCount = user.totalReferrals - leftCount;
      const retentionRate = user.totalReferrals > 0 ? (activeCount / user.totalReferrals) * 100 : 0;

      let allReferrals = user.referrals.map((ref) => ({
        id: ref.id,
        referredUserId: ref.referredUserId,
        referredDiscordId: ref.referredDiscordId,
        referredUser: ref.referredUser,
        rewardGiven: ref.rewardGiven,
        onboardedAt: ref.onboardedAt,
        hasLeftServer: ref.hasLeftServer,
        daysInServer: ref.daysInServer,
        theirReferrals: ref.referredUser?.referrals || [],
      }));

      if (filter && filter !== 'all') {
        allReferrals = allReferrals.filter((ref) => {
          switch (filter) {
            case 'active':
              return !ref.hasLeftServer && ref.rewardGiven;
            case 'left':
              return ref.hasLeftServer;
            case 'rewarded':
              return ref.rewardGiven;
            case 'pending':
              return !ref.rewardGiven && ref.onboardedAt !== null;
            case 'not_onboarded':
              return ref.onboardedAt === null;
            default:
              return true;
          }
        });
      }

      const network = {
        user: {
          id: user.id,
          discordUsername: user.discordUsername,
          discordDisplayName: user.discordDisplayName,
          totalReferrals: user.totalReferrals,
          totalRewards: user.referralRewards.toNumber(),
          activeCount,
          leftCount,
          retentionRate,
        },
        referredBy: user.referredBy,
        directReferrals: allReferrals,
        filteredCount: allReferrals.length,
        totalCount: user.referrals.length,
      };

      return network;
    } catch (error) {
      logger.error('[Referral Service] Error getting referral network:', error);
      throw error;
    }
  }

  // ============================================
  // DISCORD INVITE MANAGEMENT (Database-Backed)
  // ============================================

  async getOrCreateInvite(discordId: string, guildId: string) {
    try {
      // 1. Check if user exists in database
      const user = await prisma.user.findUnique({
        where: { discordId },
        include: {
          discordInvites: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!user) {
        throw new NotFoundError('User not found. Complete onboarding first!');
      }

      // 2. Check if user already has an active invite
      const existingInvite = user.discordInvites[0];

      if (existingInvite) {
        logger.info(`[Referral] Returning existing invite for ${discordId}: ${existingInvite.inviteCode}`);
        // CRITICAL: Convert Prisma object to plain object for HTTP serialization
        const plainObject = {
          id: existingInvite.id,
          inviteCode: existingInvite.inviteCode,
          inviteUrl: existingInvite.inviteUrl,
          userId: existingInvite.userId,
          discordId: existingInvite.discordId,
          channelId: existingInvite.channelId,
          uses: existingInvite.uses,
          maxUses: existingInvite.maxUses,
          maxAge: existingInvite.maxAge,
          temporary: existingInvite.temporary,
          isActive: existingInvite.isActive,
          createdAt: existingInvite.createdAt.toISOString(),
          updatedAt: existingInvite.updatedAt.toISOString(),
          lastSyncedAt: existingInvite.lastSyncedAt.toISOString()
        };
        logger.info(`[Referral] Plain object to return:`, plainObject);
        return plainObject;
      }

      // 3. User doesn't have an invite yet - return null for now
      logger.info(`[Referral] No existing invite for ${discordId}, needs to be created by bot`);
      return null;
    } catch (error) {
      logger.error(`[Referral] Error getting/creating invite:`, error);
      throw error;
    }
  }

  async createInviteRecord(data: {
    inviteCode: string;
    inviteUrl: string;
    discordId: string;
    channelId?: string;
    uses?: number;
  }) {
    try {
      const user = await prisma.user.findUnique({
        where: { discordId: data.discordId }
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Check if invite already exists
      const existing = await prisma.discordInvite.findUnique({
        where: { inviteCode: data.inviteCode }
      });

      if (existing) {
        // Convert to plain object
        const plainObject = {
          id: existing.id,
          inviteCode: existing.inviteCode,
          inviteUrl: existing.inviteUrl,
          userId: existing.userId,
          discordId: existing.discordId,
          channelId: existing.channelId,
          uses: existing.uses,
          maxUses: existing.maxUses,
          maxAge: existing.maxAge,
          temporary: existing.temporary,
          isActive: existing.isActive,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
          lastSyncedAt: existing.lastSyncedAt.toISOString()
        };
        logger.info(`[Referral] Returning existing invite from DB:`, plainObject);
        return plainObject;
      }

      const invite = await prisma.discordInvite.create({
        data: {
          inviteCode: data.inviteCode,
          inviteUrl: data.inviteUrl,
          userId: user.id,
          discordId: user.discordId || data.discordId,
          channelId: data.channelId || null,
          uses: data.uses || 0,
          maxUses: 0,
          maxAge: 0,
          temporary: false,
          isActive: true
        }
      });

      logger.info(`[Referral] Created invite record: ${data.inviteCode} for ${data.discordId}`);
      // Convert to plain object
      const plainObject = {
        id: invite.id,
        inviteCode: invite.inviteCode,
        inviteUrl: invite.inviteUrl,
        userId: invite.userId,
        discordId: invite.discordId,
        channelId: invite.channelId,
        uses: invite.uses,
        maxUses: invite.maxUses,
        maxAge: invite.maxAge,
        temporary: invite.temporary,
        isActive: invite.isActive,
        createdAt: invite.createdAt.toISOString(),
        updatedAt: invite.updatedAt.toISOString(),
        lastSyncedAt: invite.lastSyncedAt.toISOString()
      };
      logger.info(`[Referral] Returning newly created invite:`, plainObject);
      return plainObject;
    } catch (error) {
      logger.error(`[Referral] Error creating invite record:`, error);
      throw error;
    }
  }

  async syncDiscordInvites(guildId: string) {
    try {
      // This method is called by the Discord bot to sync invite usage
      // We just return all active invites from our database
      const invites = await prisma.discordInvite.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' }
      });

      logger.info(`[Referral] Returning ${invites.length} active invites for sync`);
      return invites;
    } catch (error) {
      logger.error(`[Referral] Error syncing invites:`, error);
      throw error;
    }
  }

  async updateInviteUsage(inviteCode: string, uses: number) {
    try {
      const updated = await prisma.discordInvite.update({
        where: { inviteCode },
        data: {
          uses,
          lastSyncedAt: new Date()
        }
      });

      logger.info(`[Referral] Updated invite ${inviteCode} usage to ${uses}`);
      return updated;
    } catch (error) {
      logger.error(`[Referral] Error updating invite usage:`, error);
      throw error;
    }
  }

  async listInvites() {
    try {
      return await prisma.discordInvite.findMany({
        where: { isActive: true },
        include: {
          user: {
            select: {
              id: true,
              discordId: true,
              discordUsername: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error(`[Referral] Error listing invites:`, error);
      throw error;
    }
  }

  // ============================================
  // MEMBER STATUS TRACKING
  // ============================================

  async markMemberLeft(discordId: string, leaveType: string) {
    try {
      const leftAt = new Date();

      // Find all referrals where this user is the referred person
      const referrals = await prisma.referral.findMany({
        where: {
          referredDiscordId: discordId,
          hasLeftServer: false
        },
      });

      if (referrals.length === 0) {
        throw new NotFoundError('No active referral found for this user');
      }

      // Calculate days in server
      const results = await Promise.all(
        referrals.map(async (referral) => {
          const joinedAt = referral.joinedAt;
          const daysInServer = Math.floor(
            (leftAt.getTime() - joinedAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          return prisma.referral.update({
            where: { id: referral.id },
            data: {
              hasLeftServer: true,
              leftServerAt: leftAt,
              daysInServer,
            },
          });
        })
      );

      logger.info(
        `[Referral] Marked ${results.length} referral(s) as left for ${discordId} (stayed ${results[0]?.daysInServer} days)`
      );

      return results;
    } catch (error) {
      logger.error('[Referral] Error marking member as left:', error);
      throw error;
    }
  }

  async markMemberRejoined(discordId: string) {
    try {
      // Find referrals where user previously left
      const referrals = await prisma.referral.findMany({
        where: {
          referredDiscordId: discordId,
          hasLeftServer: true,
        },
      });

      if (referrals.length === 0) {
        logger.debug(`[Referral] No previous leave record found for ${discordId}`);
        return null;
      }

      // Mark as active again
      const results = await Promise.all(
        referrals.map((referral) =>
          prisma.referral.update({
            where: { id: referral.id },
            data: {
              hasLeftServer: false,
              leftServerAt: null,
              lastSeenAt: new Date(),
            },
          })
        )
      );

      logger.info(`[Referral] Marked ${results.length} referral(s) as rejoined for ${discordId}`);

      return results;
    } catch (error) {
      logger.error('[Referral] Error marking member as rejoined:', error);
      throw error;
    }
  }

  async syncAllMemberStatus(guildMembers: Array<{ id: string }>) {
    try {
      logger.info('[Referral] Starting member status sync...');

      const memberIds = new Set(guildMembers.map((m) => m.id));

      // Get all referrals that are marked as active
      const activeReferrals = await prisma.referral.findMany({
        where: { hasLeftServer: false },
      });

      let leftCount = 0;
      const now = new Date();

      // Check each active referral
      for (const referral of activeReferrals) {
        // If member is not in guild anymore, mark as left
        if (!memberIds.has(referral.referredDiscordId)) {
          const daysInServer = Math.floor(
            (now.getTime() - referral.joinedAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          await prisma.referral.update({
            where: { id: referral.id },
            data: {
              hasLeftServer: true,
              leftServerAt: now,
              daysInServer,
            },
          });

          leftCount++;
        } else {
          // Update last seen
          await prisma.referral.update({
            where: { id: referral.id },
            data: { lastSeenAt: now },
          });
        }
      }

      logger.info(
        `[Referral] ✅ Sync complete: ${leftCount} members marked as left, ${activeReferrals.length - leftCount} still active`
      );

      return {
        totalChecked: activeReferrals.length,
        markedAsLeft: leftCount,
        stillActive: activeReferrals.length - leftCount,
      };
    } catch (error) {
      logger.error('[Referral] Error syncing member status:', error);
      throw error;
    }
  }
}
