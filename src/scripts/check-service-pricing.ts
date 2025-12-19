/**
 * Check current pricing methods for a service
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkServicePricing() {
  try {
    const serviceId = '4ce6b6d8-bb9f-4e04-9516-591faa873c3a';

    // Get service details
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        pricingMethods: {
          orderBy: { basePrice: 'asc' },
        },
        category: true,
      },
    });

    if (!service) {
      console.log('❌ Service not found!');
      return;
    }

    console.log('\n📋 Service Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Name: ${service.name}`);
    console.log(`Category: ${service.category?.name || 'N/A'}`);
    console.log(`Emoji: ${service.emoji || 'N/A'}`);
    console.log(`Description: ${service.description || 'N/A'}`);
    console.log(`Current Pricing Methods: ${service.pricingMethods.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (service.pricingMethods.length > 0) {
      console.log('💰 Current Pricing Methods:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      service.pricingMethods.forEach((method, index) => {
        console.log(`${index + 1}. ${method.name}`);
        console.log(`   Price: $${method.basePrice}`);
        console.log(`   Unit: ${method.pricingUnit}`);
        console.log(`   Active: ${method.active}`);
        console.log('');
      });
    }

    console.log(`\n✅ Service has ${service.pricingMethods.length} pricing methods`);
    console.log(`\n💡 Recommendation: Add ${50 - service.pricingMethods.length} more methods to test pagination`);
  } catch (error) {
    console.error('Error checking service:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkServicePricing();
