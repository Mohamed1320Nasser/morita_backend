import { Service } from 'typedi';
import { Prisma } from '@prisma/client';
import prisma from '../../common/prisma/client';
import logger from '../../common/loggers';
import { NotFoundError, BadRequestError } from 'routing-controllers';
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { TrackReferralDto, GiveRewardDto, GetReferralsDto } from './dtos';
import ReferralRewardService from '../referralReward/referral-reward.service';
import { TransactionClient } from '../../common/utils/transaction.util';
import { isStaffUser, nonStaffUserWhere } from '../../common/utils/staff.util';
import ReferralOrderRewardService, { ReferralOrderPayout } from './referral-order-reward.service';

const DAY_MS = 24 * 60 * 60 * 1000;

// Below this many referrals a single early leaver would wreck the retention
// rate, so the retention rule only applies once there is enough history.
const RETENTION_MIN_SAMPLE = 5;

// Max referrer -> referrer hops checked for circular referrals.
const MAX_CHAIN_DEPTH = 20;

// Pending referrals evaluated per cron run.
const PENDING_BATCH_SIZE = 200;

const INELIGIBLE_REASON = 'Joined while referral rewards were disabled (not eligible)';

type ReferralConfig = Awaited<ReturnType<ReferralRewardService['getConfig']>>;

// Placeholder emails given to accounts that did not supply one: at ToS
// acceptance, on onboarding without an EMAIL question, and on ticket creation.
const PLACEHOLDER_EMAIL_SUFFIXES = ['@temp.discord', '@discord.morita.local'];

/**
 * Whether this account finished registration. The email can't tell: members
 * who complete onboarding keep a placeholder email when the questionnaire has
 * no EMAIL question. A completed onboarding session is the source of truth;
 * a real email covers accounts that registered outside Discord onboarding.
 */
async function isRegisteredMember(user: { discordId: string | null; email: string }): Promise<boolean> {
  if (!PLACEHOLDER_EMAIL_SUFFIXES.some((suffix) => user.email.endsWith(suffix))) return true;
  if (!user.discordId) return false;
  const session = await prisma.onboardingSession.findUnique({
    where: { discordId: user.discordId },
    select: { registeredInDb: true },
  });
  return !!session?.registeredInDb;
}

export interface ReferralPayout {
  status: 'PAID';
  kind: 'JOIN';
  referralId: string;
  referrerUserId: number;
  referrerDiscordId: string;
  referredDiscordId: string;
  amount: number;
  perReferralAmount: number;
  milestoneBonus: number;
  milestonesReached: number[];
  qualifiedReferrals: number;
  currencyName: string;
  notifyDM: boolean;
  notifyDiscord: boolean;
}

export type RewardOutcome =
  | ReferralPayout
  | { status: 'HELD'; referralId: string; reason: string }
  | { status: 'NONE'; reason: string };

function summariseRetention(referralCount: number, leftCount: number) {
  const activeCount = Math.max(0, referralCount - leftCount);
  const retentionRate = referralCount > 0 ? (activeCount / referralCount) * 100 : 100;
  return { activeCount, retentionRate };
}

function scoreRisk(last24hCount: number, referralCount: number, retentionRate: number) {
  if (last24hCount >= 8 || (referralCount >= 10 && retentionRate < 30)) {
    return 'HIGH';
  }
  if (last24hCount >= 5 || (referralCount >= 5 && retentionRate < 50)) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function daysSince(date: Date, now: Date = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / DAY_MS));
}

