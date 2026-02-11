import { Client, GatewayIntentBits, Role } from 'discord.js';
import prisma from '../common/prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * LOYALTY TIER DISCORD ROLE SETUP SCRIPT
 *
 * This script automatically:
 * 1. Reads loyalty tiers from database
 * 2. Creates corresponding Discord roles
 * 3. Saves the Discord role IDs back to the database
 *
 * RUN ONCE after seeding loyalty tiers!
 *
 * Usage:
 *   npx ts-node src/scripts/setup-loyalty-discord-roles.ts
 */

// Tier color mapping (professional gradient)
const TIER_COLORS: { [key: string]: number } = {
  Client: 0x95a5a6, // Gray
  Regular: 0x3498db, // Blue
  Preferred: 0x9b59b6, // Purple
  Prestige: 0xe67e22, // Orange
  Premium: 0x1abc9c, // Teal
  VIP: 0xf1c40f, // Gold
  GOAT: 0xe74c3c, // Red
};

interface SetupResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

async function setupLoyaltyDiscordRoles(): Promise<void> {
  console.log('🤖 Starting Discord Bot for Loyalty Role Setup...\n');

  // Validate required environment variables
  if (!process.env.DISCORD_BOT_TOKEN) {
    console.error('❌ ERROR: DISCORD_BOT_TOKEN not found in environment variables!');
    console.error('   Please add DISCORD_BOT_TOKEN to your .env file');
    process.exit(1);
  }

  if (!process.env.DISCORD_GUILD_ID) {
    console.error('❌ ERROR: DISCORD_GUILD_ID not found in environment variables!');
    console.error('   Please add DISCORD_GUILD_ID to your .env file');
    process.exit(1);
  }

  // Create Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // Login to Discord
  console.log('🔐 Logging into Discord...');
  await client.login(process.env.DISCORD_BOT_TOKEN);

  console.log('✅ Bot logged in successfully!\n');

  // Wait for bot to be ready
  await new Promise<void>((resolve) => {
    client.once('ready', () => {
      console.log(`🟢 Bot is ready: ${client.user?.tag}\n`);
      resolve();
    });
  });

  try {
    // Fetch the guild
    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await client.guilds.fetch(guildId);
    console.log(`🏰 Connected to guild: ${guild.name}\n`);

    // Get all loyalty tiers from database
    const tiers = await prisma.loyaltyTier.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (tiers.length === 0) {
      console.error('❌ No loyalty tiers found in database!');
      console.error('   Please run the seed script first:');
      console.error('   npx ts-node src/scripts/seed-loyalty-tiers.ts\n');
      process.exit(1);
    }

    console.log(`📋 Found ${tiers.length} loyalty tiers in database:\n`);

    const results: SetupResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Process each tier
    for (const tier of tiers) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing: ${tier.emoji} ${tier.name}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`  Min Spending: $${tier.minSpending}`);
      console.log(`  Max Spending: ${tier.maxSpending ? `$${tier.maxSpending}` : 'Unlimited'}`);
      console.log(`  Discount: ${tier.discountPercent}%`);

      try {
        await processTier(guild, tier, results);
      } catch (error) {
        const errorMsg = `Failed to process tier "${tier.name}": ${error}`;
        console.error(`\n❌ ${errorMsg}`);
        results.errors.push(errorMsg);
      }
    }

    // Print summary
    console.log('\n\n' + '='.repeat(60));
    console.log('✨ SETUP COMPLETED!');
    console.log('='.repeat(60));
    console.log(`✅ Roles Created: ${results.created}`);
    console.log(`🔄 Roles Updated: ${results.updated}`);
    console.log(`⏭️  Roles Skipped: ${results.skipped}`);

    if (results.errors.length > 0) {
      console.log(`\n❌ Errors (${results.errors.length}):`);
      results.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
    }

    console.log('\n✅ All loyalty tier roles are now configured!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Check your Discord server - roles should be visible');
    console.log('   2. Verify roles are hoisted (displayed separately)');
    console.log('   3. Check database - discord_role_id should be populated');
    console.log('   4. Run: SELECT name, emoji, discord_role_id FROM loyalty_tiers;\n');
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    throw error;
  } finally {
    // Cleanup and exit
    console.log('\n🔌 Disconnecting bot...');
    await client.destroy();
    await prisma.$disconnect();
    console.log('👋 Done!\n');
    process.exit(0);
  }
}

/**
 * Process a single loyalty tier
 */
async function processTier(
  guild: any,
  tier: any,
  results: SetupResult
): Promise<void> {
  const roleName = `${tier.emoji} ${tier.name}`;
  const roleColor = TIER_COLORS[tier.name] || 0x99aab5; // Default gray

  let existingRole: Role | undefined;

  // Method 1: Check if role ID exists in database and is valid in Discord
  if (tier.discordRoleId) {
    console.log(`  🔍 Checking existing role ID: ${tier.discordRoleId}`);
    existingRole = guild.roles.cache.get(tier.discordRoleId);

    if (existingRole) {
      console.log(`  ✅ Role found in Discord: ${existingRole.name}`);
    } else {
      console.log(`  ⚠️  Role ID in database but not found in Discord (may have been deleted)`);
    }
  }

  // Method 2: Search by role name if role ID not found
  if (!existingRole) {
    console.log(`  🔍 Searching for role by name: "${roleName}"`);
    existingRole = guild.roles.cache.find((r: Role) => r.name === roleName);

    if (existingRole) {
      console.log(`  ✅ Found existing role by name: ${existingRole.id}`);
    }
  }

  if (existingRole) {
    // Role exists - update it
    console.log(`  🔄 Updating existing role...`);

    try {
      await existingRole.edit({
        name: roleName,
        color: roleColor,
        hoist: true, // Display members separately (this is the key!)
        mentionable: false,
        reason: `Updated by loyalty tier setup script`,
      });

      console.log(`  ✅ Role updated successfully`);

      // Update database if role ID changed or wasn't set
      if (tier.discordRoleId !== existingRole.id) {
        await prisma.loyaltyTier.update({
          where: { id: tier.id },
          data: { discordRoleId: existingRole.id },
        });
        console.log(`  💾 Database updated with role ID: ${existingRole.id}`);
      } else {
        console.log(`  ℹ️  Database already has correct role ID`);
      }

      results.updated++;
    } catch (error) {
      throw new Error(`Failed to update role: ${error}`);
    }
  } else {
    // Role doesn't exist - create it
    console.log(`  ➕ Creating new role...`);

    try {
      const newRole = await guild.roles.create({
        name: roleName,
        color: roleColor,
        hoist: true, // Display members separately - IMPORTANT!
        mentionable: false,
        position: tier.sortOrder + 5, // Position in role hierarchy
        reason: `Created by loyalty tier setup script for ${tier.name}`,
      });

      console.log(`  ✅ Role created successfully!`);
      console.log(`  🆔 Role ID: ${newRole.id}`);

      // Save role ID to database
      await prisma.loyaltyTier.update({
        where: { id: tier.id },
        data: { discordRoleId: newRole.id },
      });

      console.log(`  💾 Role ID saved to database`);
      results.created++;
    } catch (error) {
      throw new Error(`Failed to create role: ${error}`);
    }
  }

  console.log(`  ✅ ${tier.name} tier configured successfully!`);
}

// Run the setup
setupLoyaltyDiscordRoles().catch((error) => {
  console.error('\n💥 Unhandled error:', error);
  process.exit(1);
});
