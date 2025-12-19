import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Debug script to find out why "Cook's Assistant" is not being found
 */
async function debugQuestSearch() {
    console.log('\n🔍 Debugging Quest Search for "Cook\'s Assistant"\n');

    try {
        // 1. Check if the service exists at all
        console.log('1️⃣ Searching for services with "cook" in the name...');
        const servicesWithCook = await prisma.service.findMany({
            where: {
                name: {
                    contains: 'cook',
                    mode: 'insensitive',
                },
            },
            include: {
                pricingMethods: true,
                category: true,
            },
        });

        console.log(`   Found ${servicesWithCook.length} services:\n`);
        servicesWithCook.forEach((service) => {
            console.log(`   📦 Service: "${service.name}"`);
            console.log(`      ID: ${service.id}`);
            console.log(`      Slug: ${service.slug}`);
            console.log(`      Category: ${service.category?.name || 'None'}`);
            console.log(`      Active: ${service.active}`);
            console.log(`      Pricing Methods: ${service.pricingMethods.length}`);
            service.pricingMethods.forEach((method) => {
                console.log(`         - ${method.name} (${method.pricingUnit}): $${method.basePrice}`);
            });
            console.log('');
        });

        // 2. Check for FIXED pricing services
        console.log('\n2️⃣ Checking for services with FIXED pricing...');
        const fixedPricingServices = await prisma.service.findMany({
            where: {
                pricingMethods: {
                    some: {
                        pricingUnit: 'FIXED',
                    },
                },
            },
            include: {
                pricingMethods: {
                    where: {
                        pricingUnit: 'FIXED',
                    },
                },
                category: true,
            },
        });

        console.log(`   Found ${fixedPricingServices.length} services with FIXED pricing:\n`);
        fixedPricingServices.slice(0, 10).forEach((service) => {
            console.log(`   ✅ ${service.name} - $${service.pricingMethods[0]?.basePrice || 'N/A'}`);
        });

        // 3. Search for exact "Cook's Assistant"
        console.log('\n3️⃣ Searching for exact "Cook\'s Assistant"...');
        const cookAssistant = await prisma.service.findFirst({
            where: {
                OR: [
                    { name: { equals: "Cook's Assistant", mode: 'insensitive' } },
                    { name: { equals: "Cooks Assistant", mode: 'insensitive' } },
                    { slug: { equals: "cooks-assistant", mode: 'insensitive' } },
                ],
            },
            include: {
                pricingMethods: true,
                category: true,
            },
        });

        if (cookAssistant) {
            console.log('\n   ✅ FOUND "Cook\'s Assistant"!');
            console.log(`      Name: ${cookAssistant.name}`);
            console.log(`      Slug: ${cookAssistant.slug}`);
            console.log(`      Category: ${cookAssistant.category?.name || 'None'}`);
            console.log(`      Active: ${cookAssistant.active}`);
            console.log(`      Pricing Methods:`);
            cookAssistant.pricingMethods.forEach((method) => {
                console.log(`         - ${method.name}`);
                console.log(`           Unit: ${method.pricingUnit}`);
                console.log(`           Price: $${method.basePrice}`);
                console.log(`           Active: ${method.active}`);
            });
        } else {
            console.log('\n   ❌ "Cook\'s Assistant" NOT FOUND in database');
        }

        // 4. Check normalization
        console.log('\n4️⃣ Testing normalization function...');
        const testNames = [
            "Cook's Assistant",
            "Cooks Assistant",
            "cook's assistant",
            "COOK'S ASSISTANT",
        ];

        testNames.forEach((name) => {
            const normalized = normalizeQuestName(name);
            console.log(`   "${name}" → "${normalized}"`);
        });

        // 5. Check what the !q command would see
        console.log('\n5️⃣ Simulating !q command search...');
        const allServices = await prisma.service.findMany({
            include: {
                pricingMethods: true,
            },
        });

        const searchTerm = "cook's assistant";
        const normalized = normalizeQuestName(searchTerm);
        console.log(`   Search term: "${searchTerm}"`);
        console.log(`   Normalized: "${normalized}"`);

        const fixedServices = allServices.filter((s: any) =>
            s.pricingMethods?.some((m: any) => m.pricingUnit === 'FIXED')
        );
        console.log(`   Total services with FIXED pricing: ${fixedServices.length}`);

        const match = fixedServices.find((s: any) =>
            normalizeQuestName(s.name) === normalized ||
            normalizeQuestName(s.slug) === normalized
        );

        if (match) {
            console.log(`   ✅ MATCH FOUND: "${match.name}"`);
        } else {
            console.log(`   ❌ NO MATCH FOUND`);
            console.log(`\n   Trying partial matches...`);
            const partialMatches = fixedServices.filter((s: any) =>
                normalizeQuestName(s.name).includes(normalized) ||
                normalizeQuestName(s.slug).includes(normalized)
            );
            console.log(`   Partial matches: ${partialMatches.length}`);
            partialMatches.slice(0, 5).forEach((s) => {
                console.log(`      - "${s.name}" (normalized: "${normalizeQuestName(s.name)}")`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Normalize quest name (same as in messageCreate.event.ts)
 */
function normalizeQuestName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/\bi\b/g, '1')     // I → 1
        .replace(/\bii\b/g, '2')    // II → 2
        .replace(/\biii\b/g, '3')   // III → 3
        .replace(/\biv\b/g, '4')    // IV → 4
        .replace(/\bv\b/g, '5')     // V → 5
        .replace(/[^a-z0-9\s']/g, '') // Remove special chars BUT keep apostrophes
        .replace(/\s+/g, ' ')       // Normalize spaces
        .replace(/'+/g, "'");       // Normalize multiple apostrophes to single
}

// Run the debug script
debugQuestSearch()
    .then(() => {
        console.log('\n✅ Debug complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
