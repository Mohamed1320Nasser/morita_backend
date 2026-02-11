import { Client, Guild, Role } from 'discord.js';
import { Service } from 'typedi';
import prisma from '../../common/prisma/client';
import logger from '../../common/loggers';

/**
 * Loyalty Role Setup Service
 *
 * Automatically creates Discord roles for loyalty tiers and links them to the database.
 * This eliminates the need for manual role creation!
 */

@Service()
export class LoyaltyRoleSetupService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Tier Color Mapping - Professional gradient from gray → gold
   */
  private tierColors: { [key: string]: number } = {
    Client: 0x95a5a6, // Gray
    Regular: 0x3498db, // Blue
    Preferred: 0x9b59b6, // Purple
    Prestige: 0xe67e22, // Orange
    Premium: 0x1abc9c, // Teal
    VIP: 0xf1c40f, // Gold
    GOAT: 0xe74c3c, // Red
  };

  /**
   * Main function: Setup all loyalty tier roles automatically
   */
  async setupLoyaltyRoles(guildId: string): Promise<{
    created: number;
    updated: number;
    errors: string[];
  }> {
    logger.info('🎯 Starting automatic loyalty role setup...');

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    try {
      // Fetch the guild
      const guild = await this.client.guilds.fetch(guildId);
      if (!guild) {
        throw new Error(`Guild ${guildId} not found`);
      }

      // Get all loyalty tiers from database
      const tiers = await prisma.loyaltyTier.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      if (tiers.length === 0) {
        logger.warn('⚠️ No loyalty tiers found in database. Run seed script first!');
        return results;
      }

      logger.info(`📋 Found ${tiers.length} tiers to process`);

      // Process each tier
      for (const tier of tiers) {
        try {
          await this.setupSingleTierRole(guild, tier, results);
        } catch (error: any) {
          const errorMsg = `Failed to setup role for tier "${tier.name}": ${error?.message || error}`;
          logger.error(errorMsg);
          results.errors.push(errorMsg);
        }
      }

      // Summary
      logger.info('\n✨ Loyalty role setup completed!');
      logger.info(`✅ Created: ${results.created} roles`);
      logger.info(`🔄 Updated: ${results.updated} roles`);
      if (results.errors.length > 0) {
        logger.error(`❌ Errors: ${results.errors.length}`);
        results.errors.forEach((err) => logger.error(`   - ${err}`));
      }

      return results;
    } catch (error) {
      logger.error('❌ Fatal error during loyalty role setup:', error);
      throw error;
    }
  }

  /**
   * Setup a single tier role
   */
  private async setupSingleTierRole(
    guild: Guild,
    tier: any,
    results: { created: number; updated: number; errors: string[] }
  ): Promise<void> {
    const roleName = `${tier.emoji} ${tier.name}`;
    const roleColor = this.tierColors[tier.name] || 0x99aab5; // Default gray

    // Check if role already exists
    let existingRole: Role | undefined;

    // Method 1: Check by existing discordRoleId in database
    if (tier.discordRoleId) {
      existingRole = guild.roles.cache.get(tier.discordRoleId);
    }

    // Method 2: Check by role name (in case role exists but not linked)
    if (!existingRole) {
      existingRole = guild.roles.cache.find((r) => r.name === roleName);
    }

    if (existingRole) {
      // Role exists - update it
      logger.info(`🔄 Updating existing role: ${roleName}`);

      await existingRole.edit({
        name: roleName,
        color: roleColor,
        hoist: true, // Display members separately (hoisting)
        mentionable: false, // Don't allow @mentions
        position: this.calculateRolePosition(tier.sortOrder),
      });

      // Update database if role ID changed or wasn't set
      if (tier.discordRoleId !== existingRole.id) {
        await prisma.loyaltyTier.update({
          where: { id: tier.id },
          data: { discordRoleId: existingRole.id },
        });
        logger.info(`   ✅ Linked to database (Role ID: ${existingRole.id})`);
      }

      results.updated++;
    } else {
      // Role doesn't exist - create it
      logger.info(`➕ Creating new role: ${roleName}`);

      const newRole = await guild.roles.create({
        name: roleName,
        color: roleColor,
        hoist: true, // Display members separately
        mentionable: false,
        position: this.calculateRolePosition(tier.sortOrder),
        reason: `Automatic loyalty tier setup for ${tier.name}`,
      });

      logger.info(`   ✅ Created successfully (Role ID: ${newRole.id})`);

      // Save role ID to database
      await prisma.loyaltyTier.update({
        where: { id: tier.id },
        data: { discordRoleId: newRole.id },
      });

      logger.info(`   ✅ Linked to database`);
      results.created++;
    }

    logger.info(
      `   💰 Spending: $${tier.minSpending}+ → ${tier.discountPercent}% discount\n`
    );
  }

  /**
   * Calculate role position in Discord hierarchy
   * Higher sortOrder = higher position in Discord
   */
  private calculateRolePosition(sortOrder: number): number {
    // Position 1 is lowest, higher numbers are higher in hierarchy
    // We want GOAT (sortOrder 7) to be highest, Client (sortOrder 1) to be lowest
    // But we keep them relatively low (don't put above admin roles)
    return sortOrder + 5; // Offset to keep below important roles
  }

  /**
   * Remove loyalty roles from user (when switching tiers)
   */
  async removeAllLoyaltyRoles(userId: string, guildId: string): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);

      // Get all tier role IDs from database
      const tiers = await prisma.loyaltyTier.findMany({
        where: {
          isActive: true,
          discordRoleId: { not: null },
        },
        select: { discordRoleId: true },
      });

      const tierRoleIds = tiers
        .map((t: any) => t.discordRoleId)
        .filter((id: any): id is string => id !== null);

      if (tierRoleIds.length === 0) return;

      // Remove all loyalty tier roles from user
      await member.roles.remove(tierRoleIds);
      logger.info(`🧹 Removed all loyalty roles from ${member.user.tag}`);
    } catch (error) {
      logger.error(`Failed to remove loyalty roles from user ${userId}:`, error);
    }
  }

  /**
   * Assign loyalty role to user
   */
  async assignLoyaltyRole(
    userId: string,
    guildId: string,
    roleId: string
  ): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);

      // First remove all existing loyalty roles
      await this.removeAllLoyaltyRoles(userId, guildId);

      // Then add the new role
      await member.roles.add(roleId);
      logger.info(`✅ Assigned loyalty role ${roleId} to ${member.user.tag}`);
    } catch (error) {
      logger.error(`Failed to assign loyalty role to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get loyalty tier role by tier name
   */
  async getLoyaltyRole(tierName: string, guildId: string): Promise<Role | null> {
    try {
      const tier = await prisma.loyaltyTier.findUnique({
        where: { name: tierName },
      });

      if (!tier || !tier.discordRoleId) {
        return null;
      }

      const guild = await this.client.guilds.fetch(guildId);
      const role = guild.roles.cache.get(tier.discordRoleId);

      return role || null;
    } catch (error) {
      logger.error(`Failed to get loyalty role for tier "${tierName}":`, error);
      return null;
    }
  }

  /**
   * Verify all loyalty roles are properly configured
   */
  async verifyLoyaltyRoles(guildId: string): Promise<{
    configured: number;
    missing: string[];
    invalid: string[];
  }> {
    const result = {
      configured: 0,
      missing: [] as string[],
      invalid: [] as string[],
    };

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const tiers = await prisma.loyaltyTier.findMany({
        where: { isActive: true },
      });

      for (const tier of tiers) {
        if (!tier.discordRoleId) {
          result.missing.push(tier.name);
          continue;
        }

        const role = guild.roles.cache.get(tier.discordRoleId);
        if (!role) {
          result.invalid.push(tier.name);
          continue;
        }

        result.configured++;
      }

      return result;
    } catch (error) {
      logger.error('Failed to verify loyalty roles:', error);
      throw error;
    }
  }

  /**
   * Delete all loyalty roles (cleanup)
   * WARNING: This will remove roles from Discord AND database!
   */
  async cleanupLoyaltyRoles(guildId: string): Promise<number> {
    logger.warn('⚠️ Starting loyalty role cleanup...');

    let deleted = 0;

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const tiers = await prisma.loyaltyTier.findMany({
        where: {
          isActive: true,
          discordRoleId: { not: null },
        },
      });

      for (const tier of tiers) {
        try {
          const role = guild.roles.cache.get(tier.discordRoleId!);
          if (role) {
            await role.delete(`Cleanup loyalty tier role: ${tier.name}`);
            logger.info(`🗑️ Deleted role: ${tier.emoji} ${tier.name}`);
            deleted++;
          }

          // Clear role ID from database
          await prisma.loyaltyTier.update({
            where: { id: tier.id },
            data: { discordRoleId: null },
          });
        } catch (error) {
          logger.error(`Failed to delete role for tier "${tier.name}":`, error);
        }
      }

      logger.info(`✅ Cleanup completed. Deleted ${deleted} roles.`);
      return deleted;
    } catch (error) {
      logger.error('Failed to cleanup loyalty roles:', error);
      throw error;
    }
  }
}
