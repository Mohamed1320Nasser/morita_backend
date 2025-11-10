#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import logger from "../common/loggers";

const prisma = new PrismaClient();

// Service Categories Data
const categories = [
    {
        name: "Megascale",
        slug: "megascale",
        emoji: "🌟",
        description: "High-value rare items and megascale services",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=🌟",
        displayOrder: 1,
    },
    {
        name: "Capes & Quiver",
        slug: "capes-quiver",
        emoji: "🏹",
        description: "Fire Cape, Infernal Cape, Ava's Assembler, and more",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=🏹",
        displayOrder: 2,
    },
    {
        name: "Blood Torva",
        slug: "blood-torva",
        emoji: "🩸",
        description: "High-tier PvM armor sets and equipment",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=🩸",
        displayOrder: 3,
    },
    {
        name: "Raids",
        slug: "raids",
        emoji: "🐉",
        description: "Chambers of Xeric, Theatre of Blood, Tombs of Amascut",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=🐉",
        displayOrder: 4,
    },
    {
        name: "Bossing",
        slug: "bossing",
        emoji: "⚔️",
        description: "Boss kill counts, pets, and bossing services",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=⚔️",
        displayOrder: 5,
    },
    {
        name: "Combat Achievements",
        slug: "combat-achievements",
        emoji: "⚡",
        description: "Combat Achievement Diaries and tasks",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=⚡",
        displayOrder: 6,
    },
    {
        name: "Accounts Bundle",
        slug: "accounts-bundle",
        emoji: "🏃",
        description: "Pre-built accounts and account packages",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=🏃",
        displayOrder: 7,
    },
    {
        name: "Quests/Diaries/Misc",
        slug: "quests-diaries-misc",
        emoji: "📜",
        description:
            "Quest completion, achievement diaries, and miscellaneous services",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=📜",
        displayOrder: 8,
    },
    {
        name: "Minigames",
        slug: "minigames",
        emoji: "🎮",
        description: "Barrows, Pest Control, Castle Wars, and other minigames",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=🎮",
        displayOrder: 9,
    },
    {
        name: "Ironman Gathering",
        slug: "ironman-gathering",
        emoji: "⛓️",
        description: "Resource gathering and ironman-specific services",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=⛓️",
        displayOrder: 10,
    },
    {
        name: "Skills",
        slug: "skills",
        emoji: "📊",
        description: "Skill leveling and training services",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=📊",
        displayOrder: 11,
    },
    {
        name: "Custom Services",
        slug: "custom-services",
        emoji: "🎯",
        description: "Tailored services and custom requests",
        icon: "https://via.placeholder.com/64x64/c9a961/1a2744?text=🎯",
        displayOrder: 12,
    },
];

