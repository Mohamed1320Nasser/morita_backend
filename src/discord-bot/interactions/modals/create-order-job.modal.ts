import { ModalSubmitInteraction, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { createJobClaimingEmbed, createClaimButton } from "../../utils/jobClaimingEmbed";
import { getOrderChannelService } from "../../services/orderChannel.service";
import { extractErrorMessage, isInsufficientBalanceError } from "../../utils/error-message.util";

// Temporary storage for order data (in production, use Redis or database)
const orderDataCache = new Map<string, any>();

export function storeOrderData(key: string, data: any) {
    orderDataCache.set(key, data);
    // Auto-cleanup after 10 minutes
    setTimeout(() => orderDataCache.delete(key), 600000);
}

export async function handleCreateOrderJobModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    // Defer reply IMMEDIATELY to prevent timeout
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (deferError) {
        logger.error("[CreateOrderJob] Failed to defer:", deferError);
        return;
    }

    try {
        // Parse custom ID: create_order_job_order_{customerId}_{timestamp}
        const orderKey = interaction.customId.replace("create_order_job_", "");

        // Get job details from modal BEFORE any async operations
        const jobDetails = interaction.fields.getTextInputValue("job_details").trim() || null;

        // Get stored order data
        const orderData = orderDataCache.get(orderKey);

        if (!orderData) {
            await interaction.editReply({
                content: `❌ **Order data expired**\n\nPlease try creating the order again.`,
            });
            return;
        }

        // Delete from cache
        orderDataCache.delete(orderKey);

        logger.info(`[CreateOrderJob] Processing order for customer ${orderData.customerDiscordId}`);

        // Fetch ticket for this channel (moved from command to avoid timeout)
        let ticketId = orderData.ticketId; // May be null if not fetched yet
        if (!ticketId && orderData.channelId) {
            try {
                logger.info(`[CreateOrderJob] Fetching ticket for channel ${orderData.channelId}`);
                const ticketResponse = await discordApiClient.get(`/api/discord/tickets/channel/${orderData.channelId}`);
                const ticketData = ticketResponse.data.data?.data || ticketResponse.data.data || ticketResponse.data;
                if (ticketData && ticketData.id) {
                    ticketId = ticketData.id;
                    logger.info(`[CreateOrderJob] Found ticket ${ticketId} for channel ${orderData.channelId}`);
                } else {
                    logger.warn(`[CreateOrderJob] No ticket found for channel ${orderData.channelId}`);
                }
            } catch (err: any) {
                logger.error(`[CreateOrderJob] Failed to fetch ticket for channel:`, err);
                // If error is 404, channel is not a ticket channel - but don't fail the order
                if (err?.response?.status === 404 || err?.status === 404) {
                    logger.warn(`[CreateOrderJob] Channel ${orderData.channelId} is not a ticket channel`);
                } else {
                    logger.warn(`[CreateOrderJob] Proceeding without ticket association due to API error`);
                }
            }
        }

        // Check customer wallet balance
        const balanceResponse: any = await discordApiClient.get(
            `/discord/wallets/balance/${orderData.customerDiscordId}`
        );

        // HttpClient interceptor already unwrapped one level
        const responseData = balanceResponse.data || balanceResponse;
        const balanceData = responseData.data || responseData;

        if (!balanceData.hasWallet) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Customer Has No Wallet")
                .setDescription(
                    `Customer <@${orderData.customerDiscordId}> does not have a wallet yet.\n\n` +
                    `**Please add balance first using /add-balance**`
                )
                .setColor(0xed4245)
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed.toJSON() as any],
            });
            return;
        }

        const availableBalance = balanceData.balance - balanceData.pendingBalance;

        // Check if customer has sufficient balance
        if (availableBalance < orderData.deposit) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Insufficient Balance")
                .setDescription(
                    `Customer <@${orderData.customerDiscordId}> has insufficient balance.\n\n` +
                    `**Required:** $${orderData.deposit.toFixed(2)}\n` +
                    `**Available:** $${availableBalance.toFixed(2)}\n\n` +
                    `Please add more balance using /add-balance first.`
                )
                .setColor(0xed4245)
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed.toJSON() as any],
            });
            return;
        }

        // Create the order
        const createOrderData = {
            customerDiscordId: orderData.customerDiscordId,
            workerDiscordId: orderData.workerDiscordId,
            supportDiscordId: orderData.supportDiscordId,
            ticketId: ticketId || null, // Use the ticketId we just fetched
            serviceId: null,
            methodId: null,
            paymentMethodId: null,
            orderValue: orderData.orderValue,
            depositAmount: orderData.deposit,
            currency: orderData.currency,
            jobDetails: jobDetails ? { description: jobDetails } : null,
        };

        logger.info(`[CreateOrderJob] Creating order with ticketId: ${ticketId || 'NULL'}`);
        logger.info(`[CreateOrderJob] Order data:`, createOrderData);

        const response: any = await discordApiClient.post("/discord/orders/create", createOrderData);

        logger.info(`[CreateOrderJob] Raw API Response: ${JSON.stringify(response)}`);

        // Handle triple-nested response structure (similar to add-balance command)
        // HttpClient interceptor already unwrapped one level
        const outerData = response.data || response;
        const order = outerData.data || outerData;

        logger.info(`[CreateOrderJob] Extracted - OrderNumber: ${order.orderNumber}, OrderId: ${order.orderId || order.id}, Status: ${order.status}`);

        // Extract order properties
        const orderNumber = order.orderNumber;
        const orderId = order.orderId || order.id;
        const orderStatus = order.status || "PENDING";

        if (!orderNumber) {
            logger.error(`[CreateOrderJob] OrderNumber is missing from response!`);
            logger.error(`[CreateOrderJob] Full response:`, response);
        }
        if (!orderId) {
            logger.error(`[CreateOrderJob] OrderId is missing from response!`);
            logger.error(`[CreateOrderJob] Full response:`, response);
        }

        // Send confirmation embed
        const confirmEmbed = new EmbedBuilder()
            .setTitle("✅ Order Created Successfully")
            .setDescription(
                orderNumber ? `Order #${orderNumber} has been created!` : `Order has been created!`
            )
            .addFields([
                { name: "👤 Customer", value: `<@${orderData.customerDiscordId}>`, inline: true },
                {
                    name: "👷 Worker",
                    value: orderData.workerDiscordId ? `<@${orderData.workerDiscordId}>` : "⏳ Unassigned (Job Claiming)",
                    inline: true,
                },
                { name: "💰 Order Value", value: `$${orderData.orderValue.toFixed(2)} ${orderData.currency}`, inline: true },
                { name: "🔒 Deposit Locked", value: `$${orderData.deposit.toFixed(2)} ${orderData.currency}`, inline: true },
                { name: "📊 Status", value: orderStatus, inline: true },
                { name: "💵 Available Balance", value: `$${(availableBalance - orderData.deposit).toFixed(2)} ${orderData.currency}`, inline: true },
            ])
            .setColor(orderData.workerDiscordId ? 0x57f287 : 0xf59e0b)
            .setTimestamp()
            .setFooter({
                text: orderNumber
                    ? `Order #${orderNumber} • ID: ${orderId}`
                    : `Order ID: ${orderId}`
            });

        if (jobDetails) {
            confirmEmbed.addFields([
                {
                    name: "📋 Job Details",
                    value: jobDetails.substring(0, 1024), // Discord field limit
                },
            ]);
        }

        // If no worker assigned, post to job claiming channel
        if (!orderData.workerDiscordId) {
            confirmEmbed.addFields([
                {
                    name: "ℹ️ Next Steps",
                    value:
                        "This order has been posted to the job claiming channel.\n" +
                        "Workers with sufficient balance can claim it.",
                },
            ]);

            // Post to job claiming channel
            try {
                if (discordConfig.jobClaimingChannelId) {
                    logger.info(`[CreateOrderJob] Posting job to claiming channel - Order #${orderNumber}, ID: ${orderId}, Value: $${orderData.orderValue}, Deposit: $${orderData.deposit}`);

                    const claimingChannel = await interaction.client.channels.fetch(
                        discordConfig.jobClaimingChannelId
                    ) as TextChannel;

                    if (claimingChannel) {
                        const jobClaimingEmbed = createJobClaimingEmbed({
                            orderId,
                            orderNumber,
                            orderValue: orderData.orderValue,
                            depositAmount: orderData.deposit,
                            currency: orderData.currency,
                            jobDetails: jobDetails || undefined,
                            customerDiscordId: orderData.customerDiscordId,
                        });

                        const claimButton = createClaimButton(orderId);

                        const claimMessage = await claimingChannel.send({
                            content: `<@&${discordConfig.workersRoleId}>`, // Mention all workers
                            embeds: [jobClaimingEmbed.toJSON() as any],
                            components: [claimButton.toJSON() as any],
                        });

                        logger.info(`[CreateOrderJob] Job posted to claiming channel, message ID: ${claimMessage.id}`);
                    }
                } else {
                    logger.warn(`[CreateOrderJob] Job claiming channel ID not configured`);
                }
            } catch (err: any) {
                logger.error(`[CreateOrderJob] Failed to post to job claiming channel:`, err);
                // Don't fail the order creation if posting to claiming channel fails
            }
        } else {
            // Worker is assigned directly - add worker to ticket channel
            confirmEmbed.addFields([
                {
                    name: "ℹ️ Next Steps",
                    value:
                        `Worker <@${orderData.workerDiscordId}> has been assigned.\n` +
                        `Worker will be added to this ticket channel for communication.`,
                },
            ]);

            logger.info(`[CreateOrderJob] Worker assigned directly, adding to ticket channel...`);

            try {
                // Order should have the ticket from creation (ticketId is passed in orderData)
                // The channel ID is available from orderData.channelId (the ticket channel)
                if (orderData.channelId) {
                    const orderChannelService = getOrderChannelService(interaction.client);
                    const ticketChannel = await orderChannelService.addWorkerToTicketChannel({
                        ticketChannelId: orderData.channelId,
                        workerDiscordId: orderData.workerDiscordId,
                        orderNumber,
                        orderId,
                        orderValue: orderData.orderValue,
                        depositAmount: orderData.deposit,
                        currency: orderData.currency,
                        customerDiscordId: orderData.customerDiscordId,
                        serviceName: order.service?.name,
                        jobDetails: jobDetails || undefined,
                        status: order.status,
                    });

                    if (ticketChannel) {
                        logger.info(`[CreateOrderJob] Worker added to ticket channel: ${ticketChannel.name}`);

                        // Add channel link to confirmation embed
                        confirmEmbed.addFields([
                            {
                                name: "📁 Ticket Channel",
                                value: `<#${ticketChannel.id}>`,
                                inline: false,
                            }
                        ]);
                    }
                } else {
                    logger.warn(`[CreateOrderJob] No channel ID available to add worker to`);
                }
            } catch (err: any) {
                logger.error(`[CreateOrderJob] Failed to add worker to ticket channel:`, err);
            }
        }

        // Log embed details
        logger.info(`[CreateOrderJob] Preparing to send order confirmation embed`);

        // Send to ticket channel
        if (orderData.channelId) {
            try {
                logger.info(`[CreateOrderJob] Attempting to send to channel ${orderData.channelId}`);
                const channel = await interaction.client.channels.fetch(orderData.channelId);
                if (channel && "send" in channel) {
                    logger.info(`[CreateOrderJob] Sending embed to channel...`);
                    await (channel as any).send({
                        embeds: [confirmEmbed.toJSON() as any],
                    });
                    logger.info(`[CreateOrderJob] Successfully sent to channel`);
                }
            } catch (err: any) {
                logger.error(`[CreateOrderJob] Failed to send to channel ${orderData.channelId}:`, err);
                if (err?.rawError) {
                    logger.error(`[CreateOrderJob] Channel send Discord API error:`, err.rawError);
                }
            }
        }

        // Send confirmation to support
        logger.info(`[CreateOrderJob] Attempting to send confirmation to support...`);
        try {
            await interaction.editReply({
                content: orderNumber
                    ? `✅ Order #${orderNumber} created successfully!`
                    : `✅ Order created successfully!`,
                embeds: [confirmEmbed.toJSON() as any],
            });
            logger.info(`[CreateOrderJob] Successfully sent confirmation to support`);
        } catch (err: any) {
            logger.error(`[CreateOrderJob] Failed to send confirmation to support:`, err);
            if (err?.rawError) {
                logger.error(`[CreateOrderJob] EditReply Discord API error:`, err.rawError);
            }
            if (err?.errors) {
                logger.error(`[CreateOrderJob] EditReply validation errors:`, err.errors);
            }
            throw err; // Re-throw to be caught by outer catch
        }

        logger.info(
            `Order ${orderNumber ? `#${orderNumber}` : orderId} created by ${orderData.supportDiscordId} for customer ${orderData.customerDiscordId}`
        );
    } catch (error: any) {
        logger.error("[CreateOrderJob] Error handling create order job modal:", error);

        // Check for Discord API error
        if (error.rawError) {
            logger.error("[CreateOrderJob] Discord API Error:", error.rawError);
        }

        if (error.code) {
            logger.error("[CreateOrderJob] Error code:", error.code);
        }

        if (error.errors) {
            logger.error("[CreateOrderJob] Validation errors:", error.errors);
        }

        // Extract user-friendly error message from API response
        const errorMessage = extractErrorMessage(error);

        // Make error messages more user-friendly
        if (isInsufficientBalanceError(error)) {
            const embed = new EmbedBuilder()
                .setTitle("❌ Insufficient Balance")
                .setDescription(errorMessage)
                .setColor(0xed4245)
                .setTimestamp()
                .setFooter({ text: "Please add more balance using /add-balance" });

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ embeds: [embed.toJSON() as any] });
                } else {
                    await interaction.reply({ embeds: [embed.toJSON() as any], ephemeral: true });
                }
            } catch (replyError) {
                logger.error("[CreateOrderJob] Failed to send error message:", replyError);
            }
            return;
        }

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to create order**\n\n${errorMessage}\n\nPlease try again or contact an administrator.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to create order**\n\n${errorMessage}\n\nPlease try again or contact an administrator.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[CreateOrderJob] Failed to send error message:", replyError);
        }
    }
}
