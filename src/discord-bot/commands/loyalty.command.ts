import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { discordApiClient } from '../clients/DiscordApiClient';
import logger from '../../common/loggers';

export const data = new SlashCommandBuilder()
  .setName('loyalty')
  .setDescription('Check your loyalty tier status and rewards');

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;

    const userResponse: any = await discordApiClient.get(`/discord/users/discord/${discordId}`);
    const user = userResponse.data || userResponse;

    if (!user) {
      await interaction.editReply({
        content: '❌ User not found. Please contact support.',
      });
      return;
    }

    const tierResponse: any = await discordApiClient.get(`/loyalty-tiers/user/${user.id}`);
    const tierData = tierResponse.data || tierResponse;

    const embed = new EmbedBuilder()
      .setTitle(`${tierData.currentTier?.emoji || '👤'} Your Loyalty Tier`)
      .setDescription(
        `**Current Tier:** ${tierData.currentTier?.name || 'None'}\n` +
          `**Total Spent:** $${tierData.totalSpent.toFixed(2)}\n` +
          `**Discount:** ${tierData.currentTier?.discountPercent || 0}% on all orders`
      )
      .setColor(tierData.currentTier ? 0xffd700 : 0x95a5a6)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setTimestamp();

    if (tierData.nextTier) {
      embed.addFields({
        name: '📈 Next Tier',
        value:
          `${tierData.nextTier.emoji} **${tierData.nextTier.name}**\n` +
          `Spend $${tierData.amountUntilNextTier.toFixed(2)} more to unlock ${
            tierData.nextTier.discountPercent
          }% discount!`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '🏆 Maximum Tier Reached!',
        value: "You've reached the highest loyalty tier. Thank you for your continued support!",
        inline: false,
      });
    }

    if (tierData.tierHistory && tierData.tierHistory.length > 0) {
      const recentHistory = tierData.tierHistory.slice(0, 3);
      const historyText = recentHistory
        .map((h: any) => {
          const date = new Date(h.changedAt).toLocaleDateString();
          return `• ${date}: ${h.tier.emoji} ${h.tier.name}`;
        })
        .join('\n');

      embed.addFields({
        name: '📜 Recent History',
        value: historyText || 'No tier history yet',
        inline: false,
      });
    }

    await interaction.editReply({
      embeds: [embed.toJSON() as any],
    });

    logger.info(`[Loyalty] Command executed by ${interaction.user.tag}`);
  } catch (error) {
    logger.error('[Loyalty] Error:', error);
    await interaction.editReply({
      content: '❌ Failed to fetch loyalty tier information. Please try again later.',
    });
  }
}