// Services Data
const services = [
    // Megascale Services
    {
        name: "Tbow Megascale",
        slug: "tbow-megascale",
        description: "Twisted Bow megascale service with guaranteed completion",
        basePrice: 2500,
        pricingUnit: "FIXED",
        categorySlug: "megascale",
        displayOrder: 1,
    },
    {
        name: "Scythe Megascale",
        slug: "scythe-megascale",
        description: "Scythe of Vitur megascale service",
        basePrice: 1800,
        pricingUnit: "FIXED",
        categorySlug: "megascale",
        displayOrder: 2,
    },
    {
        name: "Ely Megascale",
        slug: "ely-megascale",
        description: "Elysian Spirit Shield megascale service",
        basePrice: 1200,
        pricingUnit: "FIXED",
        categorySlug: "megascale",
        displayOrder: 3,
    },

    // Capes & Quiver Services
    {
        name: "Infernal Cape",
        slug: "infernal-cape",
        description: "Infernal Cape service with guaranteed completion",
        basePrice: 150,
        pricingUnit: "FIXED",
        categorySlug: "capes-quiver",
        displayOrder: 1,
    },
    {
        name: "Fire Cape",
        slug: "fire-cape",
        description: "Fire Cape service for all combat levels",
        basePrice: 25,
        pricingUnit: "FIXED",
        categorySlug: "capes-quiver",
        displayOrder: 2,
    },
    {
        name: "Ava's Assembler",
        slug: "avas-assembler",
        description: "Ava's Assembler quest completion service",
        basePrice: 40,
        pricingUnit: "FIXED",
        categorySlug: "capes-quiver",
        displayOrder: 3,
    },

    // Blood Torva Services
    {
        name: "Blood Torva Set",
        slug: "blood-torva-set",
        description: "Complete Blood Torva armor set service",
        basePrice: 800,
        pricingUnit: "FIXED",
        categorySlug: "blood-torva",
        displayOrder: 1,
    },
    {
        name: "Blood Torva Helm",
        slug: "blood-torva-helm",
        description: "Blood Torva Helm individual piece",
        basePrice: 200,
        pricingUnit: "FIXED",
        categorySlug: "blood-torva",
        displayOrder: 2,
    },

    // Raids Services
    {
        name: "Chambers of Xeric (COX)",
        slug: "cox-completion",
        description: "Chambers of Xeric completion service",
        basePrice: 80,
        pricingUnit: "FIXED",
        categorySlug: "raids",
        displayOrder: 1,
    },
    {
        name: "Theatre of Blood (TOB)",
        slug: "tob-completion",
        description: "Theatre of Blood completion service",
        basePrice: 120,
        pricingUnit: "FIXED",
        categorySlug: "raids",
        displayOrder: 2,
    },
    {
        name: "Tombs of Amascut (TOA)",
        slug: "toa-completion",
        description: "Tombs of Amascut completion service",
        basePrice: 100,
        pricingUnit: "FIXED",
        categorySlug: "raids",
        displayOrder: 3,
    },

    // Bossing Services
    {
        name: "Zulrah 100 KC",
        slug: "zulrah-100-kc",
        description: "Zulrah 100 kill count service",
        basePrice: 60,
        pricingUnit: "PER_KILL",
        categorySlug: "bossing",
        displayOrder: 1,
    },
    {
        name: "Vorkath 100 KC",
        slug: "vorkath-100-kc",
        description: "Vorkath 100 kill count service",
        basePrice: 50,
        pricingUnit: "PER_KILL",
        categorySlug: "bossing",
        displayOrder: 2,
    },
    {
        name: "Corporeal Beast 100 KC",
        slug: "corp-100-kc",
        description: "Corporeal Beast 100 kill count service",
        basePrice: 40,
        pricingUnit: "PER_KILL",
        categorySlug: "bossing",
        displayOrder: 3,
    },

    // Combat Achievements
    {
        name: "Combat Achievements Easy",
        slug: "ca-easy",
        description: "Easy Combat Achievement Diary completion",
        basePrice: 30,
        pricingUnit: "FIXED",
        categorySlug: "combat-achievements",
        displayOrder: 1,
    },
    {
        name: "Combat Achievements Medium",
        slug: "ca-medium",
        description: "Medium Combat Achievement Diary completion",
        basePrice: 60,
        pricingUnit: "FIXED",
        categorySlug: "combat-achievements",
        displayOrder: 2,
    },
    {
        name: "Combat Achievements Hard",
        slug: "ca-hard",
        description: "Hard Combat Achievement Diary completion",
        basePrice: 120,
        pricingUnit: "FIXED",
        categorySlug: "combat-achievements",
        displayOrder: 3,
    },

    // Accounts Bundle
    {
        name: "Max Main Account",
        slug: "max-main-account",
        description: "Maxed main account with all 99s",
        basePrice: 2000,
        pricingUnit: "FIXED",
        categorySlug: "accounts-bundle",
        displayOrder: 1,
    },
    {
        name: "Quest Cape Account",
        slug: "quest-cape-account",
        description: "Account with Quest Cape and decent stats",
        basePrice: 500,
        pricingUnit: "FIXED",
        categorySlug: "accounts-bundle",
        displayOrder: 2,
    },
    {
        name: "PvP Ready Account",
        slug: "pvp-ready-account",
        description: "PvP ready account with optimal stats",
        basePrice: 300,
        pricingUnit: "FIXED",
        categorySlug: "accounts-bundle",
        displayOrder: 3,
    },

    // Quests/Diaries/Misc
    {
        name: "Quest Cape",
        slug: "quest-cape",
        description: "Quest Cape completion service",
        basePrice: 200,
        pricingUnit: "FIXED",
        categorySlug: "quests-diaries-misc",
        displayOrder: 1,
    },
    {
        name: "Achievement Diary Cape",
        slug: "achievement-diary-cape",
        description: "Achievement Diary Cape completion service",
        basePrice: 400,
        pricingUnit: "FIXED",
        categorySlug: "quests-diaries-misc",
        displayOrder: 2,
    },
    {
        name: "Music Cape",
        slug: "music-cape",
        description: "Music Cape completion service",
        basePrice: 150,
        pricingUnit: "FIXED",
        categorySlug: "quests-diaries-misc",
        displayOrder: 3,
    },

    // Minigames
    {
        name: "Barrows 100 KC",
        slug: "barrows-100-kc",
        description: "Barrows 100 kill count service",
        basePrice: 30,
        pricingUnit: "PER_KILL",
        categorySlug: "minigames",
        displayOrder: 1,
    },
    {
        name: "Pest Control 100 Games",
        slug: "pest-control-100-games",
        description: "Pest Control 100 games service",
        basePrice: 25,
        pricingUnit: "PER_ITEM",
        categorySlug: "minigames",
        displayOrder: 2,
    },
    {
        name: "Castle Wars 100 Games",
        slug: "castle-wars-100-games",
        description: "Castle Wars 100 games service",
        basePrice: 20,
        pricingUnit: "PER_ITEM",
        categorySlug: "minigames",
        displayOrder: 3,
    },

    // Ironman Gathering
    {
        name: "99 Mining (Ironman)",
        slug: "99-mining-ironman",
        description: "99 Mining training for ironman accounts",
        basePrice: 300,
        pricingUnit: "PER_LEVEL",
        categorySlug: "ironman-gathering",
        displayOrder: 1,
    },
    {
        name: "99 Woodcutting (Ironman)",
        slug: "99-woodcutting-ironman",
        description: "99 Woodcutting training for ironman accounts",
        basePrice: 250,
        pricingUnit: "PER_LEVEL",
        categorySlug: "ironman-gathering",
        displayOrder: 2,
    },
    {
        name: "99 Fishing (Ironman)",
        slug: "99-fishing-ironman",
        description: "99 Fishing training for ironman accounts",
        basePrice: 280,
        pricingUnit: "PER_LEVEL",
        categorySlug: "ironman-gathering",
        displayOrder: 3,
    },

    // Skills
    {
        name: "99 Firemaking",
        slug: "99-firemaking",
        description: "99 Firemaking training service",
        basePrice: 80,
        pricingUnit: "PER_LEVEL",
        categorySlug: "skills",
        displayOrder: 1,
    },
    {
        name: "99 Cooking",
        slug: "99-cooking",
        description: "99 Cooking training service",
        basePrice: 60,
        pricingUnit: "PER_LEVEL",
        categorySlug: "skills",
        displayOrder: 2,
    },
    {
        name: "99 Fletching",
        slug: "99-fletching",
        description: "99 Fletching training service",
        basePrice: 70,
        pricingUnit: "PER_LEVEL",
        categorySlug: "skills",
        displayOrder: 3,
    },

    // Custom Services
    {
        name: "Custom Service",
        slug: "custom-service",
        description: "Tailored service based on your specific requirements",
        basePrice: 100,
        pricingUnit: "FIXED",
        categorySlug: "custom-services",
        displayOrder: 1,
    },
];

