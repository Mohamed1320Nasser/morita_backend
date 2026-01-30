import { ButtonInteraction, EmbedBuilder, ColorResolvable, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import {
    AccountEmbedBuilder,
    AccountCategory,
    AccountListItem,
    AccountDetail,
} from "../../utils/accountEmbedBuilder";
import {
    AccountComponentBuilder,
    ACCOUNT_BUTTON_IDS,
} from "../../utils/accountComponentBuilder";
import { getTicketService } from "../../services/ticket.service";

// Initialize API service
const apiService = new ApiService(discordConfig.apiBaseUrl);

/**
 * Handle "Browse Accounts" button click
 * Shows category selection with available counts
 */
export async function handleBrowseAccounts(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Fetch categories with counts
        const categories = await apiService.getAccountCategories();

        if (!categories || categories.length === 0) {
            await interaction.editReply({
                embeds: [AccountEmbedBuilder.createOutOfStockEmbed() as any],
            });
            return;
        }

        // Check if any accounts available
        const totalAvailable = categories.reduce(
            (sum: number, cat: AccountCategory) => sum + cat.availableCount,
            0
        );

        if (totalAvailable === 0) {
            await interaction.editReply({
                embeds: [AccountEmbedBuilder.createOutOfStockEmbed() as any],
            });
            return;
        }

        // Create category selection embed and dropdown
        const embed = AccountEmbedBuilder.createCategorySelectionEmbed(categories);
        const selectMenu = AccountComponentBuilder.createCategorySelectMenu(categories);

        await interaction.editReply({
            embeds: [embed as any],
            components: [selectMenu as any],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} browsing accounts (${totalAvailable} available)`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling browse_accounts:", error);

        const errorEmbed = AccountEmbedBuilder.createErrorEmbed(
            "Error",
            "Failed to load account categories. Please try again later."
        );

        if (interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed as any] });
        } else {
            await interaction.reply({ embeds: [errorEmbed as any], ephemeral: true });
        }
    }
}

/**
 * Handle "Back to Categories" button click
 */
export async function handleBackToCategories(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const categories = await apiService.getAccountCategories();

        if (!categories || categories.length === 0) {
            await interaction.editReply({
                embeds: [AccountEmbedBuilder.createOutOfStockEmbed() as any],
                components: [],
            });
            return;
        }

        const embed = AccountEmbedBuilder.createCategorySelectionEmbed(categories);
        const selectMenu = AccountComponentBuilder.createCategorySelectMenu(categories);

        await interaction.editReply({
            embeds: [embed as any],
            components: [selectMenu as any],
        });

        logger.info(`[AccountButtons] User ${interaction.user.tag} returned to categories`);
    } catch (error) {
        logger.error("[AccountButtons] Error handling back_to_categories:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "Failed to load categories. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle account page navigation buttons
 * Custom ID format: account_page_CATEGORY_PAGE
 */
export async function handleAccountPage(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const customId = interaction.customId;
        // Parse: account_page_MAIN_2
        const parts = customId.replace(ACCOUNT_BUTTON_IDS.ACCOUNT_PAGE, "").split("_");
        const category = parts[0];
        const page = parseInt(parts[1], 10);

        if (!category || isNaN(page)) {
            logger.warn(`[AccountButtons] Invalid page customId: ${customId}`);
            return;
        }

        const limit = 5;
        const result = await apiService.getAccountViewList(category, page, limit);

        if (!result || result.list.length === 0) {
            const backButton = AccountComponentBuilder.createPaginationButtons(category, 1, 1, 0);
            const components = backButton ? [backButton as any] : [];
            await interaction.editReply({
                embeds: [AccountEmbedBuilder.createOutOfStockEmbed(category) as any],
                components,
            });
            return;
        }

        const totalPages = Math.ceil(result.filterCount / limit);

        const embed = AccountEmbedBuilder.createAccountListEmbed(
            category,
            result.list,
            page,
            totalPages,
            result.filterCount
        );

        const selectMenu = AccountComponentBuilder.createAccountSelectMenu(result.list);
        const paginationButtons = AccountComponentBuilder.createPaginationButtons(
            category,
            page,
            totalPages,
            result.filterCount
        );

        const components = [selectMenu as any];
        if (paginationButtons) {
            components.push(paginationButtons as any);
        }

        await interaction.editReply({
            embeds: [embed as any],
            components,
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} viewing ${category} page ${page}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling account_page:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "Failed to load accounts. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle "View Details" button for a specific account
 * Custom ID format: account_view_ACCOUNTID
 */
export async function handleAccountView(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const accountId = interaction.customId.replace(
            ACCOUNT_BUTTON_IDS.ACCOUNT_VIEW,
            ""
        );

        const account = await apiService.getAccountDetail(accountId);

        if (!account) {
            await interaction.editReply({
                embeds: [
                    AccountEmbedBuilder.createErrorEmbed(
                        "Account Not Available",
                        "This account is no longer available. It may have been purchased by another customer."
                    ) as any,
                ],
                components: [],
            });
            return;
        }

        const embeds = AccountEmbedBuilder.createAccountDetailEmbeds(account);
        const buttons = AccountComponentBuilder.createAccountDetailButtons(
            accountId,
            account.category
        );

        await interaction.editReply({
            embeds: embeds.map(e => e as any),
            components: [buttons as any],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} viewing account ${account.name}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling account_view:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "Failed to load account details. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle "Back to List" button
 * Custom ID format: account_back_list_CATEGORY
 */
export async function handleBackToList(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const category = interaction.customId.replace(
            `${ACCOUNT_BUTTON_IDS.BACK_TO_LIST}_`,
            ""
        );

        const limit = 5;
        const result = await apiService.getAccountViewList(category, 1, limit);

        if (!result || result.list.length === 0) {
            const backButton = AccountComponentBuilder.createPaginationButtons(category, 1, 1, 0);
            const components = backButton ? [backButton as any] : [];
            await interaction.editReply({
                embeds: [AccountEmbedBuilder.createOutOfStockEmbed(category) as any],
                components,
            });
            return;
        }

        const totalPages = Math.ceil(result.filterCount / limit);

        const embed = AccountEmbedBuilder.createAccountListEmbed(
            category,
            result.list,
            1,
            totalPages,
            result.filterCount
        );

        const selectMenu = AccountComponentBuilder.createAccountSelectMenu(result.list);
        const paginationButtons = AccountComponentBuilder.createPaginationButtons(
            category,
            1,
            totalPages,
            result.filterCount
        );

        const components = [selectMenu as any];
        if (paginationButtons) {
            components.push(paginationButtons as any);
        }

        await interaction.editReply({
            embeds: [embed as any],
            components,
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} returned to ${category} list`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling back_to_list:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "Failed to load accounts. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle "Purchase This Account" button
 * Custom ID format: account_purchase_ACCOUNTID
 */
export async function handleAccountPurchase(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const accountId = interaction.customId.replace(
            ACCOUNT_BUTTON_IDS.ACCOUNT_PURCHASE,
            ""
        );

        const account = await apiService.getAccountDetail(accountId);

        if (!account) {
            await interaction.editReply({
                embeds: [
                    AccountEmbedBuilder.createErrorEmbed(
                        "Account Not Available",
                        "This account is no longer available. It may have been purchased by another customer."
                    ) as any,
                ],
                components: [],
            });
            return;
        }

        // Show purchase confirmation
        const embed = AccountEmbedBuilder.createPurchaseConfirmEmbed(account);
        const buttons = AccountComponentBuilder.createPurchaseConfirmButtons(accountId);

        await interaction.editReply({
            embeds: [embed as any],
            components: [buttons as any],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} initiating purchase for ${account.name}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling account_purchase:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "Failed to process purchase. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle "Cancel" button during purchase flow
 */
export async function handleAccountCancel(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        // Return to category selection
        const categories = await apiService.getAccountCategories();

        const embed = AccountEmbedBuilder.createCategorySelectionEmbed(categories);
        const selectMenu = AccountComponentBuilder.createCategorySelectMenu(categories);

        await interaction.editReply({
            embeds: [embed as any],
            components: [selectMenu as any],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} cancelled account purchase`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling account_cancel:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error",
                    "An error occurred. Please try again."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle "Confirm Purchase" button - Creates ticket and reserves account
 * Custom ID format: account_confirm_ACCOUNTID
 */
export async function handleAccountConfirm(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const accountId = interaction.customId.replace(
            ACCOUNT_BUTTON_IDS.ACCOUNT_CONFIRM,
            ""
        );

        // Fetch account details
        const account = await apiService.getAccountDetail(accountId);

        if (!account) {
            await interaction.editReply({
                embeds: [
                    AccountEmbedBuilder.createErrorEmbed(
                        "Account No Longer Available",
                        "We're sorry, but this account is no longer available. It may have been purchased by another customer.\n\nPlease browse our other available accounts."
                    ) as any,
                ],
                components: [],
            });
            return;
        }

        // Show processing state
        const processingEmbed = new EmbedBuilder()
            .setTitle("⏳ Creating Your Ticket...")
            .setDescription(
                "Please wait while we set up your purchase ticket and reserve the account for you."
            )
            .setColor(0xf1c40f as ColorResolvable)
            .setTimestamp();

        await interaction.editReply({
            embeds: [processingEmbed as any],
            components: [],
        });

        // Get ticket service and create ticket
        const ticketService = getTicketService(interaction.client);

        if (!interaction.guild) {
            await interaction.editReply({
                embeds: [
                    AccountEmbedBuilder.createErrorEmbed(
                        "Error",
                        "This action can only be performed in a server."
                    ) as any,
                ],
                components: [],
            });
            return;
        }

        // Create the account purchase ticket
        const { channel, ticket, reservationSuccess } = await ticketService.createAccountPurchaseTicket(
            interaction.guild,
            interaction.user,
            accountId,
            {
                name: account.name,
                price: account.price,
                category: account.category,
            }
        );

        // Success message with link to ticket channel
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Ticket Created Successfully!")
            .setDescription(
                `Your account purchase ticket has been created.\n\n` +
                `**Account:** ${account.name}\n` +
                `**Price:** $${account.price.toFixed(2)}\n\n` +
                (reservationSuccess
                    ? "✅ The account has been reserved for you for 30 minutes.\n\n"
                    : "⚠️ Note: Could not reserve the account. Please complete your purchase quickly.\n\n") +
                `Please head over to your ticket channel to complete the purchase:\n<#${channel.id}>`
            )
            .setColor(0x2ecc71 as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Account Purchase",
            });

        await interaction.editReply({
            embeds: [successEmbed as any],
            components: [],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} confirmed purchase for ${account.name} - Ticket #${ticket.ticketNumber}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling account_confirm:", error);
        await interaction.editReply({
            embeds: [
                AccountEmbedBuilder.createErrorEmbed(
                    "Error Creating Ticket",
                    "We encountered an error while creating your purchase ticket. Please try again or contact support."
                ) as any,
            ],
            components: [],
        });
    }
}

/**
 * Handle "Payment Sent" button in account purchase ticket
 * Custom ID format: account_payment_sent_TICKETID
 */
export async function handleAccountPaymentSent(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const ticketId = interaction.customId.replace(
            ACCOUNT_BUTTON_IDS.PAYMENT_SENT,
            ""
        );

        // Get ticket data to retrieve accountId
        let accountId = "";
        try {
            const ticketData = await apiService.getTicketById(ticketId);
            if (ticketData?.accountId) {
                accountId = ticketData.accountId;
            }
        } catch (err) {
            logger.warn(`[AccountButtons] Could not fetch ticket data: ${err}`);
        }

        // Notify staff that payment has been sent
        const notificationEmbed = new EmbedBuilder()
            .setTitle("💳 Payment Notification")
            .setDescription(
                `<@${interaction.user.id}> has marked their payment as sent.\n\n` +
                `**Staff Action Required:**\n` +
                `Please verify the payment and then deliver the account credentials.`
            )
            .setColor(0xf1c40f as ColorResolvable)
            .addFields({
                name: "📋 Status",
                value: "⏳ Awaiting Payment Verification",
                inline: false,
            })
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Payment Verification Needed",
            });

        // Staff action buttons with accountId from ticket
        const staffButtons = AccountComponentBuilder.createTicketStaffButtons(
            ticketId,
            accountId
        );

        await interaction.channel?.send({
            content: `<@&${discordConfig.supportRoleId}> Payment notification!`,
            embeds: [notificationEmbed as any],
            components: [staffButtons as any],
        });

        // Confirm to user
        await interaction.editReply({
            content: "✅ Your payment notification has been sent to our staff. They will verify your payment shortly.",
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} marked payment as sent for ticket ${ticketId}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling payment_sent:", error);
        await interaction.editReply({
            content: "❌ An error occurred while sending your payment notification. Please notify staff manually.",
        });
    }
}

/**
 * Handle "Cancel Order" button in account purchase ticket
 * Shows confirmation before actually cancelling
 * Custom ID format: account_cancel_order_TICKETID
 */
export async function handleAccountCancelOrder(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const ticketId = interaction.customId.replace(
            ACCOUNT_BUTTON_IDS.CANCEL_ORDER,
            ""
        );

        // Show confirmation embed with buttons
        const confirmEmbed = new EmbedBuilder()
            .setTitle("⚠️ Cancel Order?")
            .setDescription(
                "Are you sure you want to cancel this order?\n\n" +
                "**This action will:**\n" +
                "• Release the reserved account back to inventory\n" +
                "• Make the account available for other customers\n\n" +
                "**This action cannot be undone.**"
            )
            .setColor(0xf1c40f as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Confirm Cancellation",
            });

        const confirmButtons = AccountComponentBuilder.createCancelConfirmButtons(ticketId);

        await interaction.editReply({
            embeds: [confirmEmbed as any],
            components: [confirmButtons as any],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} viewing cancel confirmation for ticket ${ticketId}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling cancel_order:", error);
        await interaction.editReply({
            content: "❌ An error occurred. Please contact staff.",
        });
    }
}

/**
 * Handle confirmed cancel - actually cancels the order
 * Custom ID format: account_confirm_cancel_TICKETID
 */
export async function handleAccountConfirmCancel(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const ticketId = interaction.customId.replace(
            "account_confirm_cancel_",
            ""
        );

        // Get ticket data to retrieve accountId
        let accountId: string | null = null;
        let releaseSuccess = false;

        try {
            const ticketData = await apiService.getTicketById(ticketId);
            if (ticketData?.accountId) {
                const accId = ticketData.accountId as string;
                accountId = accId;
                // Release the account back to inventory
                const releaseResult = await apiService.releaseAccount(accId);
                releaseSuccess = releaseResult.success;
                if (releaseSuccess) {
                    logger.info(`[AccountButtons] Released account ${accId} back to inventory`);
                }
            }
        } catch (err) {
            logger.warn(`[AccountButtons] Could not release account: ${err}`);
        }

        const cancelEmbed = new EmbedBuilder()
            .setTitle("❌ Order Cancelled")
            .setDescription(
                `<@${interaction.user.id}> has cancelled their order.\n\n` +
                (releaseSuccess
                    ? "✅ The reserved account has been released back to inventory."
                    : accountId
                        ? "⚠️ Could not release the account automatically. Staff may need to release it manually."
                        : "The order has been cancelled.")
            )
            .setColor(0xe74c3c as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Order Cancelled",
            });

        // Update the ephemeral message to show cancellation completed
        await interaction.editReply({
            embeds: [cancelEmbed as any],
            components: [],
        });

        // Also post to the channel so everyone can see
        await interaction.channel?.send({
            embeds: [cancelEmbed as any],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} confirmed cancel for ticket ${ticketId}${accountId ? ` (Account: ${accountId}, Released: ${releaseSuccess})` : ''}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling confirm_cancel:", error);
        await interaction.editReply({
            content: "❌ An error occurred while cancelling your order. Please contact staff.",
            components: [],
        });
    }
}

