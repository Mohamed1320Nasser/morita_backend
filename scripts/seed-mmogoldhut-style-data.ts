/**
 * MMOGoldHut-Style Data Seeding Script
 *
 * This script recreates pricing data matching the old MMOGoldHut system.
 * It includes ALL pricing types, modifiers, and edge cases to showcase
 * the full capabilities of the enhanced pricing system in both Discord and Admin Panel.
 *
 * Features:
 * - Level-based pricing (e.g., Agility 1-40, 40-50)
 * - Multiple pricing tiers (e.g., Main/Zerker/Pure accounts)
 * - Upcharge modifiers (red highlights)
 * - Note modifiers (green highlights)
 * - Warning modifiers (yellow highlights)
 * - All pricing units (FIXED, PER_LEVEL, PER_HOUR, PER_KILL, PER_ITEM)
 *
 * Usage:
 *   # Fresh start (clears existing data)
 *   npx ts-node scripts/seed-mmogoldhut-style-data.ts --clean
 *
 *   # Add to existing data
 *   npx ts-node scripts/seed-mmogoldhut-style-data.ts
 */

import {
    PrismaClient,
    PricingUnit,
    ModifierDisplayType,
    ServiceCategory,
} from "@prisma/client";

const prisma = new PrismaClient();

// Configuration
const CLEAN_EXISTING_DATA = process.argv.includes("--clean");

// Helper function to create categories
async function createCategories() {
    console.log("\n📦 Creating Service Categories...\n");

    const categories = [
        {
            name: "Skills",
            slug: "skills",
            emoji: "⚔️",
            description: "OSRS skill training services with optimal methods",
            displayOrder: 1,
        },
        {
            name: "Minigames",
            slug: "minigames",
            emoji: "🎮",
            description: "Professional minigame completion services",
            displayOrder: 2,
        },
        {
            name: "Quests",
            slug: "quests",
            emoji: "📜",
            description: "Quest completion and progression services",
            displayOrder: 3,
        },
        {
            name: "Bossing",
            slug: "bossing",
            emoji: "💀",
            description: "Boss killing and pet hunting services",
            displayOrder: 4,
        },
        {
            name: "Gold",
            slug: "gold",
            emoji: "💰",
            description: "OSRS Gold buying and selling",
            displayOrder: 5,
        },
    ];

    const created: ServiceCategory[] = [];
    for (const cat of categories as ServiceCategory[]) {
        const category = await prisma.serviceCategory.upsert({
            where: { slug: cat.slug },
            update: {},
            create: cat,
        });
        created.push(category as never);
        console.log(`  ✓ ${cat.emoji} ${cat.name}`);
    }

    console.log(`\n✅ Created ${created.length} categories\n`);
    return created;
}

