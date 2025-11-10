import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleHelpOrders(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const embed = EmbedBuilder.createHelpEmbed();
        embed.setDescription(
            "**📦 Orders Help**\n\nHow to create and manage orders"
        );
        embed.addFields(
            {
                name: "🛒 Creating Orders",
                value: 'Use `/order` or click "Order Now" from any service. Fill out the order form with your details.',
                inline: false,
            },
            {
                name: "📝 Order Details",
                value: "Provide your OSRS username, Discord tag, and any special notes or requirements.",
                inline: false,
            },
            {
                name: "🎫 Order Tickets",
                value: "After confirming your order, a private ticket will be created for you and our staff.",
                inline: false,
            },
            {
                name: "👷 Worker Assignment",
                value: "A qualified worker will be assigned to your order and will contact you in the ticket.",
                inline: false,
            },
            {
                name: "📊 Order Status",
                value: "Track your order progress: Pending → In Progress → Completed",
                inline: false,
            },
            {
                name: "💬 Communication",
                value: "All communication happens in your private ticket channel. Check it regularly for updates.",
                inline: false,
            }
        );

        await interaction.reply({
            embeds: [embed as any],
            ephemeral: true,
        });

        logger.info(`Orders help requested by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling help orders button:", error);
        await interaction.reply({
            content: "Failed to load help information. Please try again.",
            ephemeral: true,
        });
    }
}