/** Days a member has stayed: frozen at leave time, live while still in the server. */
function memberDays(r: { hasLeftServer: boolean; daysInServer: number; joinedAt: Date }) {
  return r.hasLeftServer ? r.daysInServer : daysSince(r.joinedAt);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

@Service()
export default class ReferralService {
  constructor(
    private referralRewardService: ReferralRewardService,
    private referralOrderRewardService: ReferralOrderRewardService
  ) {}

  // ============================================
  // TRACKING
  // ============================================

  async trackReferral(dto: TrackReferralDto) {
    // Personal invites are created by the bot, so Discord reports the bot as the
    // inviter. The invite-code mapping is the source of truth for who owns it.
    let referrer: { id: number; discordId: string | null; referredByUserId: number | null; discordRole: string | null; role: string } | null = null;

    if (dto.inviteCode) {
      const invite = await prisma.discordInvite.findUnique({
        where: { inviteCode: dto.inviteCode },
        include: { user: { select: { id: true, discordId: true, referredByUserId: true, discordRole: true, role: true } } },
      });
      if (invite?.user) {
        referrer = invite.user;
      }
    }

    if (!referrer && dto.referrerDiscordId) {
      referrer = await prisma.user.findUnique({
        where: { discordId: dto.referrerDiscordId },
        select: { id: true, discordId: true, referredByUserId: true, discordRole: true, role: true },
      });
    }

    if (!referrer || !referrer.discordId) {
      throw new NotFoundError(`Referrer not found`);
    }

    // Staff and the company account invite people as part of the job (manual
    // server invites); those joins are not customer referrals.
    if (isStaffUser(referrer)) {
      throw new BadRequestError('Invites from staff accounts are not referrals');
    }

    const referrerDiscordId = referrer.discordId;

    if (referrerDiscordId === dto.referredDiscordId) {
      throw new BadRequestError('Self-referral not allowed');
    }

    const existing = await prisma.referral.findFirst({
      where: { referredDiscordId: dto.referredDiscordId },
    });

    if (existing) {
      return { isNew: false, referrerDiscordId: existing.referrerDiscordId, referral: existing };
    }

    // A member who already registered before is returning, not a new referral.
    const existingAccount = await prisma.user.findUnique({
      where: { discordId: dto.referredDiscordId },
      select: { discordId: true, email: true },
    });

    if (existingAccount && (await isRegisteredMember(existingAccount))) {
      throw new BadRequestError('Member is already registered; returning members are not referrals');
    }

    // Walk up the referrer's chain so A -> B -> A loops of any length are refused.
    let parentId = referrer.referredByUserId;
    for (let depth = 0; parentId && depth < MAX_CHAIN_DEPTH; depth++) {
      const parent: { discordId: string | null; referredByUserId: number | null } | null =
        await prisma.user.findUnique({
          where: { id: parentId },
          select: { discordId: true, referredByUserId: true },
        });
      if (!parent) break;
      if (parent.discordId === dto.referredDiscordId) {
        throw new BadRequestError('Circular referral detected');
      }
      parentId = parent.referredByUserId;
    }

    // Joins while rewards are switched off are still recorded (analytics,
    // retention) but can never be paid, so re-enabling does not back-pay them.
    const config = await this.referralRewardService.getConfig();
    const rewardEligible = config.isEnabled;

    // No hard cap here: every join is recorded so fraud analytics can see bursts.
    // Payout volume is limited by maxRewardsPerDay/cooldown at reward time.
    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referrerDiscordId,
        referredDiscordId: dto.referredDiscordId,
        inviteCode: dto.inviteCode || null,
        rewardGiven: false,
        rewardEligible,
        holdReason: rewardEligible
          ? 'Waiting for the member to complete onboarding'
          : INELIGIBLE_REASON,
      },
    });

    return { isNew: true, rewardEligible, referrerDiscordId, referral };
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

  // ============================================
  // REWARDS
  // ============================================

  /**
   * Called by the bot right after onboarding. Rules that are not met yet
   * (days in server, cooldown, daily cap...) hold the reward instead of
   * failing; processPendingRewards pays it once they are satisfied.
   */
  async giveReferralReward(dto: GiveRewardDto): Promise<RewardOutcome> {
    const referral = await prisma.referral.findFirst({
      where: { referredDiscordId: dto.referredDiscordId, rewardGiven: false, rewardEligible: true },
      orderBy: { joinedAt: 'desc' },
      select: { id: true },
    });

    if (!referral) {
      return { status: 'NONE', reason: 'No unpaid referral for this member' };
    }

    const config = await this.referralRewardService.getConfig();
    return this.tryPayReferral(referral.id, config);
  }

  /**
   * Re-evaluates every unpaid referral that could now be eligible.
   * Run periodically by the bot; returns the payouts so it can notify.
   */
  async processPendingRewards() {
    const config = await this.referralRewardService.getConfig();

    if (!config.isEnabled) {
      return { enabled: false, checked: 0, paid: [] as Array<ReferralPayout | ReferralOrderPayout>, held: 0 };
    }

    const joinedBefore = new Date(Date.now() - config.minimumDaysInServer * DAY_MS);

    const candidates = await prisma.referral.findMany({
      where: {
        rewardGiven: false,
        rewardEligible: true,
        hasLeftServer: false,
        joinedAt: { lte: joinedBefore },
        ...(config.requireOnboarding && { onboardedAt: { not: null } }),
      },
      // Least recently checked first (never-checked sort first in MySQL), so
      // referrals stuck on a long hold cannot fill every batch and starve the rest.
      orderBy: [{ lastCheckedAt: 'asc' }, { joinedAt: 'asc' }],
      take: PENDING_BATCH_SIZE,
      select: { id: true },
    });

    const paid: Array<ReferralPayout | ReferralOrderPayout> = [];
    let held = 0;

    for (const { id } of candidates) {
      try {
        const outcome = await this.tryPayReferral(id, config);
        if (outcome.status === 'PAID') paid.push(outcome);
        else if (outcome.status === 'HELD') held++;
      } catch (error: any) {
        logger.error(`[Referral] Failed to process pending referral ${id}: ${error?.message || error}`);
      }
    }

    if (candidates.length > 0) {
      logger.info(
        `[Referral] Pending rewards: checked ${candidates.length}, paid ${paid.length}, held ${held}`
      );
    }

    // Order rewards whose hold period has ended
    try {
      paid.push(...(await this.referralOrderRewardService.processPending(config)));
    } catch (error: any) {
      logger.error(`[Referral] Failed to process order rewards: ${error?.message || error}`);
    }

    return { enabled: true, checked: candidates.length, paid, held };
  }

  /** Returns why the referral cannot be paid yet, or null when it can. */
  private async findHoldReason(
    tx: TransactionClient,
    referral: {
      referrerId: number;
      joinedAt: Date;
      onboardedAt: Date | null;
      hasLeftServer: boolean;
      rewardEligible: boolean;
    },
    config: ReferralConfig,
    now: Date
  ): Promise<string | null> {
    if (!referral.rewardEligible) {
      return INELIGIBLE_REASON;
    }

    if (!config.isEnabled) {
      return 'Referral rewards are disabled';
    }

    if (referral.hasLeftServer) {
      return 'Member left the server';
    }

    const referrerAccount = await tx.user.findUnique({
      where: { id: referral.referrerId },
      select: { discordRole: true, role: true },
    });
    if (isStaffUser(referrerAccount)) {
      return 'Staff accounts do not earn referral rewards';
    }

    if (config.requireOnboarding && !referral.onboardedAt) {
      return 'Waiting for the member to complete onboarding';
    }

    if (config.minimumDaysInServer > 0) {
      const days = daysSince(referral.joinedAt, now);
      if (days < config.minimumDaysInServer) {
        return `Member has been in the server ${days}/${config.minimumDaysInServer} days`;
      }
    }

    if (config.minimumRetentionRate > 0) {
      const [referralCount, leftCount] = await Promise.all([
        tx.referral.count({ where: { referrerId: referral.referrerId } }),
        tx.referral.count({ where: { referrerId: referral.referrerId, hasLeftServer: true } }),
      ]);

      if (referralCount >= RETENTION_MIN_SAMPLE) {
        const { retentionRate } = summariseRetention(referralCount, leftCount);
        if (retentionRate < config.minimumRetentionRate) {
          return `Referrer retention ${retentionRate.toFixed(0)}% is below ${config.minimumRetentionRate}%`;
        }
      }
    }

    if (config.cooldownMinutes > 0) {
      const lastRewarded = await tx.referral.findFirst({
        where: { referrerId: referral.referrerId, rewardGiven: true, rewardGivenAt: { not: null } },
        orderBy: { rewardGivenAt: 'desc' },
        select: { rewardGivenAt: true },
      });

      if (lastRewarded?.rewardGivenAt) {
        const minutesSince = (now.getTime() - lastRewarded.rewardGivenAt.getTime()) / 60000;
        if (minutesSince < config.cooldownMinutes) {
          return `Referrer cooldown: ${Math.ceil(config.cooldownMinutes - minutesSince)} minute(s) left`;
        }
      }
    }

    if (config.maxRewardsPerDay > 0) {
      const rewardsToday = await tx.referral.count({
        where: {
          referrerId: referral.referrerId,
          rewardGiven: true,
          rewardGivenAt: { gte: startOfToday() },
        },
      });

      if (rewardsToday >= config.maxRewardsPerDay) {
        return `Referrer reached the daily limit (${config.maxRewardsPerDay})`;
      }
    }

    return null;
  }

  /**
   * Pays one referral if every rule passes. Everything — eligibility checks,
   * per-referral amount, milestone claims, wallet credit and ledger entry —
   * happens in one transaction holding a lock on the referrer, so concurrent
   * calls cannot double-pay, exceed the daily cap, or burn a milestone.
   */
  private async tryPayReferral(referralId: string, config: ReferralConfig): Promise<RewardOutcome> {
    const head = await prisma.referral.findUnique({
      where: { id: referralId },
      select: { referrerId: true },
    });

    if (!head) {
      return { status: 'NONE', reason: 'Referral not found' };
    }

    const now = new Date();

    const outcome = await prisma.$transaction(
      async (tx): Promise<RewardOutcome> => {
        // Serialise all payouts for this referrer.
        await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${head.referrerId} FOR UPDATE`;

        const referral = await tx.referral.findUnique({ where: { id: referralId } });

        if (!referral || referral.rewardGiven) {
          return { status: 'NONE', reason: 'Referral already rewarded' };
        }

        const holdReason = await this.findHoldReason(tx, referral, config, now);

        if (holdReason) {
          await tx.referral.update({
            where: { id: referral.id },
            data: { holdReason, lastCheckedAt: now },
          });
          return { status: 'HELD', referralId: referral.id, reason: holdReason };
        }

        const mode = config.rewardMode || 'PER_REFERRAL';

        const perReferralAmount =
          (mode === 'PER_REFERRAL' || mode === 'HYBRID') && config.perReferralEnabled
            ? Number(config.perReferralAmount)
            : 0;

        // Mark the referral as qualified first so the milestone count below
        // includes it. In MILESTONE mode it qualifies with a 0 per-referral amount.
        await tx.referral.update({
          where: { id: referral.id },
          data: {
            rewardGiven: true,
            rewardGivenAt: now,
            holdReason: null,
            lastCheckedAt: now,
          },
        });

        let milestoneBonus = 0;
        const milestonesReached: number[] = [];

        const qualifiedReferrals = await tx.referral.count({
          where: {
            referrerId: referral.referrerId,
            rewardGiven: true,
            ...(config.countOnlyActive && { hasLeftServer: false }),
          },
        });

        if ((mode === 'MILESTONE' || mode === 'HYBRID') && config.milestonesEnabled) {
          for (const milestone of config.milestones) {
            if (milestone.count > qualifiedReferrals) break;

            const claimed = await tx.referralMilestone.findUnique({
              where: { userId_milestone: { userId: referral.referrerId, milestone: milestone.count } },
            });

            if (!claimed) {
              await tx.referralMilestone.create({
                data: {
                  userId: referral.referrerId,
                  milestone: milestone.count,
                  reward: new Decimal(milestone.reward),
                },
              });
              milestoneBonus += milestone.reward;
              milestonesReached.push(milestone.count);
            }
          }
        }

        const amount = Number((perReferralAmount + milestoneBonus).toFixed(2));

        await tx.referral.update({
          where: { id: referral.id },
          data: { rewardAmount: new Decimal(amount) },
        });

        await tx.user.update({
          where: { id: referral.referrerId },
          data: {
            totalReferrals: { increment: 1 },
            ...(amount > 0 && { referralRewards: { increment: amount } }),
          },
        });

        if (amount > 0) {
          let wallet = await tx.wallet.findUnique({ where: { userId: referral.referrerId } });

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

          const balanceBefore = new Decimal(wallet.balance);
          const balanceAfter = balanceBefore.plus(amount);

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: amount } },
          });

          const parts: string[] = [];
          if (perReferralAmount > 0) parts.push(`referral ${perReferralAmount}`);
          if (milestoneBonus > 0) parts.push(`milestone ${milestonesReached.join(', ')} bonus ${milestoneBonus}`);

          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'REFERRAL_REWARD',
              amount: new Decimal(amount),
              balanceBefore,
              balanceAfter,
              status: 'COMPLETED',
              reference: `referral-${referral.id}`,
              notes: `Referral reward for ${referral.referredDiscordId}: ${parts.join(' + ')} ${config.currencyName}`,
              createdById: referral.referrerId,
            },
          });

          await tx.referralReward.create({
            data: {
              referralId: referral.id,
              referrerId: referral.referrerId,
              referredUserId: referral.referredUserId,
              amount: new Decimal(amount),
              reason:
                milestonesReached.length > 0
                  ? `Referral qualified + milestone ${milestonesReached.join(', ')}`
                  : 'Referral qualified',
            },
          });
        }

        return {
          status: 'PAID',
          kind: 'JOIN',
          referralId: referral.id,
          referrerUserId: referral.referrerId,
          referrerDiscordId: referral.referrerDiscordId,
          referredDiscordId: referral.referredDiscordId,
          amount,
          perReferralAmount,
          milestoneBonus,
          milestonesReached,
          qualifiedReferrals,
          currencyName: config.currencyName,
          notifyDM: config.notifyDM,
          notifyDiscord: config.notifyDiscord,
        };
      },
      { timeout: 15000 }
    );

    if (outcome.status === 'PAID') {
      logger.info(
        `[Referral] Paid ${outcome.amount} to referrer ${outcome.referrerUserId} for ${outcome.referredDiscordId}` +
          (outcome.milestonesReached.length ? ` (milestones ${outcome.milestonesReached.join(', ')})` : '')
      );
    } else if (outcome.status === 'HELD') {
      logger.info(`[Referral] Reward held for referral ${referralId}: ${outcome.reason}`);
    }

    return outcome;
  }

  // ============================================
  // STATS
  // ============================================

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

    const [totalReferrals, successfulReferrals, pendingReferrals, notOnboardedReferrals, leftCount] =
      await Promise.all([
        prisma.referral.count({ where: { referrerId: user.id } }),
        prisma.referral.count({ where: { referrerId: user.id, rewardGiven: true } }),
        // Same meaning as the dashboard: onboarded, still here, not paid yet
        prisma.referral.count({
          where: {
            referrerId: user.id,
            rewardGiven: false,
            rewardEligible: true,
            onboardedAt: { not: null },
            hasLeftServer: false,
          },
        }),
        prisma.referral.count({
          where: { referrerId: user.id, onboardedAt: null, hasLeftServer: false },
        }),
        prisma.referral.count({ where: { referrerId: user.id, hasLeftServer: true } }),
      ]);

    const { activeCount, retentionRate } = summariseRetention(totalReferrals, leftCount);
    const nextMilestone = await this.getNextMilestone(user.id);

    return {
      userId: user.id,
      discordId: user.discordId,
      discordUsername: user.discordUsername,
      totalReferrals,
      successfulReferrals,
      pendingReferrals,
      notOnboardedReferrals,
      leftCount,
      activeCount,
      retentionRate,
      totalRewards: user.referralRewards.toNumber(),
      nextMilestone,
      recentReferrals: user.referrals.map((r) => ({
        id: r.id,
        referredDiscordId: r.referredDiscordId,
        referredUser: r.referredUser,
        joinedAt: r.joinedAt,
        onboardedAt: r.onboardedAt,
        rewardGiven: r.rewardGiven,
        rewardAmount: r.rewardAmount?.toNumber() || 0,
        rewardEligible: r.rewardEligible,
        holdReason: r.holdReason,
        hasLeftServer: r.hasLeftServer,
        daysInServer: memberDays(r),
      })),
    };
  }

  /**
   * Next unclaimed milestone and progress toward it, counted exactly as
   * tryPayReferral counts it. Null when milestones are not active.
   */
  private async getNextMilestone(referrerId: number) {
    const config = await this.referralRewardService.getConfig();
    const active =
      config.isEnabled &&
      (config.rewardMode === 'MILESTONE' || config.rewardMode === 'HYBRID') &&
      config.milestonesEnabled &&
      config.milestones.length > 0;

    if (!active) return null;

    const [progress, claimed] = await Promise.all([
      prisma.referral.count({
        where: { referrerId, rewardGiven: true, ...(config.countOnlyActive && { hasLeftServer: false }) },
      }),
      prisma.referralMilestone.findMany({ where: { userId: referrerId }, select: { milestone: true } }),
    ]);

    const claimedCounts = new Set(claimed.map((c) => c.milestone));
    const next = config.milestones.find((m) => !claimedCounts.has(m.count));

    if (!next) return null;

    return {
      count: next.count,
      reward: next.reward,
      progress,
      remaining: Math.max(0, next.count - progress),
      currencyName: config.currencyName,
    };
  }

  async getLeaderboard(limit: number = 10, sortBy: string = 'total') {
    const topReferrers = await prisma.user.findMany({
      where: { referrals: { some: {} }, ...nonStaffUserWhere },
      orderBy: { referrals: { _count: 'desc' } },
      // Over-fetch so the alternative sorts have something to reorder
      take: limit * 3,
      select: {
        id: true,
        discordId: true,
        discordUsername: true,
        discordDisplayName: true,
        referralRewards: true,
        referrals: {
          select: {
            hasLeftServer: true,
            rewardGiven: true,
          },
        },
      },
    });

    const usersWithRetention = topReferrers.map((user) => {
      const total = user.referrals.length;
      const leftCount = user.referrals.filter((r) => r.hasLeftServer).length;
      const { activeCount, retentionRate } = summariseRetention(total, leftCount);

      return {
        userId: user.id,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        discordDisplayName: user.discordDisplayName,
        totalReferrals: total,
        rewardedReferrals: user.referrals.filter((r) => r.rewardGiven).length,
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

    // Staff invites are part of the job, not referrals
    const where: Prisma.ReferralWhereInput = { referrer: nonStaffUserWhere };

    // Status filter takes precedence over the individual boolean filters
    if (dto.status && dto.status !== 'all') {
      switch (dto.status) {
        case 'rewarded':
          where.rewardGiven = true;
          break;
        case 'pending':
          where.rewardGiven = false;
          where.rewardEligible = true;
          where.onboardedAt = { not: null };
          where.hasLeftServer = false;
          break;
        case 'ineligible':
          where.rewardEligible = false;
          break;
        case 'not_onboarded':
          // Same rows the list badges as "Not Onboarded"
          where.onboardedAt = null;
          where.rewardEligible = true;
          where.hasLeftServer = false;
          break;
        case 'left':
          where.hasLeftServer = true;
          break;
      }
    } else {
      if (dto.rewardGiven !== undefined) {
        where.rewardGiven = dto.rewardGiven;
      }

      if (dto.onboarded !== undefined) {
        where.onboardedAt = dto.onboarded ? { not: null } : null;
      }
    }

    const search = dto.search?.trim();
    if (search) {
      where.OR = [
        { referrerDiscordId: { contains: search } },
        { referredDiscordId: { contains: search } },
        { inviteCode: { contains: search } },
        { referrer: { discordUsername: { contains: search } } },
        { referrer: { discordDisplayName: { contains: search } } },
        { referredUser: { discordUsername: { contains: search } } },
        { referredUser: { discordDisplayName: { contains: search } } },
      ];
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
      data: referrals.map((r) => ({ ...r, daysInServer: memberDays(r) })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFraudAnalytics() {
    const twentyFourHoursAgo = new Date(Date.now() - DAY_MS);
    const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);

    const describe = async (
      user: {
        id: number;
        discordId: string | null;
        discordUsername: string | null;
        discordDisplayName: string | null;
        totalReferrals: number;
        referralRewards: Decimal;
      },
      knownLast24h?: number
    ) => {
      const [referralCount, leftCount, last24hCount] = await Promise.all([
        prisma.referral.count({ where: { referrerId: user.id } }),
        prisma.referral.count({ where: { referrerId: user.id, hasLeftServer: true } }),
        knownLast24h !== undefined
          ? Promise.resolve(knownLast24h)
          : prisma.referral.count({ where: { referrerId: user.id, joinedAt: { gte: twentyFourHoursAgo } } }),
      ]);

      const { activeCount, retentionRate } = summariseRetention(referralCount, leftCount);

      return {
        userId: user.id,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        discordDisplayName: user.discordDisplayName,
        totalReferrals: referralCount,
        rewardedReferrals: user.totalReferrals,
        activeCount,
        leftCount,
        retentionRate,
        totalRewards: user.referralRewards.toNumber(),
        last24hReferrals: last24hCount,
        riskLevel: scoreRisk(last24hCount, referralCount, retentionRate),
      };
    };

    const userSelect = {
      id: true,
      discordId: true,
      discordUsername: true,
      discordDisplayName: true,
      totalReferrals: true,
      referralRewards: true,
    } as const;

    // Recent bursts, regardless of whether anything has been paid yet
    // Staff accounts are left out: the company account's manual invites were
    // flagged as a referral burst
    const recentReferrers = await prisma.user.findMany({
      where: { referrals: { some: { joinedAt: { gte: twentyFourHoursAgo } } }, ...nonStaffUserWhere },
      select: {
        ...userSelect,
        _count: { select: { referrals: { where: { joinedAt: { gte: twentyFourHoursAgo } } } } },
      },
      orderBy: { referrals: { _count: 'desc' } },
      take: 20,
    });

    const allTopReferrers = await prisma.user.findMany({
      where: { referrals: { some: {} }, ...nonStaffUserWhere },
      select: userSelect,
      orderBy: { referrals: { _count: 'desc' } },
      take: 10,
    });

    const [usersWithRates, topReferrersWithRetention] = await Promise.all([
      Promise.all(recentReferrers.map((u) => describe(u, u._count.referrals))),
      Promise.all(allTopReferrers.map((u) => describe(u))),
    ]);

    const customerReferral: Prisma.ReferralWhereInput = { referrer: nonStaffUserWhere };
    const [
      totalReferrals,
      pendingReferrals,
      notOnboardedReferrals,
      completedReferrals,
      leftReferrals,
      last24hReferrals,
      last7dReferrals,
    ] = await Promise.all([
      prisma.referral.count({ where: customerReferral }),
      prisma.referral.count({
        where: { ...customerReferral, rewardGiven: false, rewardEligible: true, onboardedAt: { not: null }, hasLeftServer: false },
      }),
      prisma.referral.count({ where: { ...customerReferral, onboardedAt: null } }),
      prisma.referral.count({ where: { ...customerReferral, rewardGiven: true } }),
      prisma.referral.count({ where: { ...customerReferral, hasLeftServer: true } }),
      prisma.referral.count({ where: { ...customerReferral, joinedAt: { gte: twentyFourHoursAgo } } }),
      prisma.referral.count({ where: { ...customerReferral, joinedAt: { gte: sevenDaysAgo } } }),
    ]);

    return {
      overview: {
        totalReferrals,
        pendingReferrals,
        notOnboardedReferrals,
        completedReferrals,
        leftReferrals,
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

      const totalCount = user.referrals.length;
      const leftCount = user.referrals.filter((r) => r.hasLeftServer).length;
      const { activeCount, retentionRate } = summariseRetention(totalCount, leftCount);

      let allReferrals = user.referrals.map((ref) => ({
        id: ref.id,
        referredUserId: ref.referredUserId,
        referredDiscordId: ref.referredDiscordId,
        referredUser: ref.referredUser,
        rewardGiven: ref.rewardGiven,
        rewardAmount: ref.rewardAmount?.toNumber() || 0,
        rewardEligible: ref.rewardEligible,
        holdReason: ref.holdReason,
        onboardedAt: ref.onboardedAt,
        hasLeftServer: ref.hasLeftServer,
        daysInServer: memberDays(ref),
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
              return !ref.rewardGiven && ref.rewardEligible && ref.onboardedAt !== null && !ref.hasLeftServer;
            case 'not_onboarded':
              return ref.onboardedAt === null && ref.rewardEligible && !ref.hasLeftServer;
            default:
              return true;
          }
        });
      }

      return {
        user: {
          id: user.id,
          discordUsername: user.discordUsername,
          discordDisplayName: user.discordDisplayName,
          totalReferrals: totalCount,
          rewardedReferrals: user.totalReferrals,
          totalRewards: user.referralRewards.toNumber(),
          activeCount,
          leftCount,
          retentionRate,
        },
        referredBy: user.referredBy,
        directReferrals: allReferrals,
        filteredCount: allReferrals.length,
        totalCount,
      };
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

      if (!user || !(await isRegisteredMember(user))) {
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
  // ADMIN: A USER'S PERSONAL LINK
  // ============================================

  private async findInviteOwner(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, discordId: true, email: true },
    });
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  /** The user's current link as stored; does not create one or check Discord. */
  async getUserInviteForAdmin(userId: number) {
    const user = await this.findInviteOwner(userId);

    const invite = await prisma.discordInvite.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { inviteCode: true, inviteUrl: true, uses: true, createdAt: true },
    });

    return {
      hasDiscord: !!user.discordId,
      onboarded: !!user.discordId && (await isRegisteredMember(user)),
      invite,
    };
  }

  /**
   * Asks the bot for the user's personal link, creating it in Discord if they
   * have none (or theirs was deleted). Same link /referral would give them.
   */
  async createUserInviteForAdmin(userId: number) {
    const user = await this.findInviteOwner(userId);

    if (!user.discordId) {
      throw new BadRequestError('This user has no linked Discord account');
    }
    if (!(await isRegisteredMember(user))) {
      throw new BadRequestError('This user has not completed onboarding yet');
    }

    const botApiUrl = process.env.BOT_API_URL || 'http://localhost:3002';
    try {
      const response = await axios.post(
        `${botApiUrl}/discord/referral/invite`,
        { discordId: user.discordId },
        { timeout: 20000, headers: { 'X-API-Key': process.env.DISCORD_BOT_API_KEY || '' } }
      );
      const invite = response.data?.data;
      if (!invite?.inviteUrl) throw new Error('The bot returned no link');
      logger.info(`[Referral] Admin fetched referral link for user ${user.id} (created: ${invite.created})`);
      return invite as { inviteUrl: string; inviteCode: string; created: boolean };
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Bot unavailable';
      logger.warn(`[Referral] Could not get referral link for user ${user.id}: ${message}`);
      throw new BadRequestError(`Could not get the link from the Discord bot: ${message}`);
    }
  }

  async deactivateInvite(inviteCode: string) {
    const result = await prisma.discordInvite.updateMany({
      where: { inviteCode, isActive: true },
      data: { isActive: false, lastSyncedAt: new Date() },
    });

    if (result.count > 0) {
      logger.info(`[Referral] Deactivated invite ${inviteCode}`);
    }

    return { deactivated: result.count };
  }

  // ============================================
  // MEMBER STATUS TRACKING
  // ============================================

  async markMemberLeft(discordId: string, leaveType: string) {
    const leftAt = new Date();

    const referrals = await prisma.referral.findMany({
      where: {
        referredDiscordId: discordId,
        hasLeftServer: false,
      },
    });

    if (referrals.length === 0) {
      throw new NotFoundError('No active referral found for this user');
    }

    const results = await prisma.$transaction(
      referrals.map((referral) =>
        prisma.referral.update({
          where: { id: referral.id },
          data: {
            hasLeftServer: true,
            leftServerAt: leftAt,
            daysInServer: daysSince(referral.joinedAt, leftAt),
            ...(!referral.rewardGiven && referral.rewardEligible && { holdReason: 'Member left the server' }),
          },
        })
      )
    );

    logger.info(
      `[Referral] Marked ${results.length} referral(s) as left for ${discordId} ` +
        `(${leaveType}, stayed ${results[0]?.daysInServer} days)`
    );

    return results;
  }

  async markMemberRejoined(discordId: string) {
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

    const results = await prisma.$transaction(
      referrals.map((referral) => this.rejoinUpdate(referral))
    );

    logger.info(`[Referral] Marked ${results.length} referral(s) as rejoined for ${discordId}`);

    return results;
  }

  /**
   * Reactivates a referral. For an unpaid one the days-in-server clock
   * restarts, otherwise "join, leave, come back a week later" would satisfy
   * minimumDaysInServer without the member ever staying.
   */
  private rejoinUpdate(referral: { id: string; rewardGiven: boolean; rewardEligible: boolean }) {
    const now = new Date();
    return prisma.referral.update({
      where: { id: referral.id },
      data: {
        hasLeftServer: false,
        leftServerAt: null,
        lastSeenAt: now,
        ...(!referral.rewardGiven && {
          joinedAt: now,
          daysInServer: 0,
          ...(referral.rewardEligible && { holdReason: 'Member rejoined; days-in-server count restarted' }),
        }),
      },
    });
  }

  async syncAllMemberStatus(guildMembers: Array<{ id: string }>) {
    if (!Array.isArray(guildMembers) || guildMembers.length === 0) {
      // An empty list would mark every referral as left; that is never a real guild.
      throw new BadRequestError('guildMembers must be a non-empty list');
    }

    logger.info('[Referral] Starting member status sync...');

    const memberIds = new Set(guildMembers.map((m) => m.id));
    const now = new Date();

    const referrals = await prisma.referral.findMany({
      select: {
        id: true,
        referredDiscordId: true,
        hasLeftServer: true,
        rewardGiven: true,
        rewardEligible: true,
        joinedAt: true,
      },
    });

    const toMarkLeft = referrals.filter((r) => !r.hasLeftServer && !memberIds.has(r.referredDiscordId));
    const toRejoin = referrals.filter((r) => r.hasLeftServer && memberIds.has(r.referredDiscordId));
    const stillActiveIds = referrals
      .filter((r) => !r.hasLeftServer && memberIds.has(r.referredDiscordId))
      .map((r) => r.id);

    for (const referral of toMarkLeft) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          hasLeftServer: true,
          leftServerAt: now,
          daysInServer: daysSince(referral.joinedAt, now),
          ...(!referral.rewardGiven && referral.rewardEligible && { holdReason: 'Member left the server' }),
        },
      });
    }

    for (const referral of toRejoin) {
      await this.rejoinUpdate(referral);
    }

    // lastSeenAt is the same for everyone still here, so batch it
    for (let i = 0; i < stillActiveIds.length; i += 1000) {
      await prisma.referral.updateMany({
        where: { id: { in: stillActiveIds.slice(i, i + 1000) } },
        data: { lastSeenAt: now },
      });
    }

    logger.info(
      `[Referral] Sync complete: ${toMarkLeft.length} marked as left, ${toRejoin.length} rejoined, ` +
        `${stillActiveIds.length} still active`
    );

    return {
      totalChecked: referrals.length,
      markedAsLeft: toMarkLeft.length,
      rejoined: toRejoin.length,
      stillActive: stillActiveIds.length,
    };
  }
}
