// Simple script to check for Cook's Assistant (no TypeScript)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkQuest() {
    console.log('\n🔍 Checking for "Cook\'s Assistant" in database...\n');

    try {
        // Search for Cook's Assistant
        const services = await prisma.service.findMany({
            where: {
                OR: [
                    { name: { contains: 'cook' } },
                    { name: { contains: 'Cook' } },
                ],
            },
            include: {
                pricingMethods: true,
            },
        });

        console.log(`Found ${services.length} services with "cook" in name:\n`);

        services.forEach((service) => {
            console.log(`📦 ${service.name}`);
            console.log(`   ID: ${service.id}`);
            console.log(`   Slug: ${service.slug}`);
            console.log(`   Active: ${service.active}`);
            console.log(`   Pricing Methods: ${service.pricingMethods.length}`);
            service.pricingMethods.forEach((method) => {
                console.log(`      - ${method.name}: ${method.pricingUnit} = $${method.basePrice}`);
            });
            console.log('');
        });

        // Check how many FIXED pricing services exist
        const allServices = await prisma.service.findMany({
            include: {
                pricingMethods: true,
            },
        });

        const fixedServices = allServices.filter(s =>
            s.pricingMethods.some(m => m.pricingUnit === 'FIXED')
        );

        console.log(`\nTotal services with FIXED pricing: ${fixedServices.length}`);
        console.log('\nFirst 10 FIXED pricing services:');
        fixedServices.slice(0, 10).forEach(s => {
            const fixedMethod = s.pricingMethods.find(m => m.pricingUnit === 'FIXED');
            console.log(`   - ${s.name}: $${fixedMethod?.basePrice || 'N/A'}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkQuest();
