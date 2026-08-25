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

export function getDepositTier(depositAmount: number): DepositTierInfo {
    if (depositAmount < 50) {
        return {
            tier: DepositTier.LOW,
            emoji: "🟢",
            label: "Low Deposit",
            color: 0xfca311 
        };
    } else if (depositAmount < 100) {
        return {
            tier: DepositTier.MEDIUM,
            emoji: "🟡",
            label: "Medium Deposit",
            color: 0xfca311 
        };
    } else if (depositAmount < 200) {
        return {
            tier: DepositTier.HIGH,
            emoji: "🟠",
            label: "High Deposit",
            color: 0xfca311 
        };
    } else {
        return {
            tier: DepositTier.VERY_HIGH,
            emoji: "🔴",
            label: "Very High Deposit",
            color: 0xed4245 
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

    const tierInfo = getDepositTier(data.depositAmount);

    const embed = new EmbedBuilder()
        .setTitle(`${tierInfo.emoji} New Job Available`)
        .setDescription(
            `**Order #${data.orderNumber || 'N/A'}** is ready to be claimed!`
        )
        .addFields([
            {
                name: "💵 Order Value",
                value: `**$${data.orderValue.toFixed(2)} ${data.currency}**`,
                inline: true,
            },
            {
                name: "💰 Required Deposit",
                value: `**$${data.depositAmount.toFixed(2)} ${data.currency}**`,
                inline: true,
            },
        ])
        .setColor(tierInfo.color)
        .setTimestamp()
        .setFooter({ text: `Order #${data.orderNumber || 'N/A'}` });

    // Add job details if provided
    if (data.jobDetails) {
        embed.addFields([
            {
                name: "📋 Job Details",
                value: data.jobDetails.substring(0, 1024),
                inline: false,
            },
        ]);
    }

    return embed;
}

export function createClaimButton(orderId: string, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const button = new ButtonBuilder()
        .setCustomId(`claim_job_${orderId}`)
        .setLabel("🙋 Claim This Job")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

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
        .setColor(0xfca311) 
        .setTimestamp()
        .setFooter({ text: `Order ID: ${data.orderId}` });

    return embed;
}