// Helper function to create services with pricing
async function seedSkillsCategory(categoryId: string) {
    console.log("⚔️  Seeding Skills Category...\n");

    // ==========================================
    // 1. Agility (Level-based pricing)
    // ==========================================
    console.log("  🏃 Creating Agility service...");
    const agility = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "agility",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "Agility",
            slug: "agility",
            emoji: "🏃",
            description:
                "Professional Agility training using optimal rooftop courses. Fast leveling with marks of grace collection included.",
            active: true,
            displayOrder: 1,
        },
    });

    // Agility pricing tiers - Each rooftop course gets its own section
    const agilityMethods = [
        {
            name: "Agility",
            startLevel: 1,
            endLevel: 40,
            basePrice: 0.00007,
            order: 1,
        },
        {
            name: "Canifis Rooftop",
            startLevel: 40,
            endLevel: 50,
            basePrice: 0.000054,
            order: 2,
        },
        {
            name: "Falador Rooftop",
            startLevel: 50,
            endLevel: 60,
            basePrice: 0.000045,
            order: 3,
        },
        {
            name: "Seers Rooftop With Diary",
            startLevel: 60,
            endLevel: 90,
            basePrice: 0.00002,
            order: 4,
        },
        {
            name: "Seers Rooftop Without Diary",
            startLevel: 60,
            endLevel: 90,
            basePrice: 0.000023,
            order: 5,
        },
        {
            name: "Rellekka Rooftop",
            startLevel: 80,
            endLevel: 99,
            basePrice: 0.000024,
            order: 6,
        },
        {
            name: "Ardougne Rooftop",
            startLevel: 90,
            endLevel: 99,
            basePrice: 0.00002,
            order: 7,
        },
        {
            name: "Wilderness",
            startLevel: 52,
            endLevel: 60,
            basePrice: 0.00002,
            order: 8,
        },
    ];

    const agilityMethodIds = [];
    for (const method of agilityMethods) {
        const created = await prisma.pricingMethod.create({
            data: {
                serviceId: agility.id,
                name: method.name,
                basePrice: method.basePrice,
                pricingUnit: "PER_LEVEL" as PricingUnit,
                startLevel: method.startLevel,
                endLevel: method.endLevel,
                displayOrder: method.order,
                active: true,
            },
        });
        agilityMethodIds.push(created.id as never);
    }

    // Add note about Marks of Grace (like old system)
    await prisma.pricingModifier.create({
        data: {
            methodId: agilityMethodIds[0], // Add to first method
            name: "If you ordered Agility XP, you will keep any Marks of Grace obtained. If you only want Marks of Grace, they are $0.12 each.",
            modifierType: "PERCENTAGE",
            value: 0,
            displayType: "NOTE" as ModifierDisplayType,
            priority: 1,
            active: true,
        },
    });

    console.log(
        `    ✓ Created ${agilityMethods.length} rooftop course pricing methods with Marks of Grace note`
    );

    // ==========================================
    // 2. Runecrafting (Multiple tiers + upcharges)
    // ==========================================
    console.log("  🔮 Creating Runecrafting service...");
    const runecrafting = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "runecrafting",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "Runecrafting",
            slug: "runecrafting",
            emoji: "🔮",
            description:
                "Runecrafting training through various methods including ZMI, Lavas, and Bloods.",
            active: true,
            displayOrder: 2,
        },
    });

    const rcMethods = [
        {
            name: "ZMI Altar (No requirements)",
            startLevel: 1,
            endLevel: 77,
            basePrice: 0.00013,
            order: 1,
        },
        {
            name: "Lava Runes (Fast XP)",
            startLevel: 23,
            endLevel: 99,
            basePrice: 0.00018,
            order: 2,
        },
        {
            name: "Blood Runes (77-99 AFK)",
            startLevel: 77,
            endLevel: 99,
            basePrice: 0.00008,
            order: 3,
        },
    ];

    const rcMethodIds = [];
    for (const method of rcMethods) {
        const created = await prisma.pricingMethod.create({
            data: {
                serviceId: runecrafting.id,
                name: method.name,
                basePrice: method.basePrice,
                pricingUnit: "PER_LEVEL" as PricingUnit,
                startLevel: method.startLevel,
                endLevel: method.endLevel,
                displayOrder: method.order,
                active: true,
            },
        });
        rcMethodIds.push(created.id);
    }

    // Add upcharges to Lava Runes
    await prisma.pricingModifier.create({
        data: {
            methodId: rcMethodIds[1], // Lava Runes
            name: "+25% if no Graceful outfit",
            modifierType: "PERCENTAGE",
            value: 25,
            displayType: "UPCHARGE" as ModifierDisplayType,
            priority: 10,
            active: true,
        },
    });

    await prisma.pricingModifier.create({
        data: {
            methodId: rcMethodIds[1], // Lava Runes
            name: "+15% if Magic level below 82",
            modifierType: "PERCENTAGE",
            value: 15,
            displayType: "UPCHARGE" as ModifierDisplayType,
            priority: 11,
            active: true,
        },
    });

    // Add notes
    await prisma.pricingModifier.create({
        data: {
            methodId: rcMethodIds[1], // Lava Runes
            name: "Requires 82 Magic for optimal rates",
            modifierType: "PERCENTAGE",
            value: 0,
            displayType: "NOTE" as ModifierDisplayType,
            priority: 20,
            active: true,
        },
    });

    console.log(
        `    ✓ Created ${rcMethods.length} methods with upcharges and notes`
    );

    // ==========================================
    // 3. Smithing (Fixed price + warning)
    // ==========================================
    console.log("  🔨 Creating Smithing service...");
    const smithing = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "smithing",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "Smithing",
            slug: "smithing",
            emoji: "🔨",
            description:
                "Smithing training through gold bar smelting. Fast and AFK-friendly method.",
            active: true,
            displayOrder: 3,
        },
    });

    const smithingMethod = await prisma.pricingMethod.create({
        data: {
            serviceId: smithing.id,
            name: "Gold Bar Smithing (1-99)",
            basePrice: 150,
            pricingUnit: "FIXED" as PricingUnit,
            displayOrder: 1,
            active: true,
        },
    });

    await prisma.pricingModifier.create({
        data: {
            methodId: smithingMethod.id,
            name: "⚠️ Materials NOT included - you must provide gold bars",
            modifierType: "PERCENTAGE",
            value: 0,
            displayType: "WARNING" as ModifierDisplayType,
            priority: 1,
            active: true,
        },
    });

    console.log("    ✓ Created fixed price method with warning\n");
}

