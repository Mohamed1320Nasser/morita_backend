import {
    Client,
    Guild,
    TextChannel,
    EmbedBuilder,
    ColorResolvable,
    User,
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

export class IssuesChannelService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async getOrCreateChannel(guild: Guild): Promise<TextChannel | null> {
        try {
            if (discordConfig.issuesChannelId) {
                const existing = guild.channels.cache.get(discordConfig.issuesChannelId);
                if (existing && existing.type === ChannelType.GuildText) {
                    return existing as TextChannel;
                }
            }

            const existingByName = guild.channels.cache.find(
                (c) => c.name.toLowerCase() === "order-issues" && c.type === ChannelType.GuildText
            );
            if (existingByName) {
                return existingByName as TextChannel;
            }

            logger.info("[IssuesChannel] Creating order-issues channel");
            const channel = await guild.channels.create({
                name: "order-issues",
                type: ChannelType.GuildText,
                topic: "🚨 Order issues and disputes | Admin & Support Only",
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: discordConfig.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        id: discordConfig.adminRoleId,
                        allow: [PermissionFlagsBits.Administrator],
                    },
                ],
            });

            logger.info(`[IssuesChannel] Created channel: ${channel.id}`);
            return channel;
        } catch (error) {
            logger.error("[IssuesChannel] Error getting/creating channel:", error);
            return null;
        }
    }

    async postIssue(
        issue: any,
        order: any,
        customer: User,
        worker?: User,
        orderChannel?: TextChannel
    ): Promise<string | null> {
        try {
            const guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!guild) {
                logger.error("[IssuesChannel] Guild not found");
                return null;
            }

            const channel = await this.getOrCreateChannel(guild);
            if (!channel) {
                logger.error("[IssuesChannel] Could not get channel");
                return null;
            }

            const embed = this.formatIssueEmbed(issue, order, customer, worker, orderChannel);
            const buttonRows = this.buildResolutionButtons(issue.id, order.id);

            const message = await channel.send({
                content: `<@&${discordConfig.supportRoleId}> <@&${discordConfig.adminRoleId}>`,
                embeds: [embed.toJSON() as any],
                components: buttonRows.map(row => row.toJSON() as any),
            });

            logger.info(`[IssuesChannel] Posted issue for order #${order.orderNumber}`);
            return message.id;
        } catch (error) {
            logger.error("[IssuesChannel] Error posting issue:", error);
            return null;
        }
    }

    private formatIssueEmbed(
        issue: any,
        order: any,
        customer: User,
        worker?: User,
        orderChannel?: TextChannel
    ): EmbedBuilder {
        const orderNumber = order.orderNumber?.toString() || "Unknown";
        const priorityEmoji = this.getPriorityEmoji(issue.priority);
        const orderValue = parseFloat(order.orderValue?.toString() || "0");

        const embed = new EmbedBuilder()
            .setTitle(`🚨 ${priorityEmoji} Order Issue Reported - #${orderNumber}`)
            .setColor(0xed4245 as ColorResolvable)
            .setTimestamp();

        embed.addFields(
            { name: "📦 Order:", value: `#${orderNumber}`, inline: true },
            { name: "👤 Customer:", value: `<@${customer.id}> (${customer.tag})`, inline: true },
            { name: "👷 Worker:", value: worker ? `<@${worker.id}> (${worker.tag})` : "N/A", inline: true }
        );

        embed.addFields(
            { name: "💰 Order Value:", value: `$${orderValue.toFixed(2)}`, inline: true },
            { name: "🔴 Priority:", value: issue.priority, inline: true },
            { name: "📊 Status:", value: issue.status, inline: true }
        );

        const timestamp = Math.floor(new Date(issue.createdAt).getTime() / 1000);
        embed.addFields(
            { name: "⏰ Reported:", value: `<t:${timestamp}:R>`, inline: true },
            { name: "\u200b", value: "\u200b", inline: true },
            { name: "\u200b", value: "\u200b", inline: true }
        );

        embed.addFields({
            name: "📝 Issue Description",
            value: issue.issueDescription.substring(0, 1024),
            inline: false,
        });

        if (orderChannel) {
            embed.addFields({
                name: "🔗 Order Channel",
                value: `<#${orderChannel.id}>`,
                inline: true,
            });
        }

        embed.addFields({
            name: "🆔 Issue ID",
            value: `\`${issue.id}\``,
            inline: true,
        });

        embed.addFields({
            name: "⚠️ Required Action",
            value:
                "• Review the issue description\n" +
                "• Check order channel for context\n" +
                "• Contact both customer and worker\n" +
                "• Determine resolution or refund",
            inline: false,
        });

        embed.setFooter({
            text: `Order ID: ${order.id} • Today at ${new Date().toLocaleTimeString()}`,
        });

        return embed;
    }

    private getPriorityEmoji(priority: string): string {
        const emojiMap: { [key: string]: string } = {
            LOW: "🟢",
            MEDIUM: "🟡",
            HIGH: "🟠",
            URGENT: "🔴",
        };
        return emojiMap[priority] || "⚪";
    }

    private buildResolutionButtons(issueId: string, orderId: string): ActionRowBuilder<ButtonBuilder>[] {
        
        const approveWorkCompleteButton = new ButtonBuilder()
            .setCustomId(`resolve_approve_work_${issueId}_${orderId}`)
            .setLabel("✅ Approve Work - Complete Order")
            .setStyle(ButtonStyle.Success);

        const requestCorrectionsButton = new ButtonBuilder()
            .setCustomId(`resolve_corrections_${issueId}_${orderId}`)
            .setLabel("🔄 Request Corrections - Resume Work")
            .setStyle(ButtonStyle.Primary);

        const approveCustomerRefundButton = new ButtonBuilder()
            .setCustomId(`resolve_refund_${issueId}_${orderId}`)
            .setLabel("❌ Approve Refund - Cancel Order")
            .setStyle(ButtonStyle.Danger);

        return [
            new ActionRowBuilder<ButtonBuilder>().addComponents(approveWorkCompleteButton),
            new ActionRowBuilder<ButtonBuilder>().addComponents(requestCorrectionsButton),
            new ActionRowBuilder<ButtonBuilder>().addComponents(approveCustomerRefundButton)
        ];
    }
}

let issuesChannelServiceInstance: IssuesChannelService | null = null;

export function getIssuesChannelService(client: Client): IssuesChannelService {
    if (!issuesChannelServiceInstance) {
        issuesChannelServiceInstance = new IssuesChannelService(client);
    }
    return issuesChannelServiceInstance;
}

export default IssuesChannelService;
