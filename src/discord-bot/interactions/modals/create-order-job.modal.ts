import { ModalSubmitInteraction, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { createJobClaimingEmbed, createClaimButton } from "../../utils/jobClaimingEmbed";
import { getOrderChannelService } from "../../services/orderChannel.service";
import { extractErrorMessage, isInsufficientBalanceError } from "../../utils/error-message.util";
import { unwrapApiData } from "../../utils/apiResponse.util";
import { getRedisService } from "../../../common/services/redis.service";

const redisService = getRedisService();

const MAX_SERVICES = 10;

export async function storeOrderData(key: string, data: any): Promise<void> {
    await redisService.storeOrderData(key, data);
}

export async function handleCreateOrderJobModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (deferError) {
        logger.error("[CreateOrderJob] Failed to defer:", deferError);
        return;
    }

    try {
        const orderKey = interaction.customId.replace("create_order_job_", "");
        const jobDetails = interaction.fields.getTextInputValue("job_details").trim() || null;
        const orderData = await redisService.getOrderData(orderKey);

        if (!orderData) {
            await interaction.editReply({
                content: `❌ **Order data expired or not found**\n\nPlease try creating the order again.\n\n*Tip: If the bot restarted recently, you'll need to re-run /create-order*`,
            });
            return;
        }

        await redisService.deleteOrderData(orderKey);

        const ticketId = await fetchTicketId(orderData);
        const customerBalance = await validateCustomerBalance(interaction, orderData);

        if (customerBalance === null) return;

        const order = await createOrder(orderData, ticketId, jobDetails);
        const confirmEmbed = buildConfirmationEmbed(orderData, order, customerBalance, jobDetails);

        await handleOrderAssignment(interaction, orderData, order, confirmEmbed, jobDetails);

        // Only send separate confirmation to channel if NO worker assigned (job claiming flow)
        // When worker is directly assigned, the message is already sent by addWorkerToTicketChannel
        if (!orderData.workerDiscordId) {
            await sendToChannel(interaction, orderData.channelId, confirmEmbed, order.orderId);
        }

        await interaction.deleteReply();

        logger.info(`[CreateOrderJob] Order #${order.orderNumber} created by ${orderData.supportDiscordId} for ${orderData.customerDiscordId}`);
    } catch (error: any) {
        await handleError(interaction, error);
    }
}

async function fetchTicketId(orderData: any): Promise<string | null> {
    if (orderData.ticketId) return orderData.ticketId;
    if (!orderData.channelId) return null;

    try {
        const ticketResponse = await discordApiClient.get(`/discord/tickets/channel/${orderData.channelId}`);
        const ticketData = ticketResponse.data.data?.data || ticketResponse.data.data || ticketResponse.data;
        return ticketData?.id || null;
    } catch (err: any) {
        if (err?.response?.status !== 404 && err?.status !== 404) {
            logger.error("[CreateOrderJob] Failed to fetch ticket:", err);
        }
        return null;
    }
}

async function validateCustomerBalance(
    interaction: ModalSubmitInteraction,
    orderData: any
): Promise<number | null> {
    const balanceResponse: any = await discordApiClient.get(
        `/discord/wallets/balance/${orderData.customerDiscordId}`
    );

    const balanceData = unwrapApiData<any>(balanceResponse) || {};

    if (!balanceData.hasWallet) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Customer Has No Wallet")
            .setDescription(
                `Customer <@${orderData.customerDiscordId}> does not have a wallet yet.\n\n` +
                `**Please add balance first using /add-balance**`
            )
            .setColor(0xed4245)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed.toJSON() as any] });
        return null;
    }

    const customerBalance = Number(balanceData.balance);

    if (!Number.isFinite(customerBalance)) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Could Not Read Balance")
            .setDescription(
                `Could not read the wallet balance for <@${orderData.customerDiscordId}>.\n\n` +
                `Please try again, or contact an administrator if this keeps happening.`
            )
            .setColor(0xed4245)
            .setTimestamp();

        logger.error(
            `[CreateOrderJob] Unreadable balance payload for ${orderData.customerDiscordId}:`,
            balanceData
        );

        await interaction.editReply({ embeds: [embed.toJSON() as any] });
        return null;
    }

    if (customerBalance < orderData.orderValue) {
        const embed = new EmbedBuilder()
            .setTitle("❌ Insufficient Balance")
            .setDescription(
                `Customer <@${orderData.customerDiscordId}> has insufficient balance.\n\n` +
                `**Order Value:** $${orderData.orderValue.toFixed(2)}\n` +
                `**Current Balance:** $${customerBalance.toFixed(2)}\n` +
                `**Shortfall:** $${(orderData.orderValue - customerBalance).toFixed(2)}\n\n` +
                `Please add more balance using /add-balance first.`
            )
            .setColor(0xed4245)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed.toJSON() as any] });
        return null;
    }

    return customerBalance;
}

