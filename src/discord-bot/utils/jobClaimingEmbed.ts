import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import logger from "../../common/loggers";

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
 * Deposit tier configuration
 */
export enum DepositTier {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    VERY_HIGH = "VERY_HIGH"
}

export interface DepositTierInfo {
    tier: DepositTier;
    emoji: string;
    label: string;
    color: number;
}

/**
 * Determine deposit tier based on amount
 */
export function getDepositTier(depositAmount: number): DepositTierInfo {
    if (depositAmount < 50) {
        return {
            tier: DepositTier.LOW,
            emoji: "🟢",
            label: "Low Deposit",
            color: 0x57f287 // Green
        };
    } else if (depositAmount < 100) {
        return {
            tier: DepositTier.MEDIUM,
            emoji: "🟡",
            label: "Medium Deposit",
            color: 0xf59e0b // Orange/Yellow
        };
    } else if (depositAmount < 200) {
        return {
            tier: DepositTier.HIGH,
            emoji: "🟠",
            label: "High Deposit",
            color: 0xe67e22 // Orange
        };
    } else {
        return {
            tier: DepositTier.VERY_HIGH,
            emoji: "🔴",
            label: "Very High Deposit",
            color: 0xed4245 // Red
        };
    }
}

export function createJobClaimingEmbed(data: JobClaimingData): EmbedBuilder {
    if (!data.orderId) {
        logger.error(`[JobClaimingEmbed] Missing orderId!`, data);
    }
    if (!data.orderNumber && data.orderNumber !== 0) {
        logger.error(`[JobClaimingEmbed] Missing orderNumber!`, data);
    }

    const workerPayout = data.orderValue * 0.8; // 80% payout
    const tierInfo = getDepositTier(data.depositAmount);

    const embed = new EmbedBuilder()
        .setTitle(`${tierInfo.emoji} NEW JOB AVAILABLE - ${tierInfo.label}`)
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
                name: `${tierInfo.emoji} Deposit Required`,
                value: `$${data.depositAmount.toFixed(2)} ${data.currency}`,
                inline: true,
            },
            {
                name: "👤 Customer",
                value: `<@${data.customerDiscordId}>`,
                inline: true,
            },
        ])
        .setColor(tierInfo.color) // Color based on deposit tier
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

    // Add tier-specific eligibility information
    let tierDescription = "";
    switch (tierInfo.tier) {
        case DepositTier.LOW:
            tierDescription = "✅ **Entry Level** - Most workers can claim this job";
            break;
        case DepositTier.MEDIUM:
            tierDescription = "⚡ **Standard** - Requires some wallet balance";
            break;
        case DepositTier.HIGH:
            tierDescription = "⚠️ **High Value** - Requires significant wallet balance";
            break;
        case DepositTier.VERY_HIGH:
            tierDescription = "🔥 **Premium** - Requires very high wallet balance";
            break;
    }

    embed.addFields([
        {
            name: `${tierInfo.emoji} Eligibility Tier`,
            value: tierDescription,
            inline: false,
        },
        {
            name: "ℹ️ Requirements",
            value: `You must have at least **$${data.depositAmount.toFixed(2)} ${data.currency}** available (deposit + free balance) to claim this job.\n\n` +
                `**Deposit Tiers:**\n` +
                `🟢 Low: <$50 | 🟡 Medium: $50-$99 | 🟠 High: $100-$199 | 🔴 Very High: $200+`,
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
