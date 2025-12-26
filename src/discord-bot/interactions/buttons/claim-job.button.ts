import { ButtonInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { createJobClaimedEmbed, createClaimButton } from "../../utils/jobClaimingEmbed";
import { getOrderChannelService } from "../../services/orderChannel.service";

/**
 * Handles job claim button clicks
 * Pattern: claim_job_{orderId}
 */
export async function handleClaimJobButton(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract order ID from custom ID
        const orderId = interaction.customId.replace("claim_job_", "");
        const workerDiscordId = interaction.user.id;

        logger.info(`[ClaimJob] Worker ${workerDiscordId} attempting to claim order ${orderId}`);

        // Check worker's wallet balance
        logger.info(`[ClaimJob] Checking worker balance...`);
        const balanceResponse: any = await discordApiClient.get(
            `/discord/wallets/balance/${workerDiscordId}`
        );

        // HttpClient interceptor already unwrapped one level
        const responseData = balanceResponse.data || balanceResponse;
        let balanceData = responseData.data || responseData;

        // If worker doesn't have a wallet, create one automatically
        if (!balanceData.hasWallet) {
            logger.info(`[ClaimJob] Worker ${workerDiscordId} has no wallet, creating one automatically...`);

            try {
                const displayName = interaction.user.displayName || interaction.user.globalName;
                const createWalletResponse = await discordApiClient.post(
                    `/discord/wallets/discord/${workerDiscordId}`,
                    {
                        username: displayName || interaction.user.username,
                        walletType: "WORKER",
                    }
                );

                logger.info(`[ClaimJob] Worker wallet created successfully for ${displayName || interaction.user.username}`);

                // Fetch balance again after wallet creation
                const newBalanceResponse: any = await discordApiClient.get(
                    `/discord/wallets/balance/${workerDiscordId}`
                );
                // HttpClient interceptor already unwrapped one level
                const newResponseData = newBalanceResponse.data || newBalanceResponse;
                balanceData = newResponseData.data || newResponseData;
            } catch (createError: any) {
                logger.error(`[ClaimJob] Failed to create worker wallet:`, createError);
                await interaction.editReply({
                    content: `❌ **Failed to create wallet**\n\nCouldn't automatically create your worker wallet. Please contact support.`,
                });
                return;
            }
        }

        const deposit = parseFloat(balanceData.deposit || "0");
        const balance = parseFloat(balanceData.balance || "0");
        const pendingBalance = parseFloat(balanceData.pendingBalance || "0");
        const eligibilityBalance = deposit + balance;

        // Get order details to check deposit requirement
        logger.info(`[ClaimJob] Fetching order details...`);
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);

        // Handle triple-nested response structure
        // HttpClient interceptor already unwrapped one level
        const outerData = orderResponse.data || orderResponse;
        const order = outerData.data || outerData;

        logger.info(`[ClaimJob] Order #${order.orderNumber} - Status: ${order.status} - Deposit Required: $${order.depositAmount} - Worker Deposit: $${deposit} - Balance: $${balance} - Eligibility: $${eligibilityBalance}`);

        // Check if order is still available
        if (order.status !== "PENDING") {
            await interaction.editReply({
                content: `❌ **Job No Longer Available**\n\nThis job has already been claimed by another worker.`,
            });
            return;
        }

        // Check if worker already assigned
        if (order.worker) {
            await interaction.editReply({
                content: `❌ **Job Already Assigned**\n\nThis job is already assigned to <@${order.worker.discordId}>.`,
            });
            return;
        }

        // Check if worker has sufficient eligibility (deposit + available balance)
        const requiredDeposit = parseFloat(order.depositAmount.toString());
        if (eligibilityBalance < requiredDeposit) {
            const shortfall = requiredDeposit - eligibilityBalance;

            // Build error message
            let errorMessage = `❌ **Insufficient Eligibility**\n\n` +
                `You need at least $${requiredDeposit.toFixed(2)} eligibility to claim this job.\n\n` +
                `**Your Worker Deposit:** $${deposit.toFixed(2)}\n` +
                `**Your Balance:** $${balance.toFixed(2)}\n` +
                `**Total Eligibility:** $${eligibilityBalance.toFixed(2)}\n` +
                `**Required:** $${requiredDeposit.toFixed(2)}\n` +
                `**Shortfall:** $${shortfall.toFixed(2)}\n\n`;

            // Add special note if worker has no deposit
            if (deposit === 0) {
                errorMessage += `⚠️ **Note:** You have no worker deposit. Adding a deposit increases your job claiming eligibility.\n\n`;
            }

            errorMessage += `Please add more balance or deposit to your wallet before claiming jobs.`;

            await interaction.editReply({
                content: errorMessage,
            });
            return;
        }

        // Claim the job - assign worker to order
        logger.info(`[ClaimJob] Assigning worker to order...`);
        const claimResponse: any = await discordApiClient.post(`/discord/orders/${orderId}/claim`, {
            workerDiscordId,
        });

        // Handle triple-nested response structure
        // HttpClient interceptor already unwrapped one level
        const claimOuterData = claimResponse.data || claimResponse;
        const claimedOrder = claimOuterData.data || claimOuterData;

        logger.info(`[ClaimJob] Order #${claimedOrder.orderNumber} claimed successfully by ${interaction.user.username}`);

        // Update the claim message - edit embed and disable button
        try {
            const message = interaction.message;
            const claimedEmbed = createJobClaimedEmbed(
                {
                    orderId: claimedOrder.id,
                    orderNumber: claimedOrder.orderNumber,
                    orderValue: parseFloat(claimedOrder.orderValue.toString()),
                    depositAmount: parseFloat(claimedOrder.depositAmount.toString()),
                    currency: claimedOrder.currency,
                    serviceName: claimedOrder.service?.name,
                    customerDiscordId: claimedOrder.customer.discordId,
                },
                workerDiscordId,
                new Date()
            );

            const disabledButton = createClaimButton(orderId, true);

            await message.edit({
                embeds: [claimedEmbed.toJSON() as any],
                components: [disabledButton.toJSON() as any],
            });

            logger.info(`[ClaimJob] Updated claim message`);
        } catch (err) {
            logger.error(`[ClaimJob] Failed to update claim message:`, err);
        }

        // Add worker to ticket channel instead of creating new order channel
        const orderChannelService = getOrderChannelService(interaction.client);
        let ticketChannel = null;

        // Check if order has a linked ticket
        logger.info(`[ClaimJob] Order ticketId: ${claimedOrder.ticketId || 'NULL'}`);

        if (claimedOrder.ticketId) {
            logger.info(`[ClaimJob] Order has linked ticket ${claimedOrder.ticketId}, fetching ticket details...`);

            try {
                // Fetch ticket to get channel ID
                const ticketResponse: any = await discordApiClient.get(`/api/discord/tickets/${claimedOrder.ticketId}`);
                // HttpClient interceptor already unwrapped one level
                const ticketData = ticketResponse.data?.data || ticketResponse.data || ticketResponse;

                if (ticketData && ticketData.channelId) {
                    logger.info(`[ClaimJob] Found ticket channel: ${ticketData.channelId}`);

                    // Add worker to the existing ticket channel
                    ticketChannel = await orderChannelService.addWorkerToTicketChannel({
                        ticketChannelId: ticketData.channelId,
                        workerDiscordId: workerDiscordId,
                        orderNumber: claimedOrder.orderNumber,
                        orderId: claimedOrder.id,
                        orderValue: parseFloat(claimedOrder.orderValue.toString()),
                        depositAmount: parseFloat(claimedOrder.depositAmount.toString()),
                        currency: claimedOrder.currency,
                        customerDiscordId: claimedOrder.customer.discordId,
                        serviceName: claimedOrder.service?.name,
                        jobDetails: claimedOrder.jobDetails?.description,
                        status: claimedOrder.status,
                    });

                    if (ticketChannel) {
                        logger.info(`[ClaimJob] Worker added to ticket channel: ${ticketChannel.name}`);
                    }
                } else {
                    logger.warn(`[ClaimJob] Ticket ${claimedOrder.ticketId} has no channel ID`);
                }
            } catch (err) {
                logger.error(`[ClaimJob] Failed to fetch ticket or add worker to channel:`, err);
            }
        } else {
            logger.warn(`[ClaimJob] Order ${orderId} has no linked ticket - cannot add worker to ticket channel`);
        }

        // Send success message to worker
        await interaction.editReply({
            content:
                `✅ **Job Claimed Successfully!**\n\n` +
                `You have claimed Order #${claimedOrder.orderNumber}.\n\n` +
                (ticketChannel ? `📁 You have been added to the ticket channel: <#${ticketChannel.id}>\n\n` : '') +
                `Head to the ${ticketChannel ? 'ticket' : 'order'} channel to communicate with the customer and complete the job.`,
        });

        logger.info(`[ClaimJob] Worker ${workerDiscordId} successfully claimed order ${orderId}`);
    } catch (error: any) {
        logger.error("[ClaimJob] Error handling claim job button:", error);

        if (error?.response?.data) {
            logger.error("[ClaimJob] API Error:", error.response.data);
        }

        // Use extractErrorMessage utility for consistent error handling
        const { extractErrorMessage } = require("../../utils/error-message.util");
        const errorMessage = extractErrorMessage(error);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to Claim Job**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to Claim Job**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[ClaimJob] Failed to send error message:", replyError);
        }
    }
}
