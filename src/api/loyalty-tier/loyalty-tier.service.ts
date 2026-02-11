import { Service } from 'typedi';
import prisma from '../../common/prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../../common/loggers';
import { NotFoundError, BadRequestError } from 'routing-controllers';
import { CreateLoyaltyTierDto, UpdateLoyaltyTierDto } from './dtos';
//  const { getDiscordClient } = import('../../discord-bot');

@Service()
export default class LoyaltyTierService {
  async calculateUserTotalSpending(userId: number): Promise<Decimal> {
    const result = await prisma.order.aggregate({
      where: {
        customerId: userId,
        status: 'COMPLETED',
      },
      _sum: {
        orderValue: true,
      },
    });

    const totalSpent = result._sum.orderValue || new Decimal(0);
    return new Decimal(totalSpent.toString());
  }

  async getTierForSpending(totalSpent: Decimal): Promise<any | null> {
    const totalSpentNumber = Number(totalSpent.toString());

    const tier = await prisma.loyaltyTier.findFirst({
      where: {
        isActive: true,
        minSpending: { lte: totalSpentNumber },
        OR: [
          { maxSpending: null },
          { maxSpending: { gte: totalSpentNumber } },
        ],
      },
      orderBy: {
        minSpending: 'desc',
      },
    });

    return tier;
  }

  async updateUserTier(userId: number): Promise<{
    tierChanged: boolean;
    oldTier: any | null;
    newTier: any | null;
    totalSpent: Decimal;
  }> {
    const totalSpent = await this.calculateUserTotalSpending(userId);
    const newTier = await this.getTierForSpending(totalSpent);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { loyaltyTier: true },
    });

    if (!user) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    const oldTier = user.loyaltyTier;
    const oldTierId = user.loyaltyTierId;
    const newTierId = newTier?.id || null;
    const tierChanged = oldTierId !== newTierId;

    if (!tierChanged) {
      await prisma.user.update({
        where: { id: userId },
        data: { totalSpent: totalSpent.toNumber() },
      });

      return { tierChanged: false, oldTier, newTier, totalSpent };
    }

    logger.info(
      `[LoyaltyTier] User ${userId} tier: ${oldTier?.name || 'None'} → ${newTier?.name || 'None'}`
    );

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          loyaltyTierId: newTierId,
          totalSpent: totalSpent.toNumber(),
          lastTierUpdate: new Date(),
        },
      });

      if (newTierId) {
        await tx.loyaltyTierHistory.create({
          data: {
            userId,
            fromTierId: oldTierId,
            toTierId: newTierId,
            totalSpent: totalSpent.toNumber(),
            reason: 'automatic',
          },
        });
      }
    });

    return { tierChanged: true, oldTier, newTier, totalSpent };
  }

  async applyLoyaltyDiscount(
    userId: number,
    basePrice: Decimal
  ): Promise<{
    originalPrice: Decimal;
    discountPercent: Decimal;
    discountAmount: Decimal;
    finalPrice: Decimal;
    tierName: string;
    tierEmoji: string;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { loyaltyTier: true },
    });

    if (!user || !user.loyaltyTier) {
      return {
        originalPrice: basePrice,
        discountPercent: new Decimal(0),
        discountAmount: new Decimal(0),
        finalPrice: basePrice,
        tierName: 'None',
        tierEmoji: '👤',
      };
    }

    const tier = user.loyaltyTier;
    const discountPercent = new Decimal(tier.discountPercent.toString());
    const discountAmount = basePrice.mul(discountPercent).div(100);
    const finalPrice = basePrice.sub(discountAmount);

    return {
      originalPrice: basePrice,
      discountPercent,
      discountAmount,
      finalPrice,
      tierName: tier.name,
      tierEmoji: tier.emoji,
    };
  }

  async getUserTierInfo(userId: number): Promise<{
    currentTier: any | null;
    totalSpent: Decimal;
    nextTier: any | null;
    amountUntilNextTier: Decimal | null;
    tierHistory: any[];
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        loyaltyTier: true,
        tierHistory: {
          include: { tier: true },
          orderBy: { changedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    const totalSpent = new Decimal(user.totalSpent.toString());
    const currentTier = user.loyaltyTier;

    const nextTier = await prisma.loyaltyTier.findFirst({
      where: {
        isActive: true,
        minSpending: { gt: totalSpent.toNumber() },
      },
      orderBy: { minSpending: 'asc' },
    });

    const amountUntilNextTier = nextTier
      ? new Decimal(nextTier.minSpending.toString()).sub(totalSpent)
      : null;

    return {
      currentTier,
      totalSpent,
      nextTier,
      amountUntilNextTier,
      tierHistory: user.tierHistory,
    };
  }

  async recalculateAllUserTiers(): Promise<{
    totalProcessed: number;
    tiersUpdated: number;
    errors: number;
  }> {
    const users = await prisma.user.findMany({
      where: {
        discordRole: 'customer',
      },
      select: { id: true },
    });

    const stats = {
      totalProcessed: 0,
      tiersUpdated: 0,
      errors: 0,
    };

    for (const user of users) {
      const result = await this.updateUserTier(user.id).catch(() => {
        stats.errors++;
        return null;
      });

      if (result) {
        stats.totalProcessed++;
        if (result.tierChanged) {
          stats.tiersUpdated++;
        }
      }
    }

    return stats;
  }

  async getAllTiers() {
    return await prisma.loyaltyTier.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getTierById(tierId: string) {
    const tier = await prisma.loyaltyTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) {
      throw new NotFoundError(`Loyalty tier ${tierId} not found`);
    }

    return tier;
  }

  async createTier(data: CreateLoyaltyTierDto) {
    if (data.maxSpending && data.minSpending >= data.maxSpending) {
      throw new BadRequestError('minSpending must be less than maxSpending');
    }

    return await prisma.loyaltyTier.create({
      data: {
        name: data.name,
        emoji: data.emoji,
        minSpending: data.minSpending,
        maxSpending: data.maxSpending || null,
        discountPercent: data.discountPercent,
        discordRoleId: data.discordRoleId || null,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  async updateTier(tierId: string, data: UpdateLoyaltyTierDto) {
    await this.getTierById(tierId);

    if (data.minSpending !== undefined && data.maxSpending !== undefined) {
      if (data.maxSpending && data.minSpending >= data.maxSpending) {
        throw new BadRequestError('minSpending must be less than maxSpending');
      }
    }

    return await prisma.loyaltyTier.update({
      where: { id: tierId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.emoji && { emoji: data.emoji }),
        ...(data.minSpending !== undefined && { minSpending: data.minSpending }),
        ...(data.maxSpending !== undefined && { maxSpending: data.maxSpending }),
        ...(data.discountPercent !== undefined && { discountPercent: data.discountPercent }),
        ...(data.discordRoleId !== undefined && { discordRoleId: data.discordRoleId }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteTier(tierId: string) {
    await this.getTierById(tierId);

    const usersWithTier = await prisma.user.count({
      where: { loyaltyTierId: tierId },
    });

    if (usersWithTier > 0) {
      throw new BadRequestError(
        `Cannot delete tier: ${usersWithTier} users currently have this tier`
      );
    }

    return await prisma.loyaltyTier.delete({
      where: { id: tierId },
    });
  }
}
