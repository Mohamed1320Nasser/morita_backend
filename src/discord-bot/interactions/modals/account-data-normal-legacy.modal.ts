import {
    ModalSubmitInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { discordApiClient } from "../../clients/DiscordApiClient";
import logger from "../../../common/loggers";

export async function handleAccountDataNormalLegacyModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // customId format: account_data_modal_normal_legacy_{orderId}
        const orderId = interaction.customId.replace("account_data_modal_normal_legacy_", "").substring(0, 36);

        logger.info(`[AccountDataNormalLegacyModal] Parsed - orderId: ${orderId}`);

        // Collect all field values from the Normal Legacy form
        const accountData: Record<string, string> = {};
        const fieldNames = ["username", "password", "bank_pin", "bank_value"];

        for (const fieldName of fieldNames) {
            try {
                const value = interaction.fields.getTextInputValue(fieldName);
                if (value && value.trim()) {
                    accountData[fieldName] = value.trim();
                }
            } catch {}
        }

        if (!accountData.username || !accountData.password) {
            await interaction.editReply({ content: "❌ Username and Password are required." });
            return;
        }

        const submitRes: any = await discordApiClient.post(`/account-data/order/${orderId}/submit`, {
            accountType: "normal_legacy",
            data: accountData,
            submittedBy: interaction.user.id,
        });

        const orderRes: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const order = orderRes.data || orderRes;

        const embed = new EmbedBuilder()
            .setTitle("✅ Account Data Submitted")
            .setDescription(
                `Your **Normal Legacy** account data has been securely submitted for **Order #${order.orderNumber}**.\n\n` +
                `The worker or support will be able to view this data **one time only**.`
            )
            .addFields([
                { name: "Account Type", value: "📦 Normal Legacy", inline: true },
                { name: "Fields Submitted", value: Object.keys(accountData).length.toString(), inline: true },
            ])
            .setColor(0x57f287)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed.toJSON() as any] });

        try {
            if (interaction.channel) {
                // Find and disable the original account type selection buttons
                const messages = await interaction.channel.messages.fetch({ limit: 50 });
                for (const [, msg] of messages) {
                    if (msg.author.id === interaction.client.user?.id) {
                        const hasAccountTypeButtons = msg.components.some(row =>
                            row.components.some(comp =>
                                comp.customId === `submit_account_normal_legacy_${orderId}` ||
                                comp.customId === `submit_account_jagex_launcher_${orderId}`
                            )
                        );
                        if (hasAccountTypeButtons) {
                            const disabledEmbed = new EmbedBuilder()
                                .setTitle("✅ Account Data Submitted")
                                .setDescription(`**Normal Legacy** account data has been submitted for **Order #${order.orderNumber}**.`)
                                .setColor(0x57f287)
                                .setTimestamp();

                            await msg.edit({
                                content: msg.content,
                                embeds: [disabledEmbed.toJSON() as any],
                                components: [],
                            });
                            break;
                        }
                    }
                }

                // Send notification with View button
                const notifyEmbed = new EmbedBuilder()
                    .setTitle("🔐 Account Data Submitted")
                    .setDescription(`<@${interaction.user.id}> has submitted their **Normal Legacy** account data for **Order #${order.orderNumber}**.`)
                    .addFields([
                        { name: "Status", value: "🔓 Ready to view", inline: true },
                        { name: "Account Type", value: "📦 Normal Legacy", inline: true },
                    ])
                    .setColor(0x57f287)
                    .setTimestamp();

                const viewButton = new ButtonBuilder()
                    .setCustomId(`view_account_data_${orderId}`)
                    .setLabel("👁️ View Account Data")
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(viewButton);

                await interaction.channel.send({
                    embeds: [notifyEmbed.toJSON() as any],
                    components: [row.toJSON() as any],
                });
            }
        } catch (err) {
            logger.error("[AccountDataNormalLegacyModal] Failed to send notification:", err);
        }
    } catch (error: any) {
        logger.error("[AccountDataNormalLegacyModal] Error:", error);
        const content = `❌ Failed: ${error?.response?.data?.message || error.message || "Unknown error"}`;
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content });
        } else {
            await interaction.reply({ content, ephemeral: true });
        }
    }
}
