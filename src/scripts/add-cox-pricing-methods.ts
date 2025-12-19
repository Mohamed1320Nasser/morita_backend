/**
 * Add additional CoX pricing methods for pagination testing
 *
 * This script adds 40 more pricing methods to Chambers of Xeric service
 * to test the message splitter pagination functionality.
 */

import { PrismaClient, PricingUnit } from '@prisma/client';

const prisma = new PrismaClient();

const SERVICE_ID = '4ce6b6d8-bb9f-4e04-9516-591faa873c3a';

// Additional pricing methods following the existing pattern
const additionalPricingMethods = [
  // Regular CoX - Different team sizes and gear combinations
  { name: 'CoX - Login - Duo - TBow + Scythe', price: 2.6, unit: 'PER_KILL' },
  { name: 'CoX - Login - Duo - TBow + Lance', price: 2.8, unit: 'PER_KILL' },
  { name: 'CoX - Login - Duo - Bowfa + Scythe', price: 3.2, unit: 'PER_KILL' },
  { name: 'CoX - Login - Trio - TBow + Scythe', price: 2.4, unit: 'PER_KILL' },
  { name: 'CoX - Login - Trio - TBow + Lance', price: 2.6, unit: 'PER_KILL' },
  { name: 'CoX - Login - Trio - Bowfa + Lance', price: 3.0, unit: 'PER_KILL' },
  { name: 'CoX - Login - Trio - Bowfa + Fang', price: 3.3, unit: 'PER_KILL' },

  // CoX Boosting variations
  { name: 'CoX Boosting (3+1)', price: 4.5, unit: 'PER_KILL' },
  { name: 'CoX Boosting (4+1)', price: 5.5, unit: 'PER_KILL' },
  { name: 'CoX Boosting (5+1)', price: 6.5, unit: 'PER_KILL' },
  { name: 'CoX Boosting - Max Gear (2+1)', price: 3.8, unit: 'PER_KILL' },
  { name: 'CoX Boosting - Max Gear (3+1)', price: 5.0, unit: 'PER_KILL' },
  { name: 'CoX Boosting - Budget Gear (2+1)', price: 3.5, unit: 'PER_KILL' },

  // CoX Teaching variations
  { name: 'CoX Teaching (4+1)', price: 7.5, unit: 'PER_KILL' },
  { name: 'CoX Teaching (5+1)', price: 9.0, unit: 'PER_KILL' },
  { name: 'CoX Teaching - Advanced (2+1)', price: 4.5, unit: 'PER_KILL' },
  { name: 'CoX Teaching - Beginner (2+1)', price: 4.0, unit: 'PER_KILL' },

  // CoX Leeching variations
  { name: 'CoX - Full Leeching - Trio', price: 5.5, unit: 'PER_KILL' },
  { name: 'CoX - Full Leeching - Duo', price: 6.0, unit: 'PER_KILL' },
  { name: 'CoX - Full Leeching - Solo', price: 8.0, unit: 'PER_KILL' },

  // CoX CM (Challenge Mode) - More variations
  { name: 'CoX CM - Login - Solo - TBow + Scythe', price: 6.0, unit: 'PER_KILL' },
  { name: 'CoX CM - Login - Duo - TBow + Scythe', price: 5.5, unit: 'PER_KILL' },
  { name: 'CoX CM - Login - Duo - TBow + Lance', price: 5.8, unit: 'PER_KILL' },
  { name: 'CoX CM - Login - Duo - Bowfa + Scythe', price: 6.5, unit: 'PER_KILL' },
  { name: 'CoX CM - Login - Trio - TBow + Scythe', price: 5.2, unit: 'PER_KILL' },
  { name: 'CoX CM - Login - Trio - TBow + Lance', price: 5.5, unit: 'PER_KILL' },
  { name: 'CoX CM - Login - Trio - Bowfa + Lance', price: 6.8, unit: 'PER_KILL' },
  { name: 'CoX CM - Boosting (3+1)', price: 9.0, unit: 'PER_KILL' },
  { name: 'CoX CM - Boosting (4+1)', price: 11.0, unit: 'PER_KILL' },
  { name: 'CoX CM - Boosting (5+1)', price: 13.0, unit: 'PER_KILL' },
  { name: 'CoX CM - Teaching (3+1)', price: 12.0, unit: 'PER_KILL' },
  { name: 'CoX CM - Teaching (4+1)', price: 15.0, unit: 'PER_KILL' },
  { name: 'CoX CM - Teaching (5+1)', price: 18.0, unit: 'PER_KILL' },

  // CoX CM - Specific gear setups
  { name: 'CoX CM - TBow + Scythe', price: 5.8, unit: 'PER_KILL' },
  { name: 'CoX CM - Bowfa + Scythe', price: 7.8, unit: 'PER_KILL' },
  { name: 'CoX CM - Bowfa + Fang', price: 8.2, unit: 'PER_KILL' },
  { name: 'CoX CM - Budget Gear Duo', price: 7.5, unit: 'PER_KILL' },
  { name: 'CoX CM - Budget Gear Trio', price: 7.2, unit: 'PER_KILL' },
  { name: 'CoX CM - Max Gear Duo', price: 4.5, unit: 'PER_KILL' },
  { name: 'CoX CM - Max Gear Solo', price: 4.8, unit: 'PER_KILL' },
  { name: 'CoX CM - Leeching Duo', price: 10.0, unit: 'PER_KILL' },
];