// Pricing Methods Data
const pricingMethods = [
    // Megascale pricing methods
    {
        name: "Standard Megascale",
        basePrice: 2500,
        pricingUnit: "FIXED",
        serviceSlug: "tbow-megascale",
    },
    {
        name: "Express Megascale",
        basePrice: 3000,
        pricingUnit: "FIXED",
        serviceSlug: "tbow-megascale",
    },
    {
        name: "VIP Megascale",
        basePrice: 3500,
        pricingUnit: "FIXED",
        serviceSlug: "tbow-megascale",
    },

    // Capes pricing methods
    {
        name: "Standard Infernal Cape",
        basePrice: 150,
        pricingUnit: "FIXED",
        serviceSlug: "infernal-cape",
    },
    {
        name: "Express Infernal Cape",
        basePrice: 200,
        pricingUnit: "FIXED",
        serviceSlug: "infernal-cape",
    },
    {
        name: "Fire Cape Standard",
        basePrice: 25,
        pricingUnit: "FIXED",
        serviceSlug: "fire-cape",
    },
    {
        name: "Fire Cape Express",
        basePrice: 35,
        pricingUnit: "FIXED",
        serviceSlug: "fire-cape",
    },

    // Skills pricing methods
    {
        name: "99 Firemaking Standard",
        basePrice: 80,
        pricingUnit: "PER_LEVEL",
        serviceSlug: "99-firemaking",
    },
    {
        name: "99 Firemaking Express",
        basePrice: 100,
        pricingUnit: "PER_LEVEL",
        serviceSlug: "99-firemaking",
    },
    {
        name: "99 Cooking Standard",
        basePrice: 60,
        pricingUnit: "PER_LEVEL",
        serviceSlug: "99-cooking",
    },
    {
        name: "99 Cooking Express",
        basePrice: 75,
        pricingUnit: "PER_LEVEL",
        serviceSlug: "99-cooking",
    },

    // Bossing pricing methods
    {
        name: "Zulrah 100 KC Standard",
        basePrice: 60,
        pricingUnit: "PER_KILL",
        serviceSlug: "zulrah-100-kc",
    },
    {
        name: "Zulrah 100 KC Express",
        basePrice: 80,
        pricingUnit: "PER_KILL",
        serviceSlug: "zulrah-100-kc",
    },
    {
        name: "Vorkath 100 KC Standard",
        basePrice: 50,
        pricingUnit: "PER_KILL",
        serviceSlug: "vorkath-100-kc",
    },
    {
        name: "Vorkath 100 KC Express",
        basePrice: 65,
        pricingUnit: "PER_KILL",
        serviceSlug: "vorkath-100-kc",
    },

    // Raids pricing methods
    {
        name: "COX Standard",
        basePrice: 80,
        pricingUnit: "FIXED",
        serviceSlug: "cox-completion",
    },
    {
        name: "COX Express",
        basePrice: 100,
        pricingUnit: "FIXED",
        serviceSlug: "cox-completion",
    },
    {
        name: "TOB Standard",
        basePrice: 120,
        pricingUnit: "FIXED",
        serviceSlug: "tob-completion",
    },
    {
        name: "TOB Express",
        basePrice: 150,
        pricingUnit: "FIXED",
        serviceSlug: "tob-completion",
    },
    {
        name: "TOA Standard",
        basePrice: 100,
        pricingUnit: "FIXED",
        serviceSlug: "toa-completion",
    },
    {
        name: "TOA Express",
        basePrice: 125,
        pricingUnit: "FIXED",
        serviceSlug: "toa-completion",
    },
];