async function seedMinigamesCategory(categoryId: string) {
    console.log("🎮 Seeding Minigames Category...\n");

    // ==========================================
    // 1. Fire Cape (Multiple tiers + upcharges + notes)
    // ==========================================
    console.log("  🔥 Creating Fire Cape service...");
    const fireCape = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "fire-cape",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "Fire Cape",
            slug: "fire-cape",
            emoji: "🔥",
            description:
                "Professional Fire Cape service with Parsec/VPN options. Guaranteed completion or money back.",
            active: true,
            displayOrder: 1,
        },
    });

    const fireCapeTiers = [
        { name: "Main Accounts - Parsec", basePrice: 360, order: 1 },
        { name: "Main Accounts - VPN", basePrice: 200, order: 2 },
        { name: "Zerker Accounts - Parsec", basePrice: 400, order: 3 },
        { name: "Zerker Accounts - VPN", basePrice: 275, order: 4 },
        { name: "Pure Accounts - Parsec", basePrice: 475, order: 5 },
        { name: "Pure Accounts - VPN", basePrice: 350, order: 6 },
    ];

    const fireCapeMethodIds = [];
    for (const tier of fireCapeTiers) {
        const created = await prisma.pricingMethod.create({
            data: {
                serviceId: fireCape.id,
                name: tier.name,
                basePrice: tier.basePrice,
                pricingUnit: "FIXED" as PricingUnit,
                displayOrder: tier.order,
                active: true,
            },
        });
        fireCapeMethodIds.push(created.id);
    }

    // Add upcharges (to first method, they'll be extracted globally)
    const upcharges = [
        { name: "+20M if you don't have Rigour", value: 20 },
        { name: "+50M if Magic level below 94", value: 50 },
        { name: "Ethernet cable required or +20M", value: 20 },
    ];

    for (const upcharge of upcharges) {
        await prisma.pricingModifier.create({
            data: {
                methodId: fireCapeMethodIds[0],
                name: upcharge.name,
                modifierType: "FIXED",
                value: upcharge.value,
                displayType: "UPCHARGE" as ModifierDisplayType,
                priority: 10,
                active: true,
            },
        });
    }

    // Add notes
    const notes = [
        "Cape will be done via PARSEC (remote desktop)",
        "VPN option available if connection is unstable",
        "Parsec available: EU, UK, AUS & US regions",
        "Task orders receive 15% automatic discount",
        "ETA: 1-3 hours depending on stats",
    ];

    for (const note of notes) {
        await prisma.pricingModifier.create({
            data: {
                methodId: fireCapeMethodIds[0],
                name: note,
                modifierType: "PERCENTAGE",
                value: 0,
                displayType: "NOTE" as ModifierDisplayType,
                priority: 20,
                active: true,
            },
        });
    }

    console.log(
        `    ✓ Created ${fireCapeTiers.length} tiers with ${upcharges.length} upcharges and ${notes.length} notes`
    );

    // ==========================================
    // 2. Infernal Cape (Premium pricing)
    // ==========================================
    console.log("  🌋 Creating Infernal Cape service...");
    const infernalCape = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "infernal-cape",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "Infernal Cape",
            slug: "infernal-cape",
            emoji: "🌋",
            description:
                "Expert Infernal Cape service. Our specialists have 100+ completions. Parsec only for security.",
            active: true,
            displayOrder: 2,
        },
    });

    const infernalTiers = [
        { name: "Main Accounts (Max Combat)", basePrice: 650, order: 1 },
        { name: "Main Accounts (75+ Def)", basePrice: 750, order: 2 },
        { name: "Zerker Accounts (45 Def)", basePrice: 850, order: 3 },
        { name: "Pure Accounts (1 Def)", basePrice: 1200, order: 4 },
    ];

    const infernalMethodIds = [];
    for (const tier of infernalTiers) {
        const created = await prisma.pricingMethod.create({
            data: {
                serviceId: infernalCape.id,
                name: tier.name,
                basePrice: tier.basePrice,
                pricingUnit: "FIXED" as PricingUnit,
                displayOrder: tier.order,
                active: true,
            },
        });
        infernalMethodIds.push(created.id);
    }

    // Upcharges
    await prisma.pricingModifier.create({
        data: {
            methodId: infernalMethodIds[0],
            name: "+100M if no Twisted Bow",
            modifierType: "FIXED",
            value: 100,
            displayType: "UPCHARGE" as ModifierDisplayType,
            priority: 10,
            active: true,
        },
    });

    await prisma.pricingModifier.create({
        data: {
            methodId: infernalMethodIds[0],
            name: "+50M if Ranged below 90",
            modifierType: "FIXED",
            value: 50,
            displayType: "UPCHARGE" as ModifierDisplayType,
            priority: 11,
            active: true,
        },
    });

    // Notes
    const infernalNotes = [
        "Parsec ONLY - no VPN option for security",
        "Account must have Rigour unlocked",
        "ETA: 3-6 hours depending on attempts",
        "Money back guarantee if not completed",
    ];

    for (const note of infernalNotes) {
        await prisma.pricingModifier.create({
            data: {
                methodId: infernalMethodIds[0],
                name: note,
                modifierType: "PERCENTAGE",
                value: 0,
                displayType: "NOTE" as ModifierDisplayType,
                priority: 20,
                active: true,
            },
        });
    }

    console.log(`    ✓ Created ${infernalTiers.length} premium tiers\n`);
}

