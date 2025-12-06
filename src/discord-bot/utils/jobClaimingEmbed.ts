import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export interface JobClaimingData {
    orderId: string;
    orderNumber: number;
    orderValue: number;
    depositAmount: number;
    currency: string;
    serviceName?: string;
    jobDetails?: string;
    customerDiscordId: string;
}

/**
 * Creates an embed for job claiming channel
 */
export function createJobClaimingEmbed(data: JobClaimingData): EmbedBuilder {
    // Validate required data
    if (!data.orderId) {
        console.error(`[JobClaimingEmbed] Missing orderId!`, data);
    }
    if (!data.orderNumber && data.orderNumber !== 0) {
        console.error(`[JobClaimingEmbed] Missing orderNumber!`, data);
    }

    const workerPayout = data.orderValue * 0.8; // 80% payout

    const embed = new EmbedBuilder()
        .setTitle("🆕 NEW JOB AVAILABLE")
        .setDescription(
            data.orderNumber ?
                `Order #${data.orderNumber} is ready to be claimed!` :
                `A new order is ready to be claimed!`
        )
        .addFields([
            {
                name: "📦 Order Details",
                value: data.serviceName || "Service order",
                inline: false,
            },
            {
                name: "💰 Your Payout",
                value: `$${workerPayout.toFixed(2)} ${data.currency} (80% of order value)`,
                inline: true,
            },
            {
                name: "⚠️ Deposit Required",
                value: `$${data.depositAmount.toFixed(2)} ${data.currency}`,
                inline: true,
            },
            {
                name: "👤 Customer",
                value: `<@${data.customerDiscordId}>`,
                inline: true,
            },
        ])
        .setColor(0xf59e0b) // Orange color for unclaimed jobs
        .setTimestamp()
        .setFooter({
            text: data.orderId ?
                `Order ID: ${data.orderId}` :
                `New Job Available`
        });

    if (data.jobDetails) {
        embed.addFields([
            {
                name: "📋 Job Details",
                value: data.jobDetails.substring(0, 1024),
                inline: false,
            },
        ]);
    }

    embed.addFields([
        {
            name: "ℹ️ Requirements",
            value: `You must have at least $${data.depositAmount.toFixed(2)} ${data.currency} in your wallet to claim this job.`,
            inline: false,
        },
    ]);

    return embed;
}

/**
 * Creates a claim button for job claiming
 */
export function createClaimButton(orderId: string, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const button = new ButtonBuilder()
        .setCustomId(`claim_job_${orderId}`)
        .setLabel("🙋 Claim This Job")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

/**
 * Creates a claimed embed (after job is claimed)
 */
export function createJobClaimedEmbed(data: JobClaimingData, workerDiscordId: string, claimedAt: Date): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("✅ JOB CLAIMED")
        .setDescription(
            `Order #${data.orderNumber} has been claimed!`
        )
        .addFields([
            {
                name: "📦 Order Details",
                value: data.serviceName || "Service order",
                inline: false,
            },
            {
                name: "👷 Claimed By",
                value: `<@${workerDiscordId}>`,
                inline: true,
            },
            {
                name: "⏰ Claimed At",
                value: claimedAt.toLocaleString(),
                inline: true,
            },
            {
                name: "👤 Customer",
                value: `<@${data.customerDiscordId}>`,
                inline: true,
            },
        ])
        .setColor(0x57f287) // Green color for claimed jobs
        .setTimestamp()
        .setFooter({ text: `Order ID: ${data.orderId}` });

    return embed;
}
