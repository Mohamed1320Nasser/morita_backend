import prisma from '../common/prisma/client';

/**
 * Seed Loyalty Tiers
 *
 * This script creates the default 7 loyalty tiers with spending thresholds and discounts.
 *
 * IMPORTANT: Discord Role IDs must be added manually after creating roles in Discord!
 *
 * To get Discord Role ID:
 * 1. Go to Discord Server Settings → Roles
 * 2. Create the role (e.g., "👤 Client")
 * 3. Right-click the role → Copy Role ID
 * 4. Update the tier in database or admin dashboard
 */

async function seedLoyaltyTiers() {
  console.log('🎯 Seeding Loyalty Tiers...\n');

  const tiers = [
    {
      name: 'Client',
      emoji: '👤',
      minSpending: 1,
      maxSpending: 250,
      discountPercent: 0,
      sortOrder: 1,
      discordRoleId: null, // Will be filled later after Discord role creation
      isActive: true,
    },
    {
      name: 'Regular',
      emoji: '🔹',
      minSpending: 250,
      maxSpending: 500,
      discountPercent: 2,
      sortOrder: 2,
      discordRoleId: null,
      isActive: true,
    },
    {
      name: 'Preferred',
      emoji: '⭐',
      minSpending: 500,
      maxSpending: 1000,
      discountPercent: 4,
      sortOrder: 3,
      discordRoleId: null,
      isActive: true,
    },
    {
      name: 'Prestige',
      emoji: '🏅',
      minSpending: 1000,
      maxSpending: 1500,
      discountPercent: 6,
      sortOrder: 4,
      discordRoleId: null,
      isActive: true,
    },
    {
      name: 'Premium',
      emoji: '💎',
      minSpending: 1500,
      maxSpending: 2000,
      discountPercent: 8,
      sortOrder: 5,
      discordRoleId: null,
      isActive: true,
    },
    {
      name: 'VIP',
      emoji: '⚡',
      minSpending: 2000,
      maxSpending: 4000,
      discountPercent: 10,
      sortOrder: 6,
      discordRoleId: null,
      isActive: true,
    },
    {
      name: 'GOAT',
      emoji: '🐐',
      minSpending: 4000,
      maxSpending: null, // Unlimited
      discountPercent: 15,
      sortOrder: 7,
      discordRoleId: null,
      isActive: true,
    },
  ];

  for (const tierData of tiers) {
    // Check if tier already exists
    const existing = await prisma.loyaltyTier.findUnique({
      where: { name: tierData.name },
    });

    if (existing) {
      console.log(`⏭️  Tier "${tierData.name}" already exists, skipping...`);
      continue;
    }

    const tier = await prisma.loyaltyTier.create({
      data: tierData,
    });

    console.log(
      `✅ Created tier: ${tier.emoji} ${tier.name} ` +
        `($${tier.minSpending}+ → ${tier.discountPercent}% discount)`
    );
  }

  console.log('\n✨ Loyalty Tiers seeding completed!\n');
  console.log('📝 NEXT STEPS:');
  console.log('1. Create Discord roles in your server');
  console.log('2. Copy each role ID (Right-click → Copy Role ID)');
  console.log('3. Update tiers via Admin Dashboard or database');
  console.log('4. Enable role hoisting in Discord role settings\n');
}

// Run the seed
seedLoyaltyTiers()
  .catch((error) => {
    console.error('❌ Error seeding loyalty tiers:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