async function seedQuestsCategory(categoryId: string) {
    console.log("📜 Seeding Quests Category...\n");

    // ==========================================
    // 1. Recipe for Disaster (Per-subquest pricing)
    // ==========================================
    console.log("  🍲 Creating Recipe for Disaster service...");
    const rfd = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "recipe-for-disaster",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "Recipe for Disaster",
            slug: "recipe-for-disaster",
            emoji: "🍲",
            description:
                "Complete all RFD subquests and unlock Barrows gloves. Prerequisites included.",
            active: true,
            displayOrder: 1,
        },
    });

    const rfdMethod = await prisma.pricingMethod.create({
        data: {
            serviceId: rfd.id,
            name: "Full RFD Completion",
            basePrice: 45,
            pricingUnit: "FIXED" as PricingUnit,
            displayOrder: 1,
            active: true,
        },
    });

    await prisma.pricingModifier.create({
        data: {
            methodId: rfdMethod.id,
            name: "+$15 if missing prerequisite quests",
            modifierType: "FIXED",
            value: 15,
            displayType: "UPCHARGE" as ModifierDisplayType,
            priority: 10,
            active: true,
        },
    });

    await prisma.pricingModifier.create({
        data: {
            methodId: rfdMethod.id,
            name: "All prerequisites will be completed",
            modifierType: "PERCENTAGE",
            value: 0,
            displayType: "NOTE" as ModifierDisplayType,
            priority: 20,
            active: true,
        },
    });

    console.log("    ✓ Created quest service with prerequisites\n");
}

