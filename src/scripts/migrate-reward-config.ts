import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateRewardConfig() {
    try {
        console.log('[Migration] Starting reward config migration...');

        // Update or create default config
        const config = await prisma.referralRewardConfig.upsert({
            where: { id: 'default-config' },
            update: {
                rewardMode: 'HYBRID',
                perReferralEnabled: true,
                perReferralAmount: 1.00,
                milestonesEnabled: true,
                milestones: [
                    { count: 5, reward: 5, type: 'BONUS' },
                    { count: 10, reward: 15, type: 'BONUS' },
                    { count: 25, reward: 50, type: 'BONUS' },
                    { count: 50, reward: 150, type: 'BONUS' },
                    { count: 100, reward: 400, type: 'BONUS' },
                ],
                minimumRetentionRate: 70,
                minimumDaysInServer: 7,
                countOnlyActive: true,
                cooldownMinutes: 5,
            },
            create: {
                id: 'default-config',
                rewardMode: 'HYBRID',
                perReferralEnabled: true,
                perReferralAmount: 1.00,
                milestonesEnabled: true,
                milestones: [
                    { count: 5, reward: 5, type: 'BONUS' },
                    { count: 10, reward: 15, type: 'BONUS' },
                    { count: 25, reward: 50, type: 'BONUS' },
                    { count: 50, reward: 150, type: 'BONUS' },
                    { count: 100, reward: 400, type: 'BONUS' },
                ],
                minimumRetentionRate: 70,
                minimumDaysInServer: 7,
                countOnlyActive: true,
                maxRewardsPerDay: 10,
                cooldownMinutes: 5,
                requireOnboarding: true,
                notifyDiscord: true,
                notifyDM: true,
                currencyName: '$',
            },
        });

        console.log('[Migration] ✅ Reward config migrated successfully:', config);
    } catch (error) {
        console.error('[Migration] ❌ Error migrating reward config:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

migrateRewardConfig();