async function addPricingMethods() {
  try {
    console.log('🚀 Starting to add CoX pricing methods...\n');

    // Verify service exists
    const service = await prisma.service.findUnique({
      where: { id: SERVICE_ID },
      include: {
        pricingMethods: true,
      },
    });

    if (!service) {
      console.log('❌ Service not found!');
      return;
    }

    console.log(`📋 Service: ${service.name}`);
    console.log(`📊 Current pricing methods: ${service.pricingMethods.length}`);
    console.log(`➕ Adding: ${additionalPricingMethods.length} new methods`);
    console.log(`📈 Total after: ${service.pricingMethods.length + additionalPricingMethods.length}\n`);

    // Get the highest display order
    const maxDisplayOrder = service.pricingMethods.reduce(
      (max, method) => Math.max(max, method.displayOrder),
      0
    );

    let added = 0;
    let skipped = 0;

    for (let i = 0; i < additionalPricingMethods.length; i++) {
      const method = additionalPricingMethods[i];

      // Check if method with same name already exists
      const existing = service.pricingMethods.find(
        (pm) => pm.name === method.name
      );

      if (existing) {
        console.log(`⏭️  Skipping (exists): ${method.name}`);
        skipped++;
        continue;
      }

      // Add new pricing method
      await prisma.pricingMethod.create({
        data: {
          name: method.name,
          description: `${method.name} - Professional CoX service`,
          basePrice: method.price,
          pricingUnit: method.unit as PricingUnit,
          active: true,
          displayOrder: maxDisplayOrder + i + 1,
          serviceId: SERVICE_ID,
        },
      });

      console.log(`✅ Added: ${method.name} - $${method.price}/${method.unit}`);
      added++;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Successfully added ${added} pricing methods`);
    console.log(`⏭️  Skipped ${skipped} existing methods`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verify final count
    const updatedService = await prisma.service.findUnique({
      where: { id: SERVICE_ID },
      include: {
        _count: {
          select: { pricingMethods: true },
        },
      },
    });

    console.log(`📊 Final pricing methods count: ${updatedService?._count.pricingMethods}`);
    console.log('\n🎉 Done! You can now test the pagination feature.');
    console.log('\n💡 To test: Use the pricing service details button in Discord');
  } catch (error) {
    console.error('❌ Error adding pricing methods:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
addPricingMethods();