async function seedBossingCategory(categoryId: string) {
    console.log("💀 Seeding Bossing Category...\n");

    // ==========================================
    // 1. Zulrah (Per-kill pricing)
    // ==========================================
    console.log("  🐍 Creating Zulrah service...");
    const zulrah = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "zulrah",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "Zulrah",
            slug: "zulrah",
            emoji: "🐍",
            description:
                "Zulrah kill service. Perfect for learning or grinding pet/uniques.",
            active: true,
            displayOrder: 1,
        },
    });

    const zulrahMethods = [
        { name: "Standard Kills (1-50)", basePrice: 2.5, order: 1 },
        { name: "Bulk Kills (51-100)", basePrice: 2.0, order: 2 },
        { name: "Mass Bulk (100+)", basePrice: 1.5, order: 3 },
    ];

    for (const method of zulrahMethods) {
        await prisma.pricingMethod.create({
            data: {
                serviceId: zulrah.id,
                name: method.name,
                basePrice: method.basePrice,
                pricingUnit: "PER_KILL" as PricingUnit,
                displayOrder: method.order,
                active: true,
            },
        });
    }

    console.log(`    ✓ Created ${zulrahMethods.length} per-kill pricing tiers`);

    // ==========================================
    // 2. CoX Raids (Per-hour + loot split)
    // ==========================================
    console.log("  ⚔️ Creating Chambers of Xeric service...");
    const cox = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "chambers-of-xeric",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "Chambers of Xeric",
            slug: "chambers-of-xeric",
            emoji: "⚔️",
            description:
                "CoX raid boosting service. Experienced raiders with fast completion times.",
            active: true,
            displayOrder: 2,
        },
    });

    const coxMethod = await prisma.pricingMethod.create({
        data: {
            serviceId: cox.id,
            name: "CoX Raids",
            basePrice: 25,
            pricingUnit: "PER_HOUR" as PricingUnit,
            displayOrder: 1,
            active: true,
        },
    });

    await prisma.pricingModifier.create({
        data: {
            methodId: coxMethod.id,
            name: "Loot goes to you (no split required)",
            modifierType: "PERCENTAGE",
            value: 0,
            displayType: "NOTE" as ModifierDisplayType,
            priority: 20,
            active: true,
        },
    });

    await prisma.pricingModifier.create({
        data: {
            methodId: coxMethod.id,
            name: "Average 3-4 raids per hour",
            modifierType: "PERCENTAGE",
            value: 0,
            displayType: "NOTE" as ModifierDisplayType,
            priority: 21,
            active: true,
        },
    });

    console.log("    ✓ Created hourly raid service\n");
}

async function seedGoldCategory(categoryId: string) {
    console.log("💰 Seeding Gold Category...\n");

    // ==========================================
    // 1. OSRS Gold Buying
    // ==========================================
    console.log("  💵 Creating OSRS Gold service...");
    const gold = await prisma.service.upsert({
        where: {
            categoryId_slug: {
                categoryId,
                slug: "osrs-gold",
            },
        },
        update: {},
        create: {
            categoryId,
            name: "OSRS Gold",
            slug: "osrs-gold",
            emoji: "💵",
            description:
                "Buy OSRS gold at competitive rates. Safe and fast delivery.",
            active: true,
            displayOrder: 1,
        },
    });

    const goldMethods = [
        { name: "Small Amounts (1-100M)", basePrice: 0.45, order: 1 },
        { name: "Medium Amounts (100-500M)", basePrice: 0.42, order: 2 },
        { name: "Large Amounts (500M-1B)", basePrice: 0.38, order: 3 },
        { name: "Bulk Orders (1B+)", basePrice: 0.35, order: 4 },
    ];

    const goldMethodIds = [];
    for (const method of goldMethods) {
        const created = await prisma.pricingMethod.create({
            data: {
                serviceId: gold.id,
                name: method.name,
                basePrice: method.basePrice,
                pricingUnit: "PER_ITEM" as PricingUnit, // PER_ITEM represents per million GP
                displayOrder: method.order,
                active: true,
            },
        });
        goldMethodIds.push(created.id);
    }

    // Notes
    const goldNotes = [
        "Delivery within 5-15 minutes",
        "Safe trading methods only",
        "VPN recommended for security",
        "Bulk discounts available - contact us",
    ];

    for (const note of goldNotes) {
        await prisma.pricingModifier.create({
            data: {
                methodId: goldMethodIds[0],
                name: note,
                modifierType: "PERCENTAGE",
                value: 0,
                displayType: "NOTE" as ModifierDisplayType,
                priority: 20,
                active: true,
            },
        });
    }

    console.log(`    ✓ Created ${goldMethods.length} gold pricing tiers\n`);
}

