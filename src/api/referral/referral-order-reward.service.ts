import { Service } from 'typedi';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BadRequestError, NotFoundError } from 'routing-controllers';
import prisma from '../../common/prisma/client';
import logger from '../../common/loggers';
import ReferralRewardService from '../referralReward/referral-reward.service';

const DAY_MS = 24 * 60 * 60 * 1000;

// Pending order rewards paid per cron run.
const PENDING_BATCH_SIZE = 200;

type ReferralConfig = Awaited<ReturnType<ReferralRewardService['getConfig']>>;

export interface ReferralOrderPayout {
  status: 'PAID';
  kind: 'ORDER';
  orderRewardId: string;
  referralId: string;
  referrerUserId: number;
  referrerDiscordId: string;
  referredDiscordId: string;
  orderNumber: number;
  orderValue: number;
  rewardType: 'FIXED' | 'PERCENTAGE';
  rewardValue: number;
  amount: number;
  currencyName: string;
  notifyDM: boolean;
  notifyDiscord: boolean;
}

const round2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100;

/**
 * Reward for one order: % of the value (or a fixed amount), capped per order
 * and by what is left of the lifetime cap. Rounded down to the cent so it
 * never pays more than configured.
 */
export function calculateOrderReward(
  config: {
    orderRewardType: string;
    orderRewardValue: number;
    orderRewardMaxPerOrder: number;
    orderRewardLifetimeCap: number;
  },
  orderValue: number,
  alreadyEarned: number
): number {
  let amount =
    config.orderRewardType === 'FIXED'
      ? config.orderRewardValue
      : (orderValue * config.orderRewardValue) / 100;

  if (config.orderRewardMaxPerOrder > 0) {
    amount = Math.min(amount, config.orderRewardMaxPerOrder);
  }

  if (config.orderRewardLifetimeCap > 0) {
    amount = Math.min(amount, config.orderRewardLifetimeCap - alreadyEarned);
  }

  return Math.max(0, round2(amount));
}

/**
 * Pays referrers a share of the orders their referred customers place.
 *
 *   order COMPLETED      -> PENDING reward, eligible after the hold period
 *   order leaves COMPLETED during the hold (dispute/refund) -> CANCELLED
 *   dispute resolved back to COMPLETED -> PENDING again with a fresh hold
 *   hold over, order still COMPLETED   -> PAID by the referral cron
 *
 * Paying only after the hold means a refund never has to claw money back.
 */
@Service()
export default class ReferralOrderRewardService {
  constructor(private referralRewardService: ReferralRewardService) {}

  isActive(config: ReferralConfig) {
    return config.isEnabled && config.orderRewardEnabled;
  }

