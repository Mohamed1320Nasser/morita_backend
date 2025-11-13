/**
 * Fix Agility Pricing Script
 *
 * This script updates Agility pricing methods to match the MMOGoldHut values
 * that are currently showing as $0 in the database.
 *
 * Usage:
 *   npx ts-node scripts/fix-agility-pricing.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixAgilityPricing() {
    console.log("\n🔧 Fixing Agility Pricing...\n");

    // Get Agility service
    const agility = await prisma.service.findFirst({
        where: { slug: "agility" },
        include: {
            pricingMethods: {
                where: { active: true },
                orderBy: { displayOrder: "asc" },
            },
        },
    });

    if (!agility) {
        console.log("❌ Agility service not found");
        return;
    }

    // Correct pricing values from MMOGoldHut
    const correctPrices: Record<string, number> = {
        Agility: 0.00007,
        "Canifis Rooftop": 0.000054,
        "Falador Rooftop": 0.000045,
        "Seers Rooftop With Diary": 0.00002,
        "Seers Rooftop Without Diary": 0.000023,
        "Rellekka Rooftop": 0.000024,
        "Ardougne Rooftop": 0.00002,
        Wilderness: 0.00002,
    };

    console.log("Current Prices:");
    for (const method of agility.pricingMethods) {
        console.log(`  ${method.name}: $${method.basePrice} per XP`);
    }

    console.log("\n📝 Updating prices...\n");

    let updated = 0;
    for (const method of agility.pricingMethods) {
        const correctPrice = correctPrices[method.name];

        if (correctPrice !== undefined) {
            await prisma.pricingMethod.update({
                where: { id: method.id },
                data: { basePrice: correctPrice },
            });

            console.log(
                `  ✅ ${method.name}: $${method.basePrice} → $${correctPrice} per XP`
            );
            updated++;
        } else {
            console.log(`  ⚠️  ${method.name}: No correct price defined`);
        }
    }

    console.log(`\n✅ Updated ${updated} pricing methods\n`);

    // Verify the update
    console.log("Verifying updated prices:\n");
    const updatedAgility = await prisma.service.findFirst({
        where: { slug: "agility" },
        include: {
            pricingMethods: {
                where: { active: true },
                orderBy: { displayOrder: "asc" },
            },
        },
    });

    if (updatedAgility) {
        for (const method of updatedAgility.pricingMethods) {
            console.log(`  ${method.name}: $${method.basePrice} per XP`);
        }
    }

    await prisma.$disconnect();
}

fixAgilityPricing().catch(error => {
    console.error("Error:", error);
});