async function main() {
    console.log("🚀 MMOGoldHut-Style Data Seeding Script\n");
    console.log("=".repeat(60));

    try {
        // Clean existing data if requested
        if (CLEAN_EXISTING_DATA) {
            console.log("\n🧹 Cleaning existing data...\n");

            await prisma.pricingModifier.deleteMany({});
            console.log("  ✓ Deleted all pricing modifiers");

            await prisma.pricingMethod.deleteMany({});
            console.log("  ✓ Deleted all pricing methods");

            await prisma.service.deleteMany({});
            console.log("  ✓ Deleted all services");

            await prisma.serviceCategory.deleteMany({});
            console.log("  ✓ Deleted all categories");

            console.log("\n✅ Database cleaned!\n");
        }

        // Create categories
        const categories = await createCategories();

        const categoryMap: { [key: string]: string } = {};
        for (const cat of categories) {
            categoryMap[cat.slug] = cat.id;
        }

        // Seed each category
        console.log("=".repeat(60));
        console.log("\n🌱 Seeding Services with Pricing Data...\n");

        await seedSkillsCategory(categoryMap["skills"]);
        await seedMinigamesCategory(categoryMap["minigames"]);
        await seedQuestsCategory(categoryMap["quests"]);
        await seedBossingCategory(categoryMap["bossing"]);
        await seedGoldCategory(categoryMap["gold"]);

        // Summary
        console.log("=".repeat(60));
        console.log("\n✅ Data Seeding Complete!\n");

        const stats = {
            categories: await prisma.serviceCategory.count(),
            services: await prisma.service.count(),
            pricingMethods: await prisma.pricingMethod.count(),
            modifiers: await prisma.pricingModifier.count(),
        };

        console.log("📊 Summary:");
        console.log(`  • ${stats.categories} categories`);
        console.log(`  • ${stats.services} services`);
        console.log(`  • ${stats.pricingMethods} pricing methods`);
        console.log(`  • ${stats.modifiers} modifiers`);

        console.log("\n🎮 Test in Discord:");
        console.log("  1. Start bot: npm run dev");
        console.log("  2. Run: /services");
        console.log("  3. Browse categories and services!");

        console.log("\n🌐 Test in Admin Panel:");
        console.log("  1. Open dashboard");
        console.log("  2. Navigate to Pricing section");
        console.log("  3. View/edit all pricing methods");

        console.log("\n💡 Showcased Features:");
        console.log("  ✓ Level-based pricing (Agility, Runecrafting)");
        console.log("  ✓ Multiple pricing tiers (Fire Cape, Infernal Cape)");
        console.log("  ✓ Upcharge modifiers (highlighted in red)");
        console.log("  ✓ Note modifiers (highlighted in green)");
        console.log("  ✓ Warning modifiers (highlighted in yellow)");
        console.log(
            "  ✓ All pricing units (FIXED, PER_LEVEL, PER_HOUR, PER_KILL, PER_ITEM)"
        );

        console.log("\n");
    } catch (error) {
        console.error("\n❌ Error seeding data:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .then(() => {
        console.log("✨ Done!");
        process.exit(0);
    })
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