// Pricing Modifiers Data
const pricingModifiers = [
    {
        name: "Express Service",
        modifierType: "PERCENTAGE",
        value: 25,
        condition: "Express delivery within 24-48 hours",
    },
    {
        name: "VIP Member",
        modifierType: "PERCENTAGE",
        value: -10,
        condition: "VIP membership discount",
    },
    {
        name: "Bulk Order 10+",
        modifierType: "PERCENTAGE",
        value: -15,
        condition: "Order 10 or more services",
    },
    {
        name: "Weekend Rush",
        modifierType: "PERCENTAGE",
        value: 30,
        condition: "Weekend delivery (Friday-Sunday)",
    },
    {
        name: "Streamer Discount",
        modifierType: "PERCENTAGE",
        value: -20,
        condition: "Content creator discount",
    },
    {
        name: "First Order Bonus",
        modifierType: "PERCENTAGE",
        value: -5,
        condition: "First-time customer discount",
    },
    {
        name: "Loyalty Discount",
        modifierType: "PERCENTAGE",
        value: -8,
        condition: "Returning customer (5+ orders)",
    },
    {
        name: "Holiday Special",
        modifierType: "PERCENTAGE",
        value: -12,
        condition: "Holiday season discount",
    },
    {
        name: "Group Order",
        modifierType: "PERCENTAGE",
        value: -18,
        condition: "Group order with 3+ people",
    },
    {
        name: "Premium Support",
        modifierType: "FIXED",
        value: 50,
        condition: "24/7 premium support included",
    },
    {
        name: "Priority Queue",
        modifierType: "FIXED",
        value: 25,
        condition: "Skip the queue for faster processing",
    },
    {
        name: "Guarantee Fee",
        modifierType: "FIXED",
        value: 100,
        condition: "100% completion guarantee",
    },
    {
        name: "Streaming Service",
        modifierType: "FIXED",
        value: 75,
        condition: "Live streaming of service progress",
    },
    {
        name: "Account Security",
        modifierType: "FIXED",
        value: 30,
        condition: "Enhanced account security measures",
    },
    {
        name: "Progress Updates",
        modifierType: "FIXED",
        value: 20,
        condition: "Daily progress updates and screenshots",
    },
];

