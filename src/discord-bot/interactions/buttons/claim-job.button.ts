import { ButtonInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { createJobClaimedEmbed, createClaimButton } from "../../utils/jobClaimingEmbed";
import { getOrderChannelService } from "../../services/orderChannel.service";
import { unwrapApiData } from "../../utils/apiResponse.util";

export async function handleClaimJobButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderId = interaction.customId.replace("claim_job_", "");
        const workerDiscordId = interaction.user.id;

        const balanceResponse: any = await discordApiClient.get(
            `/discord/wallets/balance/${workerDiscordId}`
        );

        let balanceData = unwrapApiData<any>(balanceResponse) || {};

        if (!balanceData.hasWallet) {
            try {
                const displayName = interaction.user.displayName || interaction.user.globalName;
                await discordApiClient.post(
                    `/discord/wallets/discord/${workerDiscordId}`,
                    {
                        username: displayName || interaction.user.username,
                        walletType: "WORKER",
                    }
                );

                const newBalanceResponse: any = await discordApiClient.get(
                    `/discord/wallets/balance/${workerDiscordId}`
                );
                const newResponseData = newBalanceResponse.data || newBalanceResponse;
                balanceData = newResponseData.data || newResponseData;
            } catch (createError: any) {
                logger.error("[ClaimJob] Failed to create wallet:", createError);
                await interaction.editReply({
                    content: `❌ **Failed to create wallet**\n\nCouldn't automatically create your worker wallet. Please contact support.`,
                });
                return;
            }
        }

        const deposit = parseFloat(balanceData.deposit || "0");
        const balance = parseFloat(balanceData.balance || "0");
        const eligibilityBalance = deposit + balance;

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const outerData = orderResponse.data || orderResponse;
        const order = outerData.data || outerData;

        if (order.status !== "PENDING") {
            await interaction.editReply({
                content: `❌ **Job No Longer Available**\n\nThis job has already been claimed by another worker.`,
            });
            return;
        }

        if (order.worker) {
            await interaction.editReply({
                content: `❌ **Job Already Assigned**\n\nThis job is already assigned to <@${order.worker.discordId}>.`,
            });
            return;
        }

        const requiredDeposit = parseFloat(order.depositAmount.toString());
        if (eligibilityBalance < requiredDeposit) {
            const shortfall = requiredDeposit - eligibilityBalance;

            let errorMessage = `❌ **Insufficient Eligibility**\n\n` +
                `You need at least $${requiredDeposit.toFixed(2)} eligibility to claim this job.\n\n` +
                `**Your Worker Deposit:** $${deposit.toFixed(2)}\n` +
                `**Your Balance:** $${balance.toFixed(2)}\n` +
                `**Total Eligibility:** $${eligibilityBalance.toFixed(2)}\n` +
                `**Required:** $${requiredDeposit.toFixed(2)}\n` +
                `**Shortfall:** $${shortfall.toFixed(2)}\n\n`;

            if (deposit === 0) {
                errorMessage += `⚠️ **Note:** You have no worker deposit. Adding a deposit increases your job claiming eligibility.\n\n`;
            }

            errorMessage += `Please add more balance or deposit to your wallet before claiming jobs.`;

            await interaction.editReply({
                content: errorMessage,
            });
            return;
        }

        const claimResponse: any = await discordApiClient.post(`/discord/orders/${orderId}/claim`, {
            workerDiscordId,
        });

        const claimOuterData = claimResponse.data || claimResponse;
        const claimedOrder = claimOuterData.data || claimOuterData;

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
        } catch (err) {
            logger.error("[ClaimJob] Failed to update claim message:", err);
        }

        const orderChannelService = getOrderChannelService(interaction.client);
        let ticketChannel = null;

        if (claimedOrder.ticketId) {
            try {
                const ticketResponse: any = await discordApiClient.get(`/discord/tickets/${claimedOrder.ticketId}`);
                const ticketData = ticketResponse.data?.data || ticketResponse.data || ticketResponse;

                if (ticketData?.channelId) {
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
                }
            } catch (err) {
                logger.error("[ClaimJob] Failed to add worker to ticket channel:", err);
            }
        }

        const successEmbed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Job Claimed Successfully!")
            .setDescription(`You have successfully claimed this job and can now begin working on it.`)
            .addFields(
                { name: "📋 Order Number", value: `#${claimedOrder.orderNumber}`, inline: true },
                { name: "💰 Order Value", value: `$${parseFloat(claimedOrder.orderValue.toString()).toFixed(2)} ${claimedOrder.currency}`, inline: true },
                { name: "👤 Customer", value: `<@${claimedOrder.customer.discordId}>`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: "Good luck with the job!" });

        if (ticketChannel) {
            successEmbed.addFields({
                name: "📍 Ticket Channel",
                value: `You have been added to <#${ticketChannel.id}>\n\nHead to the ticket channel to communicate with the customer and complete the job.`,
                inline: false
            });
        }

        await interaction.editReply({
            embeds: [successEmbed as any],
        });

        logger.info(`[ClaimJob] Worker ${workerDiscordId} claimed order ${orderId}`);
    } catch (error: any) {
        logger.error("[ClaimJob] Error:", error);

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