/**
 * Handle "Keep Order" button - dismisses cancel confirmation
 * Custom ID format: account_keep_order_TICKETID
 */
export async function handleAccountKeepOrder(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        await interaction.editReply({
            content: "✅ Order cancellation aborted. Your order remains active.",
            embeds: [],
            components: [],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} chose to keep order`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling keep_order:", error);
    }
}

/**
 * Handle staff "Confirm Payment" button
 * Custom ID format: account_confirm_payment_TICKETID
 */
export async function handleAccountConfirmPayment(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const ticketId = interaction.customId.replace(
            "account_confirm_payment_",
            ""
        );

        const confirmEmbed = new EmbedBuilder()
            .setTitle("✅ Payment Confirmed")
            .setDescription(
                `Payment has been verified by <@${interaction.user.id}>.\n\n` +
                `**Next Step:** Click "Deliver Account" to send the account credentials to the customer.`
            )
            .setColor(0x2ecc71 as ColorResolvable)
            .addFields({
                name: "📋 Status",
                value: "✅ Payment Verified - Ready for Delivery",
                inline: false,
            })
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Payment Confirmed",
            });

        await interaction.editReply({
            embeds: [confirmEmbed as any],
        });

        logger.info(
            `[AccountButtons] Staff ${interaction.user.tag} confirmed payment for ticket ${ticketId}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling confirm_payment:", error);
        await interaction.editReply({
            content: "❌ An error occurred while confirming the payment.",
        });
    }
}

