// Check Members' Quests service structure
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMembersQuests() {
    console.log('\n🔍 Checking "Members\' Quests" and "Free Quests" structure...\n');

    try {
        // Find all quest-related services
        const questServices = await prisma.service.findMany({
            where: {
                OR: [
                    { name: { contains: 'Quest' } },
                    { name: { contains: 'quest' } },
                ],
            },
            include: {
                pricingMethods: {
                    orderBy: { displayOrder: 'asc' },
                },
                category: true,
            },
        });

        console.log(`Found ${questServices.length} quest-related services:\n`);

        questServices.forEach((service) => {
            console.log(`📦 ${service.name}`);
            console.log(`   Category: ${service.category?.name || 'None'}`);
            console.log(`   Pricing Methods (${service.pricingMethods.length}):`);

            service.pricingMethods.slice(0, 10).forEach((method, idx) => {
                console.log(`      ${idx + 1}. ${method.name}: ${method.pricingUnit} = $${method.basePrice}`);
            });

            if (service.pricingMethods.length > 10) {
                console.log(`      ... and ${service.pricingMethods.length - 10} more`);
            }
            console.log('');
        });

        // Specifically check for Cook's Assistant in pricing methods
        console.log('\n🔍 Searching for "Cook\'s Assistant" in all pricing methods...\n');

        const allServices = await prisma.service.findMany({
            include: {
                pricingMethods: true,
            },
        });

        let found = false;
        for (const service of allServices) {
            const cookMethod = service.pricingMethods.find(m =>
                m.name.toLowerCase().includes('cook')
            );

            if (cookMethod) {
                console.log(`✅ Found in service: "${service.name}"`);
                console.log(`   Pricing Method: "${cookMethod.name}"`);
                console.log(`   Unit: ${cookMethod.pricingUnit}`);
                console.log(`   Price: $${cookMethod.basePrice}`);
                console.log('');
                found = true;
            }
        }

        if (!found) {
            console.log('❌ "Cook\'s Assistant" not found in any pricing methods');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkMembersQuests();
