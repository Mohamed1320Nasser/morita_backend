/**
 * Seed Script: Add Multi-Tier Boss Pricing
 *
 * This script adds combat-level based pricing tiers for bossing services,
 * matching the old OSRS Machines system where higher combat = cheaper prices.
 *
 * Example: Corrupted Gauntlet (cgp)
 * - 75+ w/ Rigour + Augury: $1.04/kill
 * - 80+ w/ Rigour + Augury: $0.95/kill
 * - 85+ w/ Rigour + Augury: $0.82/kill
 * - 90+ w/ Rigour + Augury: $0.68/kill
 * - 95+ w/ Rigour + Augury: $0.63/kill
 * - 99+ w/ Rigour + Augury: $0.57/kill
 *
 * Usage: npx ts-node src/scripts/add-boss-pricing-tiers.ts
 */

import { PrismaClient } from '@prisma/client';
import logger from '../common/loggers';

const prisma = new PrismaClient();

interface BossTier {
    name: string;
    basePrice: number;
    description: string;
}

interface BossConfig {
    serviceName: string;
    serviceSlug: string;
    tiers: BossTier[];
}

// Define boss configurations with pricing tiers
const bossConfigs: BossConfig[] = [
    {
        serviceName: 'Corrupted Gauntlet',
        serviceSlug: 'corrupted-gauntlet',
        tiers: [
            { name: '75+ w/ Rigour + Augury Unlocked', basePrice: 1.04, description: 'Per Kc' },
            { name: '80+ w/ Rigour + Augury Unlocked', basePrice: 0.95, description: 'Per Kc' },
            { name: '85+ w/ Rigour + Augury Unlocked', basePrice: 0.82, description: 'Per Kc' },
            { name: '90+ w/ Rigour + Augury Unlocked', basePrice: 0.68, description: 'Per Kc' },
            { name: '95+ w/ Rigour + Augury Unlocked', basePrice: 0.63, description: 'Per Kc' },
            { name: '99+ w/ Rigour + Augury Unlocked', basePrice: 0.57, description: 'Per Kc' },
        ]
    },
    {
        serviceName: 'Chambers of Xeric',
        serviceSlug: 'chambers-of-xeric',
        tiers: [
            { name: '75+ (CoX Normal)', basePrice: 2.50, description: 'Per Kc' },
            { name: '80+ (CoX Normal)', basePrice: 2.30, description: 'Per Kc' },
            { name: '85+ (CoX Normal)', basePrice: 2.10, description: 'Per Kc' },
            { name: '90+ (CoX Normal)', basePrice: 1.90, description: 'Per Kc' },
            { name: '95+ (CoX Normal)', basePrice: 1.70, description: 'Per Kc' },
            { name: '99+ (CoX Normal)', basePrice: 1.50, description: 'Per Kc' },
        ]
    },
    {
        serviceName: 'Theatre of Blood',
        serviceSlug: 'theatre-of-blood',
        tiers: [
            { name: '75+ (ToB Normal)', basePrice: 5.00, description: 'Per Kc' },
            { name: '80+ (ToB Normal)', basePrice: 4.75, description: 'Per Kc' },
            { name: '85+ (ToB Normal)', basePrice: 4.50, description: 'Per Kc' },
            { name: '90+ (ToB Normal)', basePrice: 4.25, description: 'Per Kc' },
            { name: '95+ (ToB Normal)', basePrice: 4.00, description: 'Per Kc' },
            { name: '99+ (ToB Normal)', basePrice: 3.75, description: 'Per Kc' },
        ]
    },
    {
        serviceName: 'Gauntlet',
        serviceSlug: 'gauntlet',
        tiers: [
            { name: '75+ (Normal Gauntlet)', basePrice: 0.75, description: 'Per Kc' },
            { name: '80+ (Normal Gauntlet)', basePrice: 0.70, description: 'Per Kc' },
            { name: '85+ (Normal Gauntlet)', basePrice: 0.65, description: 'Per Kc' },
            { name: '90+ (Normal Gauntlet)', basePrice: 0.60, description: 'Per Kc' },
            { name: '95+ (Normal Gauntlet)', basePrice: 0.55, description: 'Per Kc' },
            { name: '99+ (Normal Gauntlet)', basePrice: 0.50, description: 'Per Kc' },
        ]
    },
    {
        serviceName: 'Zulrah',
        serviceSlug: 'zulrah',
        tiers: [
            { name: '75+ (Zulrah)', basePrice: 0.85, description: 'Per Kc' },
            { name: '80+ (Zulrah)', basePrice: 0.78, description: 'Per Kc' },
            { name: '85+ (Zulrah)', basePrice: 0.72, description: 'Per Kc' },
            { name: '90+ (Zulrah)', basePrice: 0.65, description: 'Per Kc' },
            { name: '95+ (Zulrah)', basePrice: 0.60, description: 'Per Kc' },
            { name: '99+ (Zulrah)', basePrice: 0.55, description: 'Per Kc' },
        ]
    },
];