/**
 * Handle staff "Deliver Account" button - shows modal for credentials
 * Custom ID format: account_deliver_TICKETID_ACCOUNTID
 */
export async function handleAccountDeliver(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const parts = interaction.customId.split("_");
        const ticketId = parts[2];
        const accountId = parts[3];

        // Show the delivery credentials modal
        const modal = AccountComponentBuilder.createDeliveryCredentialsModal(
            ticketId,
            "Account" // We don't have the name here
        );

        await interaction.showModal(modal as any);

        logger.info(
            `[AccountButtons] Staff ${interaction.user.tag} opening delivery modal for ticket ${ticketId}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling account_deliver:", error);
        await interaction.reply({
            content: "❌ An error occurred while opening the delivery form.",
            ephemeral: true,
        });
    }
}

/**
 * Handle staff "Release Account" button - releases account back to inventory
 * Custom ID format: account_release_ACCOUNTID
 */
export async function handleAccountRelease(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const accountId = interaction.customId.replace(
            "account_release_",
            ""
        );

        // Release the account
        const result = await apiService.releaseAccount(accountId);

        if (result.success) {
            const releaseEmbed = new EmbedBuilder()
                .setTitle("🔓 Account Released")
                .setDescription(
                    `The account has been released back to inventory by <@${interaction.user.id}>.\n\n` +
                    `It is now available for other customers to purchase.`
                )
                .setColor(0x3498db as ColorResolvable)
                .setTimestamp()
                .setFooter({
                    text: "MORITA Gaming • Account Released",
                });

            await interaction.editReply({
                embeds: [releaseEmbed as any],
            });
        } else {
            await interaction.editReply({
                content: "❌ Failed to release the account. It may have already been released or sold.",
            });
        }

        logger.info(
            `[AccountButtons] Staff ${interaction.user.tag} released account ${accountId}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling account_release:", error);
        await interaction.editReply({
            content: "❌ An error occurred while releasing the account.",
        });
    }
}

