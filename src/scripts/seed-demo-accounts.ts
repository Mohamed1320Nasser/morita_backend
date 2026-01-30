#!/usr/bin/env node

import { PrismaClient, AccountCategory, AccountStatus } from "@prisma/client";
import logger from "../common/loggers";

const prisma = new PrismaClient();

// Demo account data for each category
const demoAccounts = [
    // MAIN accounts (3)
    {
        name: "Maxed Main - 2277 Total",
        price: 850.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.MAIN,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 2277,
            combatLevel: 126,
            questPoints: 308,
            description: "Fully maxed main account with all 99s. Quest cape, music cape, and achievement diary cape included.",
            highlights: ["All 99s", "Quest Cape", "Max Cape", "300M+ Bank"],
        },
    },
    {
        name: "High Level Main - 2100+ Total",
        price: 450.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.MAIN,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 2150,
            combatLevel: 126,
            questPoints: 290,
            description: "High level main with excellent stats. Ready for end-game content.",
            highlights: ["126 Combat", "Fire Cape", "Barrows Gloves", "Dragon Defender"],
        },
    },
    {
        name: "Mid Level Main - 1750 Total",
        price: 180.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.MAIN,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1750,
            combatLevel: 110,
            questPoints: 200,
            description: "Solid mid-level main account. Great for progressing to end-game.",
            highlights: ["Base 70s", "Recipe for Disaster", "Fire Cape"],
        },
    },

    // IRONS accounts (3)
    {
        name: "End-Game Ironman - 2200+ Total",
        price: 1200.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.IRONS,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 2250,
            combatLevel: 126,
            questPoints: 300,
            description: "End-game ironman with extensive gear collection. CoX and ToB ready.",
            highlights: ["Full Ancestral", "Dragon Hunter Lance", "Twisted Bow", "Infernal Cape"],
        },
    },
    {
        name: "Mid-Game Ironman - 1900 Total",
        price: 550.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.IRONS,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1900,
            combatLevel: 115,
            questPoints: 250,
            description: "Well-progressed ironman with good gear and stats.",
            highlights: ["Trident", "Blowpipe", "Barrows Sets", "Fire Cape"],
        },
    },
    {
        name: "Early Ironman - 1500 Total",
        price: 200.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.IRONS,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1500,
            combatLevel: 95,
            questPoints: 175,
            description: "Early-game ironman with solid foundation.",
            highlights: ["Dragon Scimitar", "Fighter Torso", "Barrows Gloves"],
        },
    },

    // HCIM accounts (2)
    {
        name: "High Level HCIM - 2000+ Total",
        price: 1500.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.HCIM,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 2050,
            combatLevel: 120,
            questPoints: 280,
            description: "Rare high-level Hardcore Ironman. Never died, excellent progression.",
            highlights: ["Still Hardcore", "Full Barrows", "Zenyte Jewelry", "Fire Cape"],
        },
    },
    {
        name: "Mid Level HCIM - 1600 Total",
        price: 400.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.HCIM,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1600,
            combatLevel: 100,
            questPoints: 200,
            description: "Mid-level Hardcore Ironman with safe progression.",
            highlights: ["Still Hardcore", "Base 70 Combat", "RFD Complete"],
        },
    },

    // ZERK accounts (3)
    {
        name: "Maxed Zerker - 45 Defence",
        price: 350.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.ZERK,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1650,
            combatLevel: 100,
            questPoints: 175,
            description: "Perfectly built zerker with 99 strength and 45 defence.",
            highlights: ["99 Strength", "99 Attack", "45 Defence", "Fire Cape", "Torso"],
        },
    },
    {
        name: "PKing Zerker - Vengeance",
        price: 280.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.ZERK,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1500,
            combatLevel: 97,
            questPoints: 150,
            description: "PK-ready zerker with vengeance and optimal stats.",
            highlights: ["94 Magic", "Vengeance", "Barrows Gloves", "Fire Cape"],
        },
    },
    {
        name: "Budget Zerker Build",
        price: 150.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.ZERK,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1200,
            combatLevel: 85,
            questPoints: 120,
            description: "Budget zerker build ready for training.",
            highlights: ["45 Defence", "Base 80 Melee", "B Gloves Ready"],
        },
    },

    // PURE accounts (3)
    {
        name: "Maxed 1 Def Pure - 99 Range/Str",
        price: 300.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.PURE,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1400,
            combatLevel: 88,
            questPoints: 50,
            description: "Maxed 1 defence pure with 99 ranged and strength.",
            highlights: ["99 Ranged", "99 Strength", "1 Defence", "Ava's Accumulator"],
        },
    },
    {
        name: "GMaul Pure - 50 Attack",
        price: 180.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.PURE,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1100,
            combatLevel: 70,
            questPoints: 40,
            description: "Classic granite maul pure with 50 attack.",
            highlights: ["50 Attack", "90+ Strength", "1 Defence", "Mith Gloves"],
        },
    },
    {
        name: "Range Tank Pure - 75 Defence",
        price: 220.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.PURE,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1300,
            combatLevel: 95,
            questPoints: 100,
            description: "Range tank build with 75 defence and 99 ranged.",
            highlights: ["99 Ranged", "75 Defence", "Rigour Ready", "Serpentine Helm"],
        },
    },

    // ACCOUNTS (general/other) (2)
    {
        name: "Skiller Account - Level 3",
        price: 250.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.ACCOUNTS,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1800,
            combatLevel: 3,
            questPoints: 50,
            description: "Level 3 skiller with multiple 99s in non-combat skills.",
            highlights: ["Level 3 Combat", "99 Cooking", "99 Firemaking", "99 Woodcutting"],
        },
    },
    {
        name: "Quest Ready Account",
        price: 120.00,
        quantity: 1,
        source: "Demo",
        category: AccountCategory.ACCOUNTS,
        status: AccountStatus.IN_STOCK,
        accountData: {
            totalLevel: 1000,
            combatLevel: 70,
            questPoints: 0,
            description: "Fresh account with stats ready for efficient questing.",
            highlights: ["Base 50s", "Members Ready", "Tutorial Complete"],
        },
    },
];

async function seedDemoAccounts() {
    logger.info("Starting demo accounts seeding...");

    try {
        // Check if demo accounts already exist
        const existingDemo = await prisma.account.findFirst({
            where: { source: "Demo" },
        });

        if (existingDemo) {
            logger.warn("Demo accounts already exist. Do you want to delete and recreate? Deleting existing demo accounts...");

            // Delete existing demo accounts
            const deleted = await prisma.account.deleteMany({
                where: { source: "Demo" },
            });
            logger.info(`Deleted ${deleted.count} existing demo accounts`);
        }

        // Create demo accounts
        let createdCount = 0;
        for (const accountData of demoAccounts) {
            const account = await prisma.account.create({
                data: accountData,
            });
            logger.info(`Created account: ${account.name} (${account.category}) - $${account.price}`);
            createdCount++;
        }

        logger.info(`\n========================================`);
        logger.info(`Successfully created ${createdCount} demo accounts!`);
        logger.info(`========================================`);

        // Summary by category
        const summary = demoAccounts.reduce((acc, account) => {
            acc[account.category] = (acc[account.category] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        logger.info("\nAccounts by category:");
        for (const [category, count] of Object.entries(summary)) {
            logger.info(`  ${category}: ${count} accounts`);
        }

    } catch (error) {
        logger.error("Error seeding demo accounts:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
seedDemoAccounts()
    .then(() => {
        logger.info("\nDemo accounts seeding completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        logger.error("Failed to seed demo accounts:", error);
        process.exit(1);
    });