async function addBossPricingTiers() {
    logger.info('🎮 Starting boss pricing tiers seed...');

    for (const bossConfig of bossConfigs) {
        try {
            logger.info(`\n📊 Processing: ${bossConfig.serviceName}`);

            // Find the service
            const service = await prisma.service.findFirst({
                where: {
                    OR: [
                        { slug: bossConfig.serviceSlug },
                        { name: { contains: bossConfig.serviceName, mode: 'insensitive' } }
                    ]
                },
                include: {
                    pricingMethods: true
                }
            });

            if (!service) {
                logger.warn(`⚠️ Service not found: ${bossConfig.serviceName} (${bossConfig.serviceSlug})`);
                logger.info(`   Creating service...`);

                // Create the service if it doesn't exist
                const newService = await prisma.service.create({
                    data: {
                        name: bossConfig.serviceName,
                        slug: bossConfig.serviceSlug,
                        description: `${bossConfig.serviceName} bossing service`,
                        active: true,
                        emoji: '⚔️',
                    }
                });

                logger.info(`✅ Created service: ${newService.name} (ID: ${newService.id})`);

                // Now add pricing methods
                await addPricingMethodsToService(newService.id, bossConfig.tiers);
            } else {
                logger.info(`✅ Found service: ${service.name} (ID: ${service.id})`);

                // Delete existing PER_KILL pricing methods
                const deleted = await prisma.pricingMethod.deleteMany({
                    where: {
                        serviceId: service.id,
                        pricingUnit: 'PER_KILL'
                    }
                });

                logger.info(`🗑️  Deleted ${deleted.count} existing PER_KILL pricing methods`);

                // Add new pricing methods
                await addPricingMethodsToService(service.id, bossConfig.tiers);
            }

        } catch (error) {
            logger.error(`❌ Error processing ${bossConfig.serviceName}:`, error);
        }
    }

    logger.info('\n✅ Boss pricing tiers seed completed!');
}

async function addPricingMethodsToService(serviceId: string, tiers: BossTier[]) {
    for (const tier of tiers) {
        try {
            const pricingMethod = await prisma.pricingMethod.create({
                data: {
                    serviceId: serviceId,
                    name: tier.name,
                    description: tier.description,
                    basePrice: tier.basePrice,
                    pricingUnit: 'PER_KILL',
                    active: true,
                }
            });

            logger.info(`  ➕ Added tier: ${tier.name} ($${tier.basePrice}/kill)`);
        } catch (error) {
            logger.error(`  ❌ Failed to add tier ${tier.name}:`, error);
        }
    }
}

// Run the seed
addBossPricingTiers()
    .then(() => {
        logger.info('\n🎉 All done! Your boss pricing tiers are now set up like the old system.');
        logger.info('   Test with: !p cgp 50 or !p cox 120');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('❌ Seed failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
