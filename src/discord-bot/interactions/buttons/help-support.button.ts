import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleHelpSupport(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const embed = EmbedBuilder.createHelpEmbed();
        embed.setDescription(
            "**🆘 Support Help**\n\nHow to get help and contact our support team"
        );
        embed.addFields(
            {
                name: "🎫 Support Tickets",
                value: "Use `/ticket` to create a support ticket for custom requests or general help.",
                inline: false,
            },
            {
                name: "❓ Common Issues",
                value: "• Service not working? Check if it's available in the services list\n• Pricing seems wrong? Try recalculating with different options\n• Order not progressing? Check your ticket channel",
                inline: false,
            },
            {
                name: "💬 Getting Help",
                value: "• Use the help buttons for specific topics\n• Check your ticket channel for order updates\n• Contact staff directly in your ticket if needed",
                inline: false,
            },
            {
                name: "⏰ Response Times",
                value: "• General questions: Within 1 hour\n• Order issues: Within 30 minutes\n• Urgent problems: Use @Staff mention",
                inline: false,
            },
            {
                name: "🔧 Technical Issues",
                value: "If the bot is not responding, try:\n• Refreshing Discord\n• Using commands in a different channel\n• Contacting an admin directly",
                inline: false,
            }
        );

        await interaction.reply({
            embeds: [embed as any],
            ephemeral: true,
        });

        logger.info(`Support help requested by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling help support button:", error);
        await interaction.reply({
            content: "Failed to load help information. Please try again.",
            ephemeral: true,
        });
    }
}