// Payment Methods Data
const paymentMethods = [
    {
        name: "Bitcoin",
        type: "CRYPTO",
        active: true,
    },
    {
        name: "Ethereum",
        type: "CRYPTO",
        active: true,
    },
    {
        name: "OSRS Gold",
        type: "CRYPTO",
        active: true,
    },
    {
        name: "PayPal",
        type: "NON_CRYPTO",
        active: true,
    },
    {
        name: "Bank Transfer",
        type: "NON_CRYPTO",
        active: true,
    },
    {
        name: "Credit Card",
        type: "NON_CRYPTO",
        active: true,
    },
    {
        name: "Cryptocurrency Other",
        type: "CRYPTO",
        active: true,
    },
];

// Payment Method Prices Data
const paymentMethodPrices = [
    // Bitcoin prices
    { paymentMethodName: "Bitcoin", basePrice: 0, modifier: -5 },
    { paymentMethodName: "Bitcoin", basePrice: 100, modifier: -5 },
    { paymentMethodName: "Bitcoin", basePrice: 500, modifier: -5 },
    { paymentMethodName: "Bitcoin", basePrice: 1000, modifier: -5 },
    { paymentMethodName: "Bitcoin", basePrice: 2000, modifier: -5 },

    // Ethereum prices
    { paymentMethodName: "Ethereum", basePrice: 0, modifier: -5 },
    { paymentMethodName: "Ethereum", basePrice: 100, modifier: -5 },
    { paymentMethodName: "Ethereum", basePrice: 500, modifier: -5 },
    { paymentMethodName: "Ethereum", basePrice: 1000, modifier: -5 },
    { paymentMethodName: "Ethereum", basePrice: 2000, modifier: -5 },

    // OSRS Gold prices
    { paymentMethodName: "OSRS Gold", basePrice: 0, modifier: -10 },
    { paymentMethodName: "OSRS Gold", basePrice: 100, modifier: -10 },
    { paymentMethodName: "OSRS Gold", basePrice: 500, modifier: -10 },
    { paymentMethodName: "OSRS Gold", basePrice: 1000, modifier: -10 },
    { paymentMethodName: "OSRS Gold", basePrice: 2000, modifier: -10 },

    // PayPal prices
    { paymentMethodName: "PayPal", basePrice: 0, modifier: 0 },
    { paymentMethodName: "PayPal", basePrice: 100, modifier: 0 },
    { paymentMethodName: "PayPal", basePrice: 500, modifier: 0 },
    { paymentMethodName: "PayPal", basePrice: 1000, modifier: 0 },
    { paymentMethodName: "PayPal", basePrice: 2000, modifier: 0 },

    // Bank Transfer prices
    { paymentMethodName: "Bank Transfer", basePrice: 0, modifier: 0 },
    { paymentMethodName: "Bank Transfer", basePrice: 100, modifier: 0 },
    { paymentMethodName: "Bank Transfer", basePrice: 500, modifier: 0 },
    { paymentMethodName: "Bank Transfer", basePrice: 1000, modifier: 0 },
    { paymentMethodName: "Bank Transfer", basePrice: 2000, modifier: 0 },

    // Credit Card prices
    { paymentMethodName: "Credit Card", basePrice: 0, modifier: 3 },
    { paymentMethodName: "Credit Card", basePrice: 100, modifier: 3 },
    { paymentMethodName: "Credit Card", basePrice: 500, modifier: 3 },
    { paymentMethodName: "Credit Card", basePrice: 1000, modifier: 3 },
    { paymentMethodName: "Credit Card", basePrice: 2000, modifier: 3 },

    // Other Crypto prices
    { paymentMethodName: "Cryptocurrency Other", basePrice: 0, modifier: -3 },
    { paymentMethodName: "Cryptocurrency Other", basePrice: 100, modifier: -3 },
    { paymentMethodName: "Cryptocurrency Other", basePrice: 500, modifier: -3 },
    {
        paymentMethodName: "Cryptocurrency Other",
        basePrice: 1000,
        modifier: -3,
    },
    {
        paymentMethodName: "Cryptocurrency Other",
        basePrice: 2000,
        modifier: -3,
    },
];

