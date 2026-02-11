import { Client, EmbedBuilder } from 'discord.js';
import { Service } from 'typedi';
import { LoyaltyRoleSetupService } from './loyalty-role-setup.service';
import logger from '../../common/loggers';
import { discordApiClient } from '../clients/DiscordApiClient';

@Service()
export class DiscordLoyaltyTierService {
  constructor(
    private client: Client,
    private loyaltyRoleSetupService: LoyaltyRoleSetupService
  ) {}

  async handleTierChange(
    userId: number,
    oldTierId: string | null,
    newTierId: string | null
  ): Promise<void> {
    try {
      const userResponse: any = await discordApiClient.get(`/discord/users/${userId}`);
      const user = userResponse.data || userResponse;

      if (!user || !user.discordId) {
        return;
      }

      const guildId = process.env.DISCORD_GUILD_ID;
      if (!guildId) {
        logger.error('[DiscordLoyaltyTier] DISCORD_GUILD_ID not configured');
        return;
      }

      let oldTier = null;
      let newTier = null;

      if (oldTierId) {
        try {
          const oldTierResponse: any = await discordApiClient.get(`/loyalty-tiers/${oldTierId}`);
          oldTier = oldTierResponse.data || oldTierResponse;
        } catch (error) {
          logger.warn(`[DiscordLoyaltyTier] Could not fetch old tier ${oldTierId}`);
        }
      }

      if (newTierId) {
        try {
          const newTierResponse: any = await discordApiClient.get(`/loyalty-tiers/${newTierId}`);
          newTier = newTierResponse.data || newTierResponse;
        } catch (error) {
          logger.warn(`[DiscordLoyaltyTier] Could not fetch new tier ${newTierId}`);
        }
      }

      if (newTier?.discordRoleId) {
        await this.loyaltyRoleSetupService.assignLoyaltyRole(
          user.discordId,
          guildId,
          newTier.discordRoleId
        );

        await this.sendTierUpgradeNotification(user.discordId, newTier, oldTier);
      } else if (oldTier) {
        await this.loyaltyRoleSetupService.removeAllLoyaltyRoles(user.discordId, guildId);
      }
    } catch (error) {
      logger.error('[DiscordLoyaltyTier] Error handling tier change:', error);
    }
  }

  private async sendTierUpgradeNotification(
    discordId: string,
    newTier: any,
    oldTier: any | null
  ): Promise<void> {
    const guild = await this.client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    const member = await guild.members.fetch(discordId);

    const embed = new EmbedBuilder()
      .setTitle(`🎉 Tier Upgrade: ${newTier.emoji} ${newTier.name}`)
      .setDescription(
        `Congratulations! You've been promoted to **${newTier.name}** tier!\n\n` +
          `✨ **Your New Discount:** ${newTier.discountPercent}% on all future orders\n\n` +
          (oldTier
            ? `You upgraded from ${oldTier.emoji} ${oldTier.name} (${oldTier.discountPercent}%)`
            : `Welcome to your first loyalty tier!`)
      )
      .setColor(0xffd700)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: 'Thank you for your continued support!' });

    await member.send({ embeds: [embed.toJSON() as any] }).catch(() => {});
  }
}