  /** Called by OrderService whenever an order reaches COMPLETED. Never throws. */
  async onOrderCompleted(orderId: string) {
    try {
      const config = await this.referralRewardService.getConfig();
      if (!this.isActive(config)) return null;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, orderNumber: true, customerId: true, orderValue: true, status: true, confirmedAt: true },
      });
      if (!order || order.status !== 'COMPLETED') return null;

      const referral = await prisma.referral.findFirst({
        where: { referredUserId: order.customerId },
        orderBy: { createdAt: 'asc' },
      });
      if (!referral) return null;

      // Joined while the whole programme was off: never rewarded
      if (!referral.rewardEligible) return null;
      if (referral.referrerId === order.customerId) return null;

      const existing = await prisma.referralOrderReward.findUnique({ where: { orderId } });
      const now = new Date();
      const eligibleAt = new Date(now.getTime() + config.orderRewardHoldDays * DAY_MS);

      if (existing) {
        // Dispute resolved in the customer's favour of completion: reinstate with a fresh hold
        if (existing.status === 'CANCELLED' && existing.cancelReason?.startsWith('Order moved to')) {
          await prisma.referralOrderReward.update({
            where: { id: existing.id },
            data: { status: 'PENDING', eligibleAt, cancelledAt: null, cancelReason: null },
          });
          logger.info(`[ReferralOrder] Reinstated reward ${existing.id} for order #${order.orderNumber}`);
        }
        return null;
      }

      const orderValue = Number(order.orderValue);
      if (orderValue < config.orderRewardMinOrderValue) {
        logger.info(
          `[ReferralOrder] Order #${order.orderNumber} (${orderValue}) below minimum ${config.orderRewardMinOrderValue}`
        );
        return null;
      }

      if (config.orderRewardWindowDays > 0) {
        const ageDays = (now.getTime() - referral.createdAt.getTime()) / DAY_MS;
        if (ageDays > config.orderRewardWindowDays) return null;
      }

      // "First N orders": completed orders this customer had before this one
      const earlierCompleted = await prisma.order.count({
        where: {
          customerId: order.customerId,
          status: 'COMPLETED',
          id: { not: order.id },
          confirmedAt: { lt: order.confirmedAt ?? now },
        },
      });
      if (earlierCompleted >= config.orderRewardOrderCount) return null;

      try {
        // Locking the referral serialises two orders completing at once, so
        // both cannot read the same "earned so far" and pass the lifetime cap.
        const reward = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM \`Referral\` WHERE id = ${referral.id} FOR UPDATE`;

          let alreadyEarned = 0;
          if (config.orderRewardLifetimeCap > 0) {
            const earned = await tx.referralOrderReward.aggregate({
              where: { referralId: referral.id, status: { in: ['PENDING', 'PAID'] } },
              _sum: { amount: true },
            });
            alreadyEarned = Number(earned._sum.amount || 0);
          }

          const amount = calculateOrderReward(config, orderValue, alreadyEarned);
          if (amount < 0.01) return null;

          return tx.referralOrderReward.create({
            data: {
              referralId: referral.id,
              referrerId: referral.referrerId,
              referredUserId: order.customerId,
              orderId: order.id,
              orderValue: new Decimal(orderValue),
              rewardType: config.orderRewardType,
              rewardValue: new Decimal(config.orderRewardValue),
              amount: new Decimal(amount),
              eligibleAt,
            },
          });
        });
        if (!reward) return null;
        const amount = Number(reward.amount);

        logger.info(
          `[ReferralOrder] Order #${order.orderNumber}: ${amount} pending for referrer ${referral.referrerId} ` +
            `until ${eligibleAt.toISOString()}`
        );
        return reward;
      } catch (error: any) {
        // Two completion events racing: orderId is unique, the first one wins
        if (error?.code === 'P2002') return null;
        throw error;
      }
    } catch (error: any) {
      logger.error(`[ReferralOrder] Failed to record reward for order ${orderId}: ${error?.message || error}`);
      return null;
    }
  }

  /** Called by OrderService when an order leaves COMPLETED (dispute, refund...). Never throws. */
  async onOrderReversed(orderId: string, toStatus: string) {
    try {
      const result = await prisma.referralOrderReward.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: `Order moved to ${toStatus}` },
      });

      if (result.count > 0) {
        logger.info(`[ReferralOrder] Cancelled pending reward for order ${orderId} (${toStatus})`);
        return;
      }

      const paid = await prisma.referralOrderReward.findFirst({ where: { orderId, status: 'PAID' } });
      if (paid) {
        logger.warn(
          `[ReferralOrder] Order ${orderId} moved to ${toStatus} after its referral reward ` +
            `(${paid.amount}) was already paid; review manually if needed`
        );
      }
    } catch (error: any) {
      logger.error(`[ReferralOrder] Failed to cancel reward for order ${orderId}: ${error?.message || error}`);
    }
  }

  /** Pays every pending order reward whose hold period is over. */
  async processPending(config: ReferralConfig): Promise<ReferralOrderPayout[]> {
    // While switched off, rewards already earned simply keep waiting
    if (!this.isActive(config)) return [];

    const due = await prisma.referralOrderReward.findMany({
      where: { status: 'PENDING', eligibleAt: { lte: new Date() } },
      orderBy: { eligibleAt: 'asc' },
      take: PENDING_BATCH_SIZE,
      select: { id: true },
    });

    const paid: ReferralOrderPayout[] = [];

    for (const { id } of due) {
      try {
        const payout = await this.pay(id, config);
        if (payout) paid.push(payout);
      } catch (error: any) {
        logger.error(`[ReferralOrder] Failed to pay order reward ${id}: ${error?.message || error}`);
      }
    }

    if (due.length > 0) {
      logger.info(`[ReferralOrder] Pending order rewards: ${paid.length}/${due.length} paid`);
    }

    return paid;
  }

  private async pay(rewardId: string, config: ReferralConfig): Promise<ReferralOrderPayout | null> {
    const head = await prisma.referralOrderReward.findUnique({
      where: { id: rewardId },
      select: { referrerId: true },
    });
    if (!head) return null;

    const now = new Date();

    return prisma.$transaction(
      async (tx) => {
        // Same per-referrer lock as join rewards, so wallet updates never interleave
        await tx.$queryRaw`SELECT id FROM \`User\` WHERE id = ${head.referrerId} FOR UPDATE`;

        const reward = await tx.referralOrderReward.findUnique({
          where: { id: rewardId },
          include: {
            order: { select: { orderNumber: true, status: true } },
            referral: { select: { referrerDiscordId: true, referredDiscordId: true } },
          },
        });

        if (!reward || reward.status !== 'PENDING') return null;

        // Belt and braces: the order must still be completed when we pay
        if (reward.order.status !== 'COMPLETED') {
          await tx.referralOrderReward.update({
            where: { id: reward.id },
            data: { status: 'CANCELLED', cancelledAt: now, cancelReason: `Order moved to ${reward.order.status}` },
          });
          return null;
        }

        const amount = Number(reward.amount);

        let wallet = await tx.wallet.findUnique({ where: { userId: reward.referrerId } });
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: { userId: reward.referrerId, walletType: 'CUSTOMER', balance: 0, pendingBalance: 0, currency: 'USD' },
          });
        }

        const balanceBefore = new Decimal(wallet.balance);
        const balanceAfter = balanceBefore.plus(amount);

        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            orderId: reward.orderId,
            type: 'REFERRAL_ORDER_REWARD',
            amount: new Decimal(amount),
            balanceBefore,
            balanceAfter,
            status: 'COMPLETED',
            reference: `referral-order-${reward.id}`,
            notes:
              `Referral order reward: order #${reward.order.orderNumber} by ${reward.referral.referredDiscordId} ` +
              (reward.rewardType === 'PERCENTAGE'
                ? `(${Number(reward.rewardValue)}% of ${Number(reward.orderValue).toFixed(2)})`
                : '(fixed)'),
            createdById: reward.referrerId,
          },
        });

        // Also in the general referral earnings history (user profile, totals)
        await tx.referralReward.create({
          data: {
            referralId: reward.referralId,
            referrerId: reward.referrerId,
            referredUserId: reward.referredUserId,
            amount: new Decimal(amount),
            reason: `Order #${reward.order.orderNumber} reward`,
          },
        });

        await tx.user.update({
          where: { id: reward.referrerId },
          data: { referralRewards: { increment: amount } },
        });

        await tx.referralOrderReward.update({
          where: { id: reward.id },
          data: { status: 'PAID', paidAt: now },
        });

        logger.info(`[ReferralOrder] Paid ${amount} to referrer ${reward.referrerId} for order #${reward.order.orderNumber}`);

        return {
          status: 'PAID' as const,
          kind: 'ORDER' as const,
          orderRewardId: reward.id,
          referralId: reward.referralId,
          referrerUserId: reward.referrerId,
          referrerDiscordId: reward.referral.referrerDiscordId,
          referredDiscordId: reward.referral.referredDiscordId,
          orderNumber: reward.order.orderNumber,
          orderValue: Number(reward.orderValue),
          rewardType: reward.rewardType,
          rewardValue: Number(reward.rewardValue),
          amount,
          currencyName: config.currencyName,
          notifyDM: config.notifyDM,
          notifyDiscord: config.notifyDiscord,
        };
      },
      { timeout: 15000 }
    );
  }

  // ============================================
  // ADMIN
  // ============================================

  async list(params: { page: number; limit: number; status?: string; search?: string }) {
    const { page, limit } = params;
    const where: Prisma.ReferralOrderRewardWhereInput = {};

    if (params.status && params.status !== 'all') {
      where.status = params.status as any;
    }

    const search = params.search?.trim();
    if (search) {
      const asNumber = Number(search.replace('#', ''));
      where.OR = [
        { referral: { referrerDiscordId: { contains: search } } },
        { referral: { referredDiscordId: { contains: search } } },
        { referrer: { discordUsername: { contains: search } } },
        { referredUser: { discordUsername: { contains: search } } },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ order: { orderNumber: asNumber } }] : []),
      ];
    }

    const userSelect = { id: true, discordId: true, discordUsername: true, discordDisplayName: true };

    const [list, total, summary] = await Promise.all([
      prisma.referralOrderReward.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          referrer: { select: userSelect },
          referredUser: { select: userSelect },
          order: { select: { id: true, orderNumber: true, status: true } },
        },
      }),
      prisma.referralOrderReward.count({ where }),
      prisma.referralOrderReward.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    const totals = Object.fromEntries(
      ['PENDING', 'PAID', 'CANCELLED'].map((status) => {
        const row = summary.find((r) => r.status === status);
        return [status, { count: row?._count._all || 0, amount: Number(row?._sum.amount || 0) }];
      })
    );

    return {
      list: list.map((r) => ({
        ...r,
        orderValue: Number(r.orderValue),
        rewardValue: Number(r.rewardValue),
        amount: Number(r.amount),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      totals,
    };
  }

  /** Admin: stop a pending reward (e.g. suspected self-referral). */
  async cancel(id: string, reason?: string) {
    const reward = await prisma.referralOrderReward.findUnique({ where: { id } });
    if (!reward) throw new NotFoundError('Order reward not found');
    if (reward.status !== 'PENDING') {
      throw new BadRequestError(`Only pending rewards can be cancelled (this one is ${reward.status})`);
    }

    // Conditional on PENDING: the cron may pay it between the read above and here
    const result = await prisma.referralOrderReward.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: (reason?.trim() || 'Cancelled by admin').slice(0, 255),
      },
    });
    if (result.count === 0) {
      throw new BadRequestError('This reward was just paid or cancelled; refresh the list');
    }

    return prisma.referralOrderReward.findUnique({ where: { id } });
  }
}