async function clearExistingData() {
    logger.info("Clearing existing data...");

    // Delete in reverse order of dependencies
    await prisma.methodPrice.deleteMany();
    await prisma.pricingModifier.deleteMany();
    await prisma.pricingMethod.deleteMany();
    await prisma.service.deleteMany();
    await prisma.serviceCategory.deleteMany();
    await prisma.paymentMethod.deleteMany();

    logger.info("Existing data cleared successfully");
}

async function seedCategories() {
    logger.info("Seeding service categories...");

    for (const category of categories) {
        await prisma.serviceCategory.create({
            data: {
                name: category.name,
                slug: category.slug,
                emoji: category.emoji,
                description: category.description,
                displayOrder: category.displayOrder,
                active: true,
            },
        });
    }

    logger.info(`Created ${categories.length} service categories`);
}

async function seedServices() {
    logger.info("Seeding services...");

    for (const service of services) {
        const category = await prisma.serviceCategory.findUnique({
            where: { slug: service.categorySlug },
        });

        if (!category) {
            logger.warn(`Category not found for service: ${service.name}`);
            continue;
        }

        await prisma.service.create({
            data: {
                name: service.name,
                slug: service.slug,
                description: service.description,
                categoryId: category.id,
                displayOrder: service.displayOrder,
                active: true,
            },
        });
    }

    logger.info(`Created ${services.length} services`);
}

