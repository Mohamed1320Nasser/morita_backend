import { ModalSubmitInteraction, EmbedBuilder, ColorResolvable, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import logger from "../../../common/loggers";
import { ACCOUNT_MODAL_IDS, ACCOUNT_BUTTON_IDS } from "../../utils/accountComponentBuilder";
import { AccountEmbedBuilder } from "../../utils/accountEmbedBuilder";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";

const apiService = new ApiService(discordConfig.apiBaseUrl);

/**
 * Handle the account delivery credentials modal submission
 * Modal ID format: account_delivery_modal_TICKETID
 */
export async function handleAccountDeliveryModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const ticketId = interaction.customId.replace(
            `${ACCOUNT_MODAL_IDS.DELIVERY_CREDENTIALS}_`,
            ""
        );

        // Get credentials from modal fields
        const email = interaction.fields.getTextInputValue("account_email");
        const password = interaction.fields.getTextInputValue("account_password");
        const bankPin = interaction.fields.getTextInputValue("account_bank_pin") || undefined;
        const additionalInfo = interaction.fields.getTextInputValue("account_additional_info") || undefined;

        // Get ticket data to retrieve accountId and customer info
        let ticketData: any = null;
        let accountId: string | null = null;

        try {
            const ticketResponse = await apiService.getTicketById(ticketId);
            if (ticketResponse) {
                ticketData = ticketResponse;
                accountId = ticketData.accountId;
            }
        } catch (err) {
            logger.warn(`[AccountDeliveryModal] Could not fetch ticket data: ${err}`);
        }

        // Mark account as SOLD if we have accountId
        if (accountId) {
            try {
                const saleResult = await apiService.completeAccountSale(
                    accountId,
                    ticketData?.customerId || 0,
                    ticketData?.orderId
                );
                if (saleResult.success) {
                    logger.info(`[AccountDeliveryModal] Account ${accountId} marked as SOLD`);
                } else {
                    logger.warn(`[AccountDeliveryModal] Could not mark account as SOLD: ${saleResult.error}`);
                }
            } catch (err) {
                logger.warn(`[AccountDeliveryModal] Error completing sale: ${err}`);
            }
        }

        // Create the delivery embed with credentials
        const deliveryEmbed = new EmbedBuilder()
            .setTitle("🔐 Account Credentials")
            .setDescription(
                "**Your account credentials are below. Please save them securely!**\n\n" +
                "⚠️ **This message will NOT be repeated. Screenshot or save these details immediately.**"
            )
            .setColor(0xc9a961 as ColorResolvable)
            .addFields(
                {
                    name: "📧 Email/Username",
                    value: `\`\`\`${email}\`\`\``,
                    inline: false,
                },
                {
                    name: "🔑 Password",
                    value: `\`\`\`${password}\`\`\``,
                    inline: false,
                }
            );

        if (bankPin) {
            deliveryEmbed.addFields({
                name: "🏦 Bank PIN",
                value: `\`\`\`${bankPin}\`\`\``,
                inline: false,
            });
        }

        if (additionalInfo) {
            deliveryEmbed.addFields({
                name: "📝 Additional Info",
                value: additionalInfo,
                inline: false,
            });
        }

        deliveryEmbed
            .setTimestamp()
            .setFooter({ text: "MORITA Gaming • Account Delivery" });

        // Send the credentials to the channel
        await interaction.editReply({
            content: "✅ Account credentials delivered successfully!",
        });

        // Send credentials in a separate message
        await interaction.channel?.send({
            embeds: [deliveryEmbed as any],
        });

        // Send completion message with security checklist
        const completionEmbed = new EmbedBuilder()
            .setTitle("🎉 Order Complete!")
            .setDescription(
                "This account purchase has been completed successfully.\n\n" +
                "**Customer:** Please save your credentials and follow the security checklist below.\n\n" +
                "Thank you for choosing MORITA Gaming!"
            )
            .setColor(0x2ecc71 as ColorResolvable)
            .addFields(
                {
                    name: "🔒 Security Checklist",
                    value:
                        "```\n" +
                        "☐ Change password immediately\n" +
                        "☐ Set up Authenticator (2FA)\n" +
                        "☐ Change registered email\n" +
                        "☐ Change bank PIN\n" +
                        "☐ Remove any linked accounts\n" +
                        "```",
                    inline: false,
                },
                {
                    name: "⚠️ Important",
                    value: "Complete all security steps within 24 hours to ensure account safety.",
                    inline: false,
                }
            )
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Thank you for your purchase!",
            });

        // Post-delivery buttons - first row with confirm and close
        const postDeliveryButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.CONFIRM_DELIVERY}${ticketId}`)
                .setLabel("✅ Confirm Receipt")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`${ACCOUNT_BUTTON_IDS.CLOSE_TICKET}${ticketId}`)
                .setLabel("📋 Close Ticket")
                .setStyle(ButtonStyle.Secondary)
        );

        // Review buttons - second row with public and anonymous review options
        const reviewButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`account_public_review_${ticketId}`)
                .setLabel("⭐ Public Review")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`account_anonymous_review_${ticketId}`)
                .setLabel("⭐ Anonymous Review")
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel?.send({
            embeds: [completionEmbed as any],
            components: [postDeliveryButtons as any, reviewButtons as any],
        });

        logger.info(
            `[AccountDeliveryModal] Staff ${interaction.user.tag} delivered account for ticket ${ticketId}${accountId ? ` (Account: ${accountId})` : ''}`
        );
    } catch (error) {
        logger.error("[AccountDeliveryModal] Error handling delivery modal:", error);

        if (interaction.deferred && !interaction.replied) {
            await interaction.editReply({
                content: "❌ An error occurred while delivering the account credentials. Please try again.",
            });
        } else {
            await interaction.reply({
                content: "❌ An error occurred while delivering the account credentials. Please try again.",
                ephemeral: true,
            });
        }
    }
}
