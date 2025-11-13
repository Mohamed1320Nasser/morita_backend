/**
 * Test Data Population Script for Enhanced Pricing System
 *
 * This script creates comprehensive test data demonstrating:
 * - Level-based pricing (e.g., Agility 1-40, 40-50, 50-60)
 * - Multiple pricing tiers (Main Accounts, Zerker Accounts, Pure Accounts)
 * - Upcharge modifiers (displayed in red)
 * - Note modifiers (displayed in green)
 * - Various pricing units (FIXED, PER_LEVEL, PER_KILL, PER_HOUR)
 *
 * Usage:
 *   npx ts-node scripts/populate-test-pricing-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting test data population...\n");

    try {
        // ==========================================
        // 1. Create or get "Skills" category
        // ==========================================
        console.log('📦 Creating "Skills" category...');
        const skillsCategory = await prisma.serviceCategory.upsert({
            where: { slug: "skills" },
            update: {},
            create: {
                name: "Skills",
                slug: "skills",
                emoji: "⚔️",
                description: "OSRS skill training services",
                active: true,
                displayOrder: 1,
            },
        });
        console.log(`✅ Skills category: ${skillsCategory.id}\n`);

        // ==========================================
        // 2. Create or get "Minigames" category
        // ==========================================
        console.log('📦 Creating "Minigames" category...');
        const minigamesCategory = await prisma.serviceCategory.upsert({
            where: { slug: "minigames" },
            update: {},
            create: {
                name: "Minigames",
                slug: "minigames",
                emoji: "🎮",
                description: "OSRS minigame services",
                active: true,
                displayOrder: 2,
            },
        });
        console.log(`✅ Minigames category: ${minigamesCategory.id}\n`);

        // ==========================================
        // 3. Create "Agility" service with level ranges
        // ==========================================
        console.log('🏃 Creating "Agility" service...');
        const agilityService = await prisma.service.upsert({
            where: {
                categoryId_slug: {
                    categoryId: skillsCategory.id,
                    slug: "agility",
                },
            },
            update: {},
            create: {
                categoryId: skillsCategory.id,
                name: "Agility",
                slug: "agility",
                emoji: "🏃",
                description:
                    "Professional Agility training with optimal routes",
                active: true,
                displayOrder: 1,
            },
        });
        console.log(`✅ Agility service: ${agilityService.id}`);

        // Create level-based pricing for Agility
        console.log("  📊 Creating level-based pricing methods...");

        const agilityPricingMethods = [
            {
                name: "Agility 1-40",
                startLevel: 1,
                endLevel: 40,
                basePrice: 0.00007,
                displayOrder: 1,
            },
            {
                name: "Agility 40-50 (Canifis Rooftop)",
                startLevel: 40,
                endLevel: 50,
                basePrice: 0.000054,
                displayOrder: 2,
            },
            {
                name: "Agility 50-60 (Falador Rooftop)",
                startLevel: 50,
                endLevel: 60,
                basePrice: 0.000045,
                displayOrder: 3,
            },
            {
                name: "Agility 60-90 (Seers Village)",
                startLevel: 60,
                endLevel: 90,
                basePrice: 0.00002,
                displayOrder: 4,
            },
            {
                name: "Agility 90-99 (Ardougne Rooftop)",
                startLevel: 90,
                endLevel: 99,
                basePrice: 0.000024,
                displayOrder: 5,
            },
        ];

        for (const method of agilityPricingMethods) {
            const created = await prisma.pricingMethod.create({
                data: {
                    serviceId: agilityService.id,
                    name: method.name,
                    basePrice: method.basePrice,
                    pricingUnit: "PER_LEVEL",
                    startLevel: method.startLevel,
                    endLevel: method.endLevel,
                    displayOrder: method.displayOrder,
                    active: true,
                },
            });
            console.log(
                `    ✓ ${method.name}: ${method.startLevel}-${method.endLevel} = $${method.basePrice}/XP`
            );
        }
        console.log("");

        // ==========================================
        // 4. Create "Fire Cape" service with multiple tiers
        // ==========================================
        console.log('🔥 Creating "Fire Cape" service...');
        const fireCapeService = await prisma.service.upsert({
            where: {
                categoryId_slug: {
                    categoryId: minigamesCategory.id,
                    slug: "fire-cape",
                },
            },
            update: {},
            create: {
                categoryId: minigamesCategory.id,
                name: "Fire Cape",
                slug: "fire-cape",
                emoji: "🔥",
                description:
                    "Professional Fire Cape service with various account types",
                active: true,
                displayOrder: 1,
            },
        });
        console.log(`✅ Fire Cape service: ${fireCapeService.id}`);

        // Create multiple pricing tiers for Fire Cape
        console.log("  📊 Creating pricing tiers...");

        const fireCapeTiers = [
            {
                name: "Main Accounts - Parsec",
                basePrice: 360,
            },
            {
                name: "Main Accounts - VPN",
                basePrice: 200,
            },
            {
                name: "Zerker Accounts - Parsec",
                basePrice: 400,
            },
            {
                name: "Zerker Accounts - VPN",
                basePrice: 275,
            },
            {
                name: "Pure Accounts - Parsec",
                basePrice: 475,
            },
            {
                name: "Pure Accounts - VPN",
                basePrice: 350,
            },
        ];

        const fireCapeMethodIds: string[] = [];
        for (let i = 0; i < fireCapeTiers.length; i++) {
            const tier = fireCapeTiers[i];
            const created = await prisma.pricingMethod.create({
                data: {
                    serviceId: fireCapeService.id,
                    name: tier.name,
                    basePrice: tier.basePrice,
                    pricingUnit: "FIXED",
                    displayOrder: i + 1,
                    active: true,
                },
            });
            fireCapeMethodIds.push(created.id);
            console.log(`    ✓ ${tier.name}: $${tier.basePrice}`);
        }
        console.log("");

        // ==========================================
        // 5. Add UPCHARGE modifiers to Fire Cape
        // ==========================================
        console.log("⚠️  Adding UPCHARGE modifiers to Fire Cape...");

        const upchargeModifiers = [
            {
                name: "+20M if you don't have Rigour",
                value: 20,
                description:
                    "Additional charge if Rigour prayer is not unlocked",
            },
            {
                name: "+50M if Magic level below 94",
                value: 50,
                description: "Additional charge for low Magic level",
            },
            {
                name: "Ethernet cable required or +20M",
                value: 20,
                description: "Upcharge if using WiFi instead of ethernet",
            },
        ];

        // Add upcharges to first method (they'll be extracted globally)
        for (const mod of upchargeModifiers) {
            await prisma.pricingModifier.create({
                data: {
                    methodId: fireCapeMethodIds[0], // Add to first method
                    name: mod.name,
                    modifierType: "FIXED",
                    value: mod.value,
                    displayType: "UPCHARGE", // This makes it show in the Upcharges section
                    priority: 10,
                    active: true,
                },
            });
            console.log(`    ✓ ${mod.name}: +$${mod.value}M`);
        }
        console.log("");

        // ==========================================
        // 6. Add NOTE modifiers to Fire Cape
        // ==========================================
        console.log("📝 Adding NOTE modifiers to Fire Cape...");

        const noteModifiers = [
            "Cape will be done via PARSEC",
            "VPN option available if connection is not good",
            "Parsec available EU, UK, AUS & US",
            "Task orders receive 15% discount",
        ];

        for (const note of noteModifiers) {
            await prisma.pricingModifier.create({
                data: {
                    methodId: fireCapeMethodIds[0], // Add to first method
                    name: note,
                    modifierType: "PERCENTAGE",
                    value: 0, // Notes don't affect price
                    displayType: "NOTE", // This makes it show in the Notes section
                    priority: 20,
                    active: true,
                },
            });
            console.log(`    ✓ ${note}`);
        }
        console.log("");

        // ==========================================
        // 7. Create "Smithing" service with WARNING modifier
        // ==========================================
        console.log('🔨 Creating "Smithing" service...');
        const smithingService = await prisma.service.upsert({
            where: {
                categoryId_slug: {
                    categoryId: skillsCategory.id,
                    slug: "smithing",
                },
            },
            update: {},
            create: {
                categoryId: skillsCategory.id,
                name: "Smithing",
                slug: "smithing",
                emoji: "🔨",
                description: "Smithing training service",
                active: true,
                displayOrder: 2,
            },
        });

        const smithingMethod = await prisma.pricingMethod.create({
            data: {
                serviceId: smithingService.id,
                name: "Smithing 1-99",
                basePrice: 150,
                pricingUnit: "FIXED",
                displayOrder: 1,
                active: true,
            },
        });

        await prisma.pricingModifier.create({
            data: {
                methodId: smithingMethod.id,
                name: "Materials NOT included - you must provide gold bars",
                modifierType: "PERCENTAGE",
                value: 0,
                displayType: "WARNING",
                priority: 1,
                active: true,
            },
        });
        console.log(`✅ Smithing service created with WARNING modifier\n`);

        // ==========================================
        // 8. Summary
        // ==========================================
        console.log("✅ Test data population complete!\n");
        console.log("📊 Summary:");
        console.log("  - Created 2 categories (Skills, Minigames)");
        console.log("  - Created 3 services (Agility, Fire Cape, Smithing)");
        console.log("  - Created 5 level-based pricing methods for Agility");
        console.log("  - Created 6 pricing tiers for Fire Cape");
        console.log("  - Created 3 UPCHARGE modifiers");
        console.log("  - Created 4 NOTE modifiers");
        console.log("  - Created 1 WARNING modifier\n");

        console.log("🎮 Test in Discord:");
        console.log("  1. Start your Discord bot: npm run dev");
        console.log("  2. In Discord, run: /services");
        console.log('  3. Select "Skills" or "Minigames"');
        console.log("  4. Select a service to see the new pricing display!\n");

        console.log("🌐 Test via API:");
        console.log(
            `  curl http://localhost:3000/api/public/services/${agilityService.id}/with-pricing`
        );
        console.log(
            `  curl http://localhost:3000/api/public/services/${fireCapeService.id}/with-pricing\n`
        );
    } catch (error) {
        console.error("❌ Error populating test data:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .then(() => {
        console.log("✨ Done!");
    })
    .catch(error => {
        console.error(error);
    });