async function createOrder(orderData: any, ticketId: string | null, jobDetails: string | null) {
    let serviceId = null;
    let categoryId = null;
    let serviceName = null;

    let serviceIds: string[] = [];
    let serviceNames: string[] = [];

    // 1. Resolve every service named in the field. Names are comma separated so
    // one order can cover several services; the first becomes the primary.
    if (orderData.serviceName && orderData.serviceName.trim() !== "") {
        const requested = orderData.serviceName
            .split(",")
            .map((n: string) => n.trim())
            .filter(Boolean);

        if (requested.length > MAX_SERVICES) {
            throw new Error(
                `❌ An order can link at most ${MAX_SERVICES} services (${requested.length} given).`
            );
        }

        const resolved: any[] = [];
        const failures: string[] = [];

        for (const name of requested) {
            const lookupResult = await lookupService(name);

            if (!lookupResult.success || !lookupResult.found) {
                const reason = lookupResult.message || "Service not found";
                const suggestions = lookupResult.suggestions?.length
                    ? `\n   Did you mean: ${lookupResult.suggestions
                          .map((s: any) => s.fullName)
                          .join(", ")}`
                    : "";
                failures.push(`• **${name}** — ${reason}${suggestions}`);
                continue;
            }

            resolved.push(lookupResult.service);
        }

        // Reject the whole order rather than create one that silently omits a
        // service the customer asked for.
        if (failures.length > 0) {
            throw new Error(
                `❌ Could not resolve ${failures.length} of ${requested.length} services:\n\n${failures.join("\n")}`
            );
        }

        const unique = new Map<string, any>();
        for (const service of resolved) {
            if (!unique.has(service.id)) unique.set(service.id, service);
        }

        const services = [...unique.values()];
        serviceIds = services.map(s => s.id);
        serviceNames = services.map(s => s.name);

        serviceId = services[0].id;
        categoryId = services[0].category?.id || null;
        serviceName = serviceNames.join(", ");

        // NEW: Update ticket with serviceId if ticket exists
        if (ticketId) {
            try {
                await discordApiClient.patch(`/discord/tickets/${ticketId}`, {
                    serviceId: serviceId,
                    categoryId: categoryId,
                });
                logger.info(`[CreateOrderJob] Updated ticket ${ticketId} with serviceId: ${serviceId}, categoryId: ${categoryId}`);
            } catch (err) {
                logger.warn(`[CreateOrderJob] Failed to update ticket ${ticketId} with serviceId:`, err);
            }
        }
    }

    // 2. If no service_name but ticket exists, try to use ticket's service
    if (!serviceId && ticketId) {
        try {
            const ticketResponse = await discordApiClient.get(`/tickets/${ticketId}`);
            const ticketData = ticketResponse.data.data || ticketResponse.data;

            if (ticketData?.serviceId) {
                serviceId = ticketData.serviceId;
                categoryId = ticketData.categoryId || null;
                serviceName = ticketData.service?.name || null;
            }
        } catch (err) {
            // Ignore ticket fetch errors - order can still be created without service
            logger.warn("[CreateOrderJob] Failed to fetch ticket service:", err);
        }
    }

    const createOrderData = {
        customerDiscordId: orderData.customerDiscordId,
        workerDiscordId: orderData.workerDiscordId,
        supportDiscordId: orderData.supportDiscordId,
        ticketId: ticketId || null,
        discordChannelId: orderData.channelId || null,
        serviceId: serviceId,
        serviceIds: serviceIds.length > 0 ? serviceIds : undefined,
        methodId: null,
        paymentMethodId: null,
        orderValue: orderData.orderValue,
        depositAmount: orderData.deposit,
        currency: orderData.currency,
        jobDetails: jobDetails ? { description: jobDetails } : null,
    };

    const response: any = await discordApiClient.post("/discord/orders/create", createOrderData);
    const outerData = response.data || response;
    const order = outerData.data || outerData;

    // 3. Update ticket conversion status if ticket exists
    if (ticketId) {
        try {
            await discordApiClient.patch(`/discord/tickets/${ticketId}`, {
                convertedToOrder: true,
                conversionAt: new Date(),
            });
        } catch (err) {
            // Log but don't fail order creation if ticket update fails
            logger.warn("[CreateOrderJob] Failed to update ticket conversion status:", err);
        }
    }

    return {
        orderNumber: order.orderNumber,
        orderId: order.orderId || order.id,
        status: order.status || "PENDING",
        service: order.service || { name: serviceName },
    };
}

