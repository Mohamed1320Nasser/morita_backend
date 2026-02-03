import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { discordApiClient } from "../../clients/DiscordApiClient";
import logger from "../../../common/loggers";

// Standard field labels for display
const FIELD_LABELS: Record<string, string> = {
    username: "Username / Email",
    password: "Password",
    bank_pin: "Bank PIN",
    auth_codes: "Authenticator / Backup Codes",
    additional_info: "Additional Information",
};

export async function handleViewAccountData(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderId = interaction.customId.replace("view_account_data_", "");

        const canViewRes: any = await discordApiClient.get(
            `/account-data/order/${orderId}/can-view?discordId=${interaction.user.id}`
        );
        const canView = canViewRes.data || canViewRes;

        if (!canView.canView) {
            await interaction.editReply({ content: `❌ ${canView.reason}` });
            return;
        }

        const viewRes: any = await discordApiClient.post(`/account-data/order/${orderId}/view`, {
            viewerDiscordId: interaction.user.id,
        });
        const viewData = viewRes.data || viewRes;

        const embed = new EmbedBuilder()
            .setTitle(`🔐 Account Data - Order #${viewData.orderNumber}`)
            .setDescription("**⚠️ THIS DATA CAN ONLY BE VIEWED ONCE**")
            .setColor(0xed4245)
            .setTimestamp();

        for (const field of viewData.fields) {
            // Use proper label from FIELD_LABELS or fallback to field.label
            const displayLabel = FIELD_LABELS[field.fieldName] || field.label || field.fieldName;
            embed.addFields([
                {
                    name: displayLabel,
                    value: `\`\`\`${field.value}\`\`\``,
                    inline: false,
                },
            ]);
        }

        embed.addFields([
            { name: "Submitted By", value: `<@${viewData.submittedBy}>`, inline: true },
        ]);

        await interaction.editReply({ embeds: [embed.toJSON() as any] });

        // Update the original message to show claimed
        try {
            const message = interaction.message;
            if (message) {
                const claimedEmbed = new EmbedBuilder()
                    .setTitle("🔒 Account Data Claimed")
                    .setDescription(`Account data for **Order #${viewData.orderNumber}** has been viewed.`)
                    .addFields([
                        { name: "Claimed By", value: `<@${interaction.user.id}>`, inline: true },
                        { name: "Role", value: viewData.claimedByRole.charAt(0).toUpperCase() + viewData.claimedByRole.slice(1), inline: true },
                        { name: "Claimed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                    ])
                    .setColor(0x95a5a6)
                    .setTimestamp();

                await message.edit({
                    embeds: [claimedEmbed.toJSON() as any],
                    components: [],
                });
            }
        } catch (err) {
            logger.error("[ViewAccountData] Failed to update message:", err);
        }
    } catch (error: any) {
        logger.error("[ViewAccountData] Error:", error);
        const content = `❌ Failed: ${error?.response?.data?.message || error.message || "Unknown error"}`;
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content });
        } else {
            await interaction.reply({ content, ephemeral: true });
        }
    }
}
