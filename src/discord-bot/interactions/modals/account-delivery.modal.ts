import { ModalSubmitInteraction, EmbedBuilder, ColorResolvable, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message } from "discord.js";
import logger from "../../../common/loggers";
import { ACCOUNT_MODAL_IDS, ACCOUNT_BUTTON_IDS, AccountComponentBuilder } from "../../utils/accountComponentBuilder";
import { AccountEmbedBuilder } from "../../utils/accountEmbedBuilder";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";

const apiService = new ApiService(discordConfig.apiBaseUrl);

/**
 * Handle the account delivery credentials modal submission
 * Modal ID format: account_delivery_modal_TICKETID_ACCOUNTID
 */
export async function handleAccountDeliveryModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        // Parse ticketId and accountId from modal customId
        // Format: account_delivery_modal_TICKETID_ACCOUNTID
        const modalIdParts = interaction.customId.replace(
            `${ACCOUNT_MODAL_IDS.DELIVERY_CREDENTIALS}_`,
            ""
        ).split("_");
        const ticketId = modalIdParts[0];
        const accountIdFromModal = modalIdParts[1] || null;

        logger.info(`[AccountDeliveryModal] Parsed from modal - ticketId: ${ticketId}, accountId: ${accountIdFromModal}`);

        // Get credentials from modal fields
        const email = interaction.fields.getTextInputValue("account_email");
        const password = interaction.fields.getTextInputValue("account_password");
        const bankPin = interaction.fields.getTextInputValue("account_bank_pin") || undefined;
        const additionalInfo = interaction.fields.getTextInputValue("account_additional_info") || undefined;

        // Get account data directly to get customer Discord ID from reservedBy
        let accountData: any = null;
        let customerDiscordId: string | null = null;
        let customerId: number = 0;
        let accountId: string | null = accountIdFromModal;

        if (accountIdFromModal) {
            try {
                // Fetch account details which includes reservedBy with discordId
                accountData = await apiService.getAccountById(accountIdFromModal);
                logger.info(`[AccountDeliveryModal] Fetched account data: ${JSON.stringify(accountData, null, 2)}`);

                if (accountData) {
                    // Get customer Discord ID from reservedBy relation
                    customerDiscordId = accountData.reservedBy?.discordId || null;
                    customerId = accountData.reservedById || accountData.reservedBy?.id || 0;
                    logger.info(`[AccountDeliveryModal] From account - customerDiscordId: ${customerDiscordId}, customerId: ${customerId}`);
                }
            } catch (err) {
                logger.warn(`[AccountDeliveryModal] Could not fetch account data: ${err}`);
            }
        }

        // Fallback: try to get from ticket data if account data didn't have it
        if (!customerDiscordId) {
            try {
                const ticketResponse = await apiService.getTicketById(ticketId);
                if (ticketResponse) {
                    customerDiscordId = ticketResponse.customerDiscordId || ticketResponse.customer?.discordId || null;
                    customerId = customerId || ticketResponse.customerId || ticketResponse.customer?.id || 0;
                    accountId = accountId || ticketResponse.accountId || ticketResponse.account?.id || null;
                    logger.info(`[AccountDeliveryModal] Fallback from ticket - customerDiscordId: ${customerDiscordId}, customerId: ${customerId}, accountId: ${accountId}`);
                }
            } catch (err) {
                logger.warn(`[AccountDeliveryModal] Could not fetch ticket data: ${err}`);
            }
        }

        logger.info(`[AccountDeliveryModal] Final values - accountId: ${accountId}, customerId: ${customerId}, customerDiscordId: ${customerDiscordId}`);

        if (accountId) {
            try {
                // Pass support's Discord ID (the staff member who is delivering)
                const supportDiscordId = interaction.user.id;
                logger.info(`[AccountDeliveryModal] Calling completeAccountSale for account ${accountId} with customerId ${customerId}, supportDiscordId ${supportDiscordId}`);
                const saleResult = await apiService.completeAccountSale(
                    accountId,
                    customerId,
                    undefined, // orderId not needed for account sales
                    supportDiscordId
                );
                logger.info(`[AccountDeliveryModal] Sale result: ${JSON.stringify(saleResult)}`);
                if (saleResult.success) {
                    logger.info(`[AccountDeliveryModal] Account ${accountId} marked as SOLD successfully`);
                } else {
                    logger.warn(`[AccountDeliveryModal] Could not mark account as SOLD: ${saleResult.error}`);
                }
            } catch (err) {
                logger.error(`[AccountDeliveryModal] Error completing sale: ${err}`);
            }
        } else {
            logger.warn(`[AccountDeliveryModal] No accountId found in ticket data, cannot mark as SOLD`);
        }

        // Mark ticket as delivered so it won't release account on close
        try {
            await apiService.markTicketDelivered(ticketId);
            logger.info(`[AccountDeliveryModal] Ticket ${ticketId} marked as DELIVERED`);
        } catch (err) {
            logger.warn(`[AccountDeliveryModal] Could not mark ticket as delivered: ${err}`);
        }

        // Create the delivery embed with credentials
        const deliveryEmbed = new EmbedBuilder()
            .setTitle("🔐 Account Credentials")
            .setDescription(
                "**Your account credentials are below. Please save them securely!**\n\n" +
                "⚠️ **Save these details immediately - keep them safe!**"
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

        let dmSent = false;

        // Try to DM credentials to customer
        if (customerDiscordId) {
            try {
                const customer = await interaction.client.users.fetch(customerDiscordId);
                await customer.send({
                    content: "🎉 **Your MORITA Gaming account purchase has been delivered!**",
                    embeds: [deliveryEmbed as any],
                });
                dmSent = true;
                logger.info(`[AccountDeliveryModal] Credentials sent via DM to ${customer.tag}`);
            } catch (dmError) {
                logger.warn(`[AccountDeliveryModal] Could not DM customer: ${dmError}`);
                dmSent = false;
            }
        }

        // Send confirmation to the channel
        if (dmSent) {
            await interaction.editReply({
                content: "✅ Account credentials delivered successfully via DM to the customer!",
            });

            // Notify in channel that credentials were sent via DM
            const channelNotifyEmbed = new EmbedBuilder()
                .setTitle("📬 Credentials Delivered")
                .setDescription(
                    `Account credentials have been sent via **Direct Message** to <@${customerDiscordId}>.\n\n` +
                    "Customer: Please check your DMs for your account credentials."
                )
                .setColor(0x2ecc71 as ColorResolvable)
                .setTimestamp()
                .setFooter({ text: "MORITA Gaming • Account Delivery" });

            await interaction.channel?.send({
                embeds: [channelNotifyEmbed as any],
            });

            // Disable staff buttons after successful delivery
            try {
                // Find and update the message with staff buttons
                const messages = await interaction.channel?.messages.fetch({ limit: 50 });
                if (messages) {
                    for (const [, msg] of messages) {
                        // Look for message with staff buttons (has account_deliver_ or account_confirm_payment_)
                        const hasStaffButtons = msg.components?.some(row =>
                            row.components?.some(comp =>
                                comp.customId?.includes('account_deliver_') ||
                                comp.customId?.includes('account_confirm_payment_')
                            )
                        );

                        if (hasStaffButtons && msg.editable) {
                            const disabledButtons = AccountComponentBuilder.createTicketStaffButtonsAfterDelivery(
                                ticketId,
                                accountId || ""
                            );
                            await msg.edit({
                                components: disabledButtons.map(row => row as any),
                            });
                            logger.info(`[AccountDeliveryModal] Disabled staff buttons after delivery`);
                            break;
                        }
                    }
                }
            } catch (btnErr) {
                logger.warn(`[AccountDeliveryModal] Could not disable staff buttons: ${btnErr}`);
            }
        } else {
            // DM failed - DO NOT post credentials in channel for security
            await interaction.editReply({
                content: "⚠️ Could not send credentials via DM. Customer may have DMs disabled.",
            });

            // Notify channel that DM failed - no credentials shown
            const dmFailedEmbed = new EmbedBuilder()
                .setTitle("⚠️ Delivery Issue")
                .setDescription(
                    `Could not send account credentials to <@${customerDiscordId}> via Direct Message.\n\n` +
                    "**Customer:** Please enable DMs from server members to receive your credentials, then ask staff to resend."
                )
                .setColor(0xf59e0b as ColorResolvable)
                .setTimestamp()
                .setFooter({ text: "MORITA Gaming • Account Delivery" });

            await interaction.channel?.send({
                content: customerDiscordId ? `<@${customerDiscordId}>` : "",
                embeds: [dmFailedEmbed as any],
            });

            // Don't send completion message since delivery wasn't successful
            logger.warn(`[AccountDeliveryModal] Could not DM credentials to customer ${customerDiscordId} - credentials NOT posted in channel`);
            return;
        }

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