async function lookupService(serviceName: string) {
    try {
        const response = await discordApiClient.get("/public/services/lookup/by-name", {
            params: { name: serviceName },
        });

        return response.data || response;
    } catch (error: any) {
        logger.error("[CreateOrderJob] Service lookup error:", error);
        return {
            success: false,
            found: false,
            message: "Failed to lookup service",
            suggestions: [],
        };
    }
}

function buildConfirmationEmbed(
    orderData: any,
    order: any,
    customerBalance: number,
    jobDetails: string | null
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("✅ Order Created Successfully")
        .setDescription(
            order.orderNumber ? `Order #${order.orderNumber} has been created!` : `Order has been created!`
        )
        .addFields([
            { name: "🆔 Order ID", value: order.orderNumber ? `#${order.orderNumber}` : `#${order.orderId}`, inline: true },
            { name: "👤 Customer", value: `<@${orderData.customerDiscordId}>`, inline: true },
            {
                name: "👷 Worker",
                value: orderData.workerDiscordId ? `<@${orderData.workerDiscordId}>` : "⏳ Unassigned (Job Claiming)",
                inline: true,
            },
            { name: "💰 Order Value", value: `$${orderData.orderValue.toFixed(2)} ${orderData.currency}`, inline: true },
            { name: "🔒 Deposit Locked", value: `$${orderData.deposit.toFixed(2)} ${orderData.currency}`, inline: true },
            { name: "📊 Status", value: order.status, inline: true },
            { name: "💵 Customer Balance", value: `$${(customerBalance - orderData.orderValue).toFixed(2)} ${orderData.currency}`, inline: true },
        ])
        .setColor(0xfca311)
        .setTimestamp()
        .setFooter({
            text: order.orderNumber ? `Order #${order.orderNumber}` : `Order ID: ${order.orderId}`
        });

    // An order can cover several services, so list them all rather than only
    // the primary one stored on order.serviceId.
    const linkedServices: string[] = Array.isArray(order.services)
        ? order.services
              .map((link: any) => link?.service?.name)
              .filter(Boolean)
        : [];

    if (linkedServices.length === 0 && order.service?.name) {
        linkedServices.push(order.service.name);
    }

    if (linkedServices.length > 0) {
        embed.addFields([
            {
                name: linkedServices.length > 1 ? "🎯 Services" : "🎯 Service",
                value: linkedServices.join("\n").substring(0, 1024),
                inline: true
            },
        ]);
    }

    if (jobDetails) {
        embed.addFields([
            {
                name: "📋 Job Details",
                value: jobDetails.substring(0, 1024),
            },
        ]);
    }

    return embed;
}