/**
 * Handle "Confirm Receipt" button after delivery
 * Custom ID format: account_confirm_delivery_TICKETID
 */
export async function handleAccountConfirmDelivery(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const ticketId = interaction.customId.replace(
            ACCOUNT_BUTTON_IDS.CONFIRM_DELIVERY,
            ""
        );

        const confirmEmbed = new EmbedBuilder()
            .setTitle("✅ Receipt Confirmed")
            .setDescription(
                `<@${interaction.user.id}> has confirmed receipt of the account credentials.\n\n` +
                `**Thank you for your purchase!**\n\n` +
                `If you have any issues with the account, please contact support immediately.`
            )
            .setColor(0x2ecc71 as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Receipt Confirmed",
            });

        await interaction.editReply({
            embeds: [confirmEmbed as any],
        });

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} confirmed receipt for ticket ${ticketId}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling confirm_delivery:", error);
        await interaction.editReply({
            content: "❌ An error occurred. Please contact support if you have any issues.",
        });
    }
}

/**
 * Handle "Close Ticket" button
 * Custom ID format: account_close_ticket_TICKETID
 */
export async function handleAccountCloseTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const ticketId = interaction.customId.replace(
            ACCOUNT_BUTTON_IDS.CLOSE_TICKET,
            ""
        );

        // Get ticket service
        const ticketService = getTicketService(interaction.client);

        if (!interaction.guild || !interaction.channel) {
            await interaction.editReply({
                content: "❌ This action can only be performed in a server channel.",
            });
            return;
        }

        // Close the ticket
        const closeEmbed = new EmbedBuilder()
            .setTitle("📋 Ticket Closing")
            .setDescription(
                `This ticket is being closed by <@${interaction.user.id}>.\n\n` +
                `**Thank you for choosing MORITA Gaming!**\n\n` +
                `This channel will be archived shortly.`
            )
            .setColor(0x95a5a6 as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Ticket Closed",
            });

        await interaction.editReply({
            embeds: [closeEmbed as any],
        });

        // Archive the channel after a short delay
        setTimeout(async () => {
            try {
                if (interaction.channel && 'setArchived' in interaction.channel) {
                    // It's a thread, archive it
                    await (interaction.channel as any).setArchived(true);
                } else if (interaction.channel && 'delete' in interaction.channel) {
                    // It's a regular channel, we could delete it or just leave it
                    // For safety, we'll just send a final message
                    await interaction.channel.send({
                        content: "🔒 This ticket has been closed. Contact support to reopen if needed.",
                    });
                }
            } catch (err) {
                logger.warn(`[AccountButtons] Could not archive/close channel: ${err}`);
            }
        }, 3000);

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} closed ticket ${ticketId}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling close_ticket:", error);
        await interaction.editReply({
            content: "❌ An error occurred while closing the ticket. Please try again or contact support.",
        });
    }
}