async function seedPricingMethods() {
    logger.info("Seeding pricing methods...");

    for (const method of pricingMethods) {
        const service = await prisma.service.findFirst({
            where: { slug: method.serviceSlug },
        });

        if (!service) {
            logger.warn(`Service not found for pricing method: ${method.name}`);
            continue;
        }

        await prisma.pricingMethod.create({
            data: {
                name: method.name,
                basePrice: method.basePrice,
                pricingUnit: method.pricingUnit as any,
                serviceId: service.id,
                active: true,
            },
        });
    }

    logger.info(`Created ${pricingMethods.length} pricing methods`);
}

async function seedPricingModifiers() {
    logger.info("Seeding pricing modifiers...");

    // Get all pricing methods to associate modifiers with
    const pricingMethods = await prisma.pricingMethod.findMany();

    for (const method of pricingMethods) {
        // Create a few common modifiers for each pricing method
        const commonModifiers = [
            {
                name: "Express Service",
                modifierType: "PERCENTAGE" as const,
                value: 25,
                condition: "Express delivery within 24-48 hours",
            },
            {
                name: "VIP Member",
                modifierType: "PERCENTAGE" as const,
                value: -10,
                condition: "VIP membership discount",
            },
            {
                name: "Bulk Order 10+",
                modifierType: "PERCENTAGE" as const,
                value: -15,
                condition: "Order 10 or more services",
            },
        ];

        for (const modifier of commonModifiers) {
            await prisma.pricingModifier.create({
                data: {
                    name: modifier.name,
                    modifierType: modifier.modifierType,
                    value: modifier.value,
                    condition: modifier.condition,
                    methodId: method.id,
                    active: true,
                },
            });
        }
    }

    logger.info(
        `Created pricing modifiers for ${pricingMethods.length} pricing methods`
    );
}

async function seedPaymentMethods() {
    logger.info("Seeding payment methods...");

    for (const method of paymentMethods) {
        await prisma.paymentMethod.create({
            data: {
                name: method.name,
                type: method.type as any,
                active: method.active,
            },
        });
    }

    logger.info(`Created ${paymentMethods.length} payment methods`);
}

async function seedPaymentMethodPrices() {
    logger.info("Seeding payment method prices...");

    for (const price of paymentMethodPrices) {
        const paymentMethod = await prisma.paymentMethod.findFirst({
            where: { name: price.paymentMethodName },
        });

        if (!paymentMethod) {
            logger.warn(`Payment method not found: ${price.paymentMethodName}`);
            continue;
        }

        // Note: MethodPrice requires both methodId and paymentMethodId
        // For now, we'll skip this as it requires pricing method relationships
        // This can be implemented later when needed
        logger.info(
            `Skipping payment method price for ${price.paymentMethodName} - requires pricing method relationships`
        );
    }

    logger.info(`Created ${paymentMethodPrices.length} payment method prices`);
}

async function main() {
    try {
        logger.info("Starting gaming services seed data script...");

        // Ask for confirmation before clearing data
        const readline = require("readline");
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const answer = await new Promise<string>(resolve => {
            rl.question(
                "This will clear all existing gaming data. Continue? (y/N): ",
                resolve
            );
        });

        rl.close();

        if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
            logger.info("Seed script cancelled by user");
            return;
        }

        // Clear existing data
        await clearExistingData();

        // Seed data in order
        await seedCategories();
        await seedServices();
        await seedPricingMethods();
        await seedPricingModifiers();
        await seedPaymentMethods();
        await seedPaymentMethodPrices();

        logger.info("✅ Gaming services seed data created successfully!");
        logger.info("Summary:");
        logger.info(`- ${categories.length} service categories`);
        logger.info(`- ${services.length} services`);
        logger.info(`- ${pricingMethods.length} pricing methods`);
        logger.info(`- ${pricingModifiers.length} pricing modifiers`);
        logger.info(`- ${paymentMethods.length} payment methods`);
        logger.info(`- ${paymentMethodPrices.length} payment method prices`);
    } catch (error) {
        logger.error("Error seeding gaming services data:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        logger.error("Seed script failed:", error);
        process.exit(1);
    });
}

export default main;