async function handleOrderAssignment(
    interaction: ModalSubmitInteraction,
    orderData: any,
    order: any,
    confirmEmbed: EmbedBuilder,
    jobDetails: string | null
): Promise<void> {
    if (!orderData.workerDiscordId) {
        confirmEmbed.addFields([
            {
                name: "ℹ️ Next Steps",
                value:
                    "This order has been posted to the job claiming channel.\n" +
                    "Workers with sufficient balance can claim it.",
            },
        ]);

        await postToJobClaimingChannel(interaction, orderData, order, jobDetails);
    } else {
        confirmEmbed.addFields([
            {
                name: "ℹ️ Next Steps",
                value:
                    `Worker <@${orderData.workerDiscordId}> has been assigned.\n` +
                    `Worker will be added to this ticket channel for communication.`,
            },
        ]);

        await addWorkerToTicketChannel(interaction, orderData, order, jobDetails, confirmEmbed);
    }
}

async function postToJobClaimingChannel(
    interaction: ModalSubmitInteraction,
    orderData: any,
    order: any,
    jobDetails: string | null
): Promise<void> {
    try {
        if (!discordConfig.jobClaimingChannelId) return;

        const claimingChannel = await interaction.client.channels.fetch(
            discordConfig.jobClaimingChannelId
        ) as TextChannel;

        if (!claimingChannel) return;

        const jobClaimingEmbed = createJobClaimingEmbed({
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            orderValue: orderData.orderValue,
            depositAmount: orderData.deposit,
            currency: orderData.currency,
            jobDetails: jobDetails || undefined,
            customerDiscordId: orderData.customerDiscordId,
        });

        const claimButton = createClaimButton(order.orderId);

        await claimingChannel.send({
            content: `<@&${discordConfig.workersRoleId}>`,
            embeds: [jobClaimingEmbed.toJSON() as any],
            components: [claimButton.toJSON() as any],
        });
    } catch (err: any) {
        logger.error("[CreateOrderJob] Failed to post to job claiming channel:", err);
    }
}

async function addWorkerToTicketChannel(
    interaction: ModalSubmitInteraction,
    orderData: any,
    order: any,
    jobDetails: string | null,
    confirmEmbed: EmbedBuilder
): Promise<void> {
    try {
        if (!orderData.channelId) return;

        const orderChannelService = getOrderChannelService(interaction.client);
        const ticketChannel = await orderChannelService.addWorkerToTicketChannel({
            ticketChannelId: orderData.channelId,
            workerDiscordId: orderData.workerDiscordId,
            orderNumber: order.orderNumber,
            orderId: order.orderId,
            orderValue: orderData.orderValue,
            depositAmount: orderData.deposit,
            currency: orderData.currency,
            customerDiscordId: orderData.customerDiscordId,
            serviceName: order.service?.name,
            jobDetails: jobDetails || undefined,
            status: order.status,
            isDirectAssign: true, // Direct assign - don't pin the message
        });

        if (ticketChannel) {
            confirmEmbed.addFields([
                {
                    name: "📁 Ticket Channel",
                    value: `<#${ticketChannel.id}>`,
                    inline: false,
                }
            ]);
        }
    } catch (err: any) {
        logger.error("[CreateOrderJob] Failed to add worker to ticket channel:", err);
    }
}

async function sendToChannel(
    interaction: ModalSubmitInteraction,
    channelId: string | null,
    embed: EmbedBuilder,
    orderId?: string
): Promise<void> {
    if (!channelId) return;

    try {
        const channel = await interaction.client.channels.fetch(channelId);
        if (channel && "send" in channel) {
            await (channel as any).send({
                embeds: [embed.toJSON() as any],
            });
        }
    } catch (err: any) {
        logger.error(`[CreateOrderJob] Failed to send to channel ${channelId}:`, err);
    }
}

async function handleError(interaction: ModalSubmitInteraction, error: any): Promise<void> {
    logger.error("[CreateOrderJob] Error:", error);

    const errorMessage = extractErrorMessage(error);

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