/**
 * Handle "Leave Review" button (public or anonymous)
 * Custom ID format: account_public_review_TICKETID or account_anonymous_review_TICKETID
 */
export async function handleAccountLeaveReview(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const customId = interaction.customId;
        let ticketId: string;
        let isAnonymous = false;

        if (customId.startsWith("account_public_review_")) {
            ticketId = customId.replace("account_public_review_", "");
            isAnonymous = false;
        } else if (customId.startsWith("account_anonymous_review_")) {
            ticketId = customId.replace("account_anonymous_review_", "");
            isAnonymous = true;
        } else {
            ticketId = customId.replace(`${ACCOUNT_BUTTON_IDS.LEAVE_REVIEW}`, "");
            isAnonymous = false;
        }

        // Create review modal
        const modal = new ModalBuilder()
            .setCustomId(`account_review_${isAnonymous ? 'anon' : 'public'}_${ticketId}`)
            .setTitle(isAnonymous ? "Anonymous Review" : "Leave a Review");

        const ratingInput = new TextInputBuilder()
            .setCustomId("rating")
            .setLabel("Rating (1-5 stars)")
            .setPlaceholder("Enter a number from 1 to 5")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(1);

        const reviewInput = new TextInputBuilder()
            .setCustomId("review")
            .setLabel("Review (optional)")
            .setPlaceholder("Share your experience with this purchase...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(ratingInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(reviewInput)
        );

        await interaction.showModal(modal as any);

        logger.info(
            `[AccountButtons] User ${interaction.user.tag} opening ${isAnonymous ? 'anonymous' : 'public'} review modal for ticket ${ticketId}`
        );
    } catch (error) {
        logger.error("[AccountButtons] Error handling leave_review:", error);
        await interaction.reply({
            content: "❌ An error occurred while opening the review form. Please try again.",
            ephemeral: true,
        });
    }
}
