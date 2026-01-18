import {
    Client,
    Guild,
    TextChannel,
    CategoryChannel,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    User,
    GuildMember,
    ColorResolvable,
} from "discord.js";
import { discordConfig } from "../config/discord.config";
import { onboardingConfig } from "../config/onboarding.config";
import { ApiService } from "./api.service";
import logger from "../../common/loggers";
import axios, { AxiosInstance } from "axios";
import { getTicketChannelMover } from "./ticket-channel-mover.service";

import { TicketType, TicketMetadata } from "../types/discord.types";

export interface TicketData {
    id?: string;
    ticketNumber?: number;
    customerId?: number;
    customerDiscordId: string;
    categoryId?: string;
    serviceId?: string;
    channelId?: string;
    calculatedPrice?: number;
    paymentMethodId?: string;
    currency?: string;
    customerNotes?: string;
    customerName: string;
    ticketType?: TicketType; 
}

export interface WelcomeMessageSettings {
    title: string;
    message: string;
    bannerUrl?: string;
    embedColor: string;
    footerText?: string;
}

export class TicketService {
    private client: Client;
    private apiClient: AxiosInstance;

    constructor(client: Client) {
        this.client = client;
        this.apiClient = axios.create({
            baseURL: discordConfig.apiBaseUrl,
            timeout: 5000, 
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    async createTicketChannel(
        guild: Guild,
        user: User,
        ticketData: TicketData
    ): Promise<{ channel: TextChannel; ticket: any }> {
        try {
            
            let ticketCategory = await this.getOrCreateTicketsCategory(guild);

            const tempTicketNumber = Date.now().toString().slice(-6);
            const tempChannelName = `${discordConfig.ticketChannelPrefix}${tempTicketNumber}`;

            const channel = await guild.channels.create({
                name: tempChannelName,
                type: ChannelType.GuildText,
                parent: ticketCategory?.id,
                permissionOverwrites: [
                    {
                        
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        
                        id: user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                        ],
                    },
                    {
                        
                        id: discordConfig.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                        ],
                    },
                    {
                        
                        id: discordConfig.adminRoleId,
                        allow: [PermissionFlagsBits.Administrator],
                    },
                ],
            });

            const ticketResponse = await this.apiClient.post(
                "/api/discord/tickets",
                {
                    customerDiscordId: user.id,
                    categoryId: ticketData.categoryId,
                    serviceId: ticketData.serviceId,
                    channelId: channel.id, 
                    calculatedPrice: ticketData.calculatedPrice,
                    paymentMethodId: ticketData.paymentMethodId,
                    currency: ticketData.currency || "USD",
                    customerNotes: ticketData.customerNotes,
                    customerName: user.username || user.displayName,
                    customerEmail: undefined,
                }
            );

            logger.info(`[TicketService] API Response: ${JSON.stringify(ticketResponse.data)}`);

            const responseData = ticketResponse.data.data || ticketResponse.data;

            if (!responseData.success && !responseData.id) {
                
                logger.error(`[TicketService] Ticket creation failed. Response: ${JSON.stringify(ticketResponse.data)}`);
                await channel.delete("Ticket creation failed").catch(() => {});
                throw new Error("Failed to create ticket in database");
            }

            const ticket = responseData.data || responseData;
            const ticketNumber = ticket.ticketNumber
                .toString()
                .padStart(4, "0");

            const channelName = `${discordConfig.ticketChannelPrefix}${ticketNumber}`;
            await channel.setName(channelName);
            await channel.setTopic(
                `Ticket #${ticketNumber} | Customer: ${user.tag} | Category: ${ticket.category?.name || "General"}`
            );

            logger.info(
                `Created ticket channel ${channelName} for user ${user.tag}`
            );

            return {
                channel,
                ticket: { ...ticket, channelId: channel.id },
            };
        } catch (error) {
            logger.error("Error creating ticket channel:", error);
            throw error;
        }
    }

    async createTicketChannelWithType(
        guild: Guild,
        user: User,
        ticketData: TicketData,
        metadata?: TicketMetadata
    ): Promise<{ channel: TextChannel; ticket: any }> {
        try {
            const ticketType = ticketData.ticketType || TicketType.GENERAL;

            let ticketCategory = await this.getTicketCategoryByType(guild, ticketType);

            const ticketTypeName = this.getTicketTypeCategoryName(ticketType);

            const username = user.username.replace(/[^a-z0-9_-]/gi, '').toLowerCase();

            const tempTimestamp = Date.now().toString().slice(-6);
            const tempChannelName = `temp-ticket-${tempTimestamp}`;

            const channel = await guild.channels.create({
                name: tempChannelName,
                type: ChannelType.GuildText,
                parent: ticketCategory?.id,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                        ],
                    },
                    {
                        id: discordConfig.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                        ],
                    },
                    {
                        id: discordConfig.adminRoleId,
                        allow: [PermissionFlagsBits.Administrator],
                    },
                ],
            });

            const ticketResponse = await this.apiClient.post(
                "/api/discord/tickets",
                {
                    customerDiscordId: user.id,
                    categoryId: ticketData.categoryId,
                    serviceId: ticketData.serviceId,
                    channelId: channel.id,
                    calculatedPrice: ticketData.calculatedPrice,
                    paymentMethodId: ticketData.paymentMethodId,
                    currency: ticketData.currency || "USD",
                    customerNotes: ticketData.customerNotes,
                    customerName: user.username || user.displayName,
                    customerEmail: undefined,
                    ticketType: ticketType, 
                }
            );

            const responseData = ticketResponse.data.data || ticketResponse.data;
            const ticket = responseData.data || responseData;

            if (metadata && Object.keys(metadata).length > 0) {
                await this.saveTicketMetadata(ticket.id, metadata);
            }

            const ticketNumber = ticket.ticketNumber.toString().padStart(4, "0");
            const finalChannelName = `${username}-${ticketTypeName}-${ticketNumber}`;

            await channel.setName(finalChannelName);
            logger.info(`[TicketService] Renamed channel to: ${finalChannelName}`);

            await channel.setTopic(
                `Ticket #${ticketNumber} | ${this.getTicketTypeLabel(ticketType)} | Customer: ${user.tag}`
            );

            await this.sendWelcomeMessageForTicketType(channel, ticket, user, ticketType, ticketData.customerNotes);

            logger.info(
                `[TicketService] Created ${ticketType} ticket #${ticketNumber} for ${user.tag}`
            );

            return {
                channel,
                ticket: { ...ticket, channelId: channel.id },
            };
        } catch (error) {
            logger.error("[TicketService] Error creating ticket channel with type:", error);
            throw error;
        }
    }

    private async getTicketCategoryByType(
        guild: Guild,
        ticketType: TicketType
    ): Promise<CategoryChannel | null> {

        return await this.getOrCreateTicketsCategory(guild);
    }

    private getChannelPrefixByType(ticketType: TicketType): string {
        switch (ticketType) {
            case TicketType.PURCHASE_SERVICES_OSRS:
            case TicketType.PURCHASE_SERVICES_RS3:
                return "service-";
            case TicketType.BUY_GOLD_OSRS:
            case TicketType.BUY_GOLD_RS3:
                return "buy-gold-";
            case TicketType.SELL_GOLD_OSRS:
            case TicketType.SELL_GOLD_RS3:
                return "sell-gold-";
            case TicketType.SWAP_CRYPTO:
                return "swap-";
            default:
                return "ticket-";
        }
    }

    private getTicketTypeLabel(ticketType: TicketType): string {
        switch (ticketType) {
            case TicketType.PURCHASE_SERVICES_OSRS:
                return "OSRS Service";
            case TicketType.PURCHASE_SERVICES_RS3:
                return "RS3 Service";
            case TicketType.BUY_GOLD_OSRS:
                return "Buy OSRS Gold";
            case TicketType.BUY_GOLD_RS3:
                return "Buy RS3 Gold";
            case TicketType.SELL_GOLD_OSRS:
                return "Sell OSRS Gold";
            case TicketType.SELL_GOLD_RS3:
                return "Sell RS3 Gold";
            case TicketType.SWAP_CRYPTO:
                return "Crypto Swap";
            default:
                return "Support";
        }
    }

    private getTicketTypeCategoryName(ticketType: TicketType): string {
        switch (ticketType) {
            case TicketType.PURCHASE_SERVICES_OSRS:
            case TicketType.PURCHASE_SERVICES_RS3:
                return "services";
            case TicketType.BUY_GOLD_OSRS:
            case TicketType.BUY_GOLD_RS3:
                return "buy-gold";
            case TicketType.SELL_GOLD_OSRS:
            case TicketType.SELL_GOLD_RS3:
                return "sell-gold";
            case TicketType.SWAP_CRYPTO:
                return "swap-crypto";
            default:
                return "support";
        }
    }

    private async sendWelcomeMessageForTicketType(
        channel: TextChannel,
        ticket: any,
        user: User,
        ticketType: TicketType,
        customerNotes?: string
    ): Promise<void> {
        try {
            const ticketNumber = ticket.ticketNumber.toString().padStart(4, "0");

            let welcomeSettings: any;
            try {
                const settingsResponse = await this.apiClient.post(
                    `/discord/ticket-type-settings/render`,
                    {
                        ticketType: ticketType,
                        variables: {
                            customer: `<@${user.id}>`,
                            support: `<@&${discordConfig.supportRoleId}>`,
                            service: ticket.service?.name || "N/A",
                            price: ticket.calculatedPrice
                                ? `$${ticket.calculatedPrice.toFixed(2)}`
                                : "TBD",
                            currency: ticket.currency || "USD",
                            ticketId: ticketNumber,
                            termsChannel: onboardingConfig.termsChannelId
                                ? `<#${onboardingConfig.termsChannelId}>`
                                : "#terms-of-service",
                        },
                    }
                );

                const responseData = settingsResponse.data.data || settingsResponse.data;
                welcomeSettings = responseData;
                logger.info(`[TicketService] Fetched welcome settings for ${ticketType}`);
            } catch (error) {
                logger.warn(`[TicketService] Failed to fetch welcome settings for ${ticketType}, using fallback:`, error);
                
                welcomeSettings = {
                    title: "🎫 Welcome to Our Support Ticket System!",
                    message: `🙋 Welcome, <@${user.id}>. Thank you for reaching out to us. We're ready to help you with your request.\n\n` +
                        `👨‍💼 To ensure we can assist you as quickly and effectively as possible, please provide as much detail as you can about your request in your next message.\n\n` +
                        `⚙️ **Payment Options:** Use \`!pm\` to view all available payment methods.\n` +
                        `🎊 Use \`!reviews\` to see how you can get up to 10% OFF your order value.\n\n` +
                        `🎊 **Note:** We appreciate your patience and look forward to assisting you!\nRemember, We beat any quote!`,
                    embedColor: "5865F2",
                    bannerUrl: null,
                    footerText: null,
                    mentionCustomer: true,
                    mentionSupport: true,
                };
            }

            const embed = new EmbedBuilder()
                .setTitle(welcomeSettings.title || "🎫 Support Ticket")
                .setDescription(welcomeSettings.message)
                .setColor(parseInt(welcomeSettings.embedColor || "5865F2", 16) as ColorResolvable)
                .setTimestamp();

            if (welcomeSettings.bannerUrl) {
                embed.setThumbnail(welcomeSettings.bannerUrl);
                embed.setImage(welcomeSettings.bannerUrl);
            }

            if (welcomeSettings.footerText) {
                embed.setFooter({
                    text: welcomeSettings.footerText,
                    iconURL: "https://i.imgur.com/4M34hi2.png",
                });
            } else {
                embed.setFooter({
                    text: `Ticket #${ticketNumber}`,
                    iconURL: "https://i.imgur.com/4M34hi2.png",
                });
            }

            // Add customer Q&A if provided
            if (customerNotes && customerNotes.trim()) {
                embed.addFields({
                    name: "📝 Customer Information",
                    value: customerNotes.substring(0, 1024),
                    inline: false,
                });
            }

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_close_${ticket.id}`)
                    .setLabel("Close Ticket")
                    .setEmoji("🔒")
                    .setStyle(ButtonStyle.Danger)
            );

            let content = "";
            if (welcomeSettings.mentionCustomer) {
                content += `<@${user.id}> `;
            }
            if (welcomeSettings.mentionSupport) {
                content += `<@&${discordConfig.supportRoleId}>`;
            }

            await channel.send({
                content: content.trim() || undefined,
                embeds: [embed.toJSON() as any],
                components: [actionRow.toJSON() as any],
            });

            logger.info(`[TicketService] Sent welcome message to ticket #${ticketNumber}`);
        } catch (error) {
            logger.error("[TicketService] Error sending welcome message for ticket type:", error);
            
        }
    }

    private async saveTicketMetadata(
        ticketId: string,
        metadata: TicketMetadata
    ): Promise<void> {
        try {
            await this.apiClient.post(
                `/api/discord/tickets/${ticketId}/metadata`,
                metadata
            );
            logger.info(`[TicketService] Saved metadata for ticket ${ticketId}`);
        } catch (error) {
            logger.error(`[TicketService] Error saving ticket metadata:`, error);
            
        }
    }

    async getOrCreateTicketsCategory(
        guild: Guild
    ): Promise<CategoryChannel | null> {
        try {
            
            if (discordConfig.ticketCategoryId) {
                const existing = guild.channels.cache.get(
                    discordConfig.ticketCategoryId
                );
                if (existing && existing.type === ChannelType.GuildCategory) {
                    return existing as CategoryChannel;
                }
            }

            const existingByName = guild.channels.cache.find(
                (c) =>
                    c.name.toLowerCase() === "tickets" &&
                    c.type === ChannelType.GuildCategory
            );
            if (existingByName) {
                return existingByName as CategoryChannel;
            }

            const category = await guild.channels.create({
                name: "Tickets",
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: discordConfig.supportRoleId,
                        allow: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: discordConfig.adminRoleId,
                        allow: [PermissionFlagsBits.ViewChannel],
                    },
                ],
            });

            logger.info(`Created Tickets category: ${category.id}`);
            return category;
        } catch (error) {
            logger.error("Error getting/creating tickets category:", error);
            return null;
        }
    }

    async getOrCreateClosedTicketsCategory(
        guild: Guild
    ): Promise<CategoryChannel | null> {
        try {
            
            if (discordConfig.closedTicketsCategoryId) {
                const existing = guild.channels.cache.get(
                    discordConfig.closedTicketsCategoryId
                );
                if (existing && existing.type === ChannelType.GuildCategory) {
                    return existing as CategoryChannel;
                }
            }

            const existingByName = guild.channels.cache.find(
                (c) =>
                    c.name.toLowerCase() === "closed tickets" &&
                    c.type === ChannelType.GuildCategory
            );
            if (existingByName) {
                return existingByName as CategoryChannel;
            }

            const category = await guild.channels.create({
                name: "Closed Tickets",
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: discordConfig.supportRoleId,
                        allow: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: discordConfig.adminRoleId,
                        allow: [PermissionFlagsBits.ViewChannel],
                    },
                ],
            });

            logger.info(`Created Closed Tickets category: ${category.id}`);
            return category;
        } catch (error) {
            logger.error("Error getting/creating closed tickets category:", error);
            return null;
        }
    }

    async getWelcomeMessageSettings(
        categoryId: string
    ): Promise<WelcomeMessageSettings> {
        try {
            const response = await this.apiClient.get(
                `/discord/category-ticket-settings/category/${categoryId}`
            );

            const settingsData = response.data.data;

            if (settingsData && (settingsData.welcomeTitle || settingsData.welcomeMessage)) {
                return {
                    title:
                        settingsData.welcomeTitle ||
                        `Welcome to ${settingsData.category?.name || "Support"}!`,
                    message:
                        settingsData.welcomeMessage ||
                        "Our support team will assist you shortly.",
                    bannerUrl: settingsData.bannerUrl,
                    embedColor: settingsData.embedColor || "5865F2",
                    footerText: settingsData.footerText,
                };
            }

            return {
                title: "Welcome to Support!",
                message:
                    "Our support team will assist you shortly.\n\nPlease wait patiently while we review your request.",
                embedColor: "5865F2",
            };
        } catch (error) {
            logger.error("Error fetching welcome message settings:", error);
            
            return {
                title: "Welcome to Support!",
                message:
                    "Our support team will assist you shortly.\n\nPlease wait patiently while we review your request.",
                embedColor: "5865F2",
            };
        }
    }

    async renderWelcomeMessage(
        categoryId: string,
        variables: {
            customer: string;
            support: string;
            service?: string;
            price?: string;
            currency?: string;
            ticketId: string;
        }
    ): Promise<WelcomeMessageSettings> {
        try {
            
            const settings = await this.getWelcomeMessageSettings(categoryId);
            let message = settings.message;
            let title = settings.title;

            logger.info(`[Ticket] Raw template message: ${message}`);

            message = message.replace(/@+{customer}/g, "{customer}");
            message = message.replace(/@+{support}/g, "{support}");
            title = title.replace(/@+{customer}/g, "{customer}");
            title = title.replace(/@+{support}/g, "{support}");

            logger.info(`[Ticket] After @ strip: ${message}`);

            message = message.replace(/@+Support/gi, variables.support);
            title = title.replace(/@+Support/gi, variables.support);

            message = message.replace(/{customer}/g, variables.customer);
            message = message.replace(/{support}/g, variables.support);
            message = message.replace(/{service}/g, variables.service || "N/A");
            message = message.replace(/{price}/g, variables.price || "TBD");
            message = message.replace(/{currency}/g, variables.currency || "USD");
            message = message.replace(/{ticket_id}/g, variables.ticketId);

            title = title.replace(/{customer}/g, variables.customer);
            title = title.replace(/{service}/g, variables.service || "Support");
            title = title.replace(/{ticket_id}/g, variables.ticketId);

            return {
                ...settings,
                title,
                message,
            };
        } catch (error) {
            logger.error("Error rendering welcome message:", error);
            
            return {
                title: "Welcome to Support!",
                message: `Hello ${variables.customer}!\n\nOur support team (${variables.support}) will assist you shortly.\n\nPlease wait patiently while we review your request.`,
                embedColor: "5865F2",
            };
        }
    }

    async sendWelcomeMessage(
        channel: TextChannel,
        ticket: any,
        user: User
    ): Promise<void> {
        try {
            const ticketNumber = ticket.ticketNumber
                .toString()
                .padStart(4, "0");

            const supportMention = `<@&${discordConfig.supportRoleId}>`;
            logger.info(`[Ticket] Support mention: ${supportMention}`);
            logger.info(`[Ticket] Support role ID: ${discordConfig.supportRoleId}`);

            const welcomeSettings = await this.renderWelcomeMessage(
                ticket.categoryId,
                {
                    customer: `<@${user.id}>`,
                    support: supportMention,
                    service: ticket.service?.name,
                    price: ticket.calculatedPrice
                        ? `$${ticket.calculatedPrice.toFixed(2)}`
                        : undefined,
                    currency: ticket.currency || "USD",
                    ticketId: ticketNumber,
                }
            );

            logger.info(`[Ticket] Welcome message: ${welcomeSettings.message}`);
            logger.info(`[Ticket] Banner URL: ${welcomeSettings.bannerUrl}`);

            const embed = new EmbedBuilder()
                .setTitle(
                    `${ticket.category?.emoji || "🎫"} ${welcomeSettings.title}`
                )
                .setDescription(welcomeSettings.message)
                .setColor(
                    parseInt(welcomeSettings.embedColor, 16) as ColorResolvable
                )
                .setTimestamp()
                .setFooter({
                    text: `Ticket #${ticketNumber}`,
                });

            if (welcomeSettings.bannerUrl) {
                embed.setThumbnail(welcomeSettings.bannerUrl); 
                embed.setImage(welcomeSettings.bannerUrl);     
            }

            const detailsLines = [];
            if (ticket.service) {
                detailsLines.push(
                    `**Service:** ${ticket.service.emoji || ""} ${ticket.service.name}`
                );
            }
            if (ticket.calculatedPrice) {
                detailsLines.push(
                    `**Estimated Price:** $${ticket.calculatedPrice.toFixed(2)} ${ticket.currency || "USD"}`
                );
            }
            if (ticket.paymentMethod) {
                detailsLines.push(
                    `**Payment Method:** ${ticket.paymentMethod.name}`
                );
            }
            if (ticket.customerNotes) {
                detailsLines.push(`**Notes:** ${ticket.customerNotes}`);
            }

            if (detailsLines.length > 0) {
                embed.addFields({
                    name: "📋 Order Details",
                    value: detailsLines.join("\n"),
                    inline: false,
                });
            }

            if (welcomeSettings.footerText) {
                embed.addFields({
                    name: "ℹ️ Information",
                    value: welcomeSettings.footerText,
                    inline: false,
                });
            }

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_calculate_${ticket.id}`)
                    .setLabel("Calculate Price")
                    .setEmoji("💰")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`ticket_close_${ticket.id}`)
                    .setLabel("Close Ticket")
                    .setEmoji("❌")
                    .setStyle(ButtonStyle.Danger)
            );

            const contentMention = `<@${user.id}> ${supportMention}`;
            logger.info(`[Ticket] Content mention string: ${contentMention}`);

            await channel.send({
                content: contentMention,
                embeds: [embed.toJSON() as any],
                components: [actionRow.toJSON() as any],
            });

            logger.info(`Sent welcome message to ticket #${ticketNumber}`);
        } catch (error) {
            logger.error("Error sending welcome message:", error);
            throw error;
        }
    }

    async closeTicket(
        ticketId: string,
        closedByUser: User,
        reason?: string
    ): Promise<void> {
        try {
            const [_, ticket] = await Promise.all([
                this.apiClient.post(`/api/discord/tickets/${ticketId}/close`, { reason })
                    .catch(() => null),
                this.getTicketById(ticketId),
            ]);

            if (!ticket?.channelId) return;

            const channel = this.client.channels.cache.get(ticket.channelId);
            if (!channel || !(channel instanceof TextChannel)) return;

            const closeEmbed = new EmbedBuilder()
                .setTitle("🔒 Ticket Closed")
                .setDescription(`This ticket has been closed by <@${closedByUser.id}>.`)
                .setColor(0xed4245)
                .setTimestamp();

            if (reason) {
                closeEmbed.addFields({ name: "Reason", value: reason });
            }

            await channel.send({ embeds: [closeEmbed.toJSON() as any] });

            await this.disableTicketButtons(channel);

            if (ticket.customerDiscordId) {
                await channel.permissionOverwrites.edit(ticket.customerDiscordId, {
                    ViewChannel: false
                }).catch(err => logger.warn(`[CloseTicket] Permission update failed: ${err.message}`));
            }

            const mover = getTicketChannelMover(this.client);
            mover.queueMove(channel.id, ticketId);

            logger.info(`[CloseTicket] Ticket ${ticketId} closed by ${closedByUser.tag}${reason ? `: ${reason}` : ""}`);
        } catch (error) {
            logger.error("[CloseTicket] Error:", error);
            throw error;
        }
    }

    private async disableTicketButtons(channel: TextChannel): Promise<void> {
        try {
            const messages = await channel.messages.fetch({ limit: 100 });
            const welcomeMessage = messages.find(msg =>
                msg.author.id === this.client.user?.id &&
                msg.components.length > 0 &&
                msg.components[0].components.some((c: any) => c.customId?.startsWith('ticket_close_'))
            );

            if (!welcomeMessage) return;

            const disabledComponents = welcomeMessage.components.map(row => {
                const actionRow = new ActionRowBuilder<ButtonBuilder>();
                row.components.forEach((component: any) => {
                    if (component.type === 2) {
                        actionRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
                    }
                });
                return actionRow;
            });

            await welcomeMessage.edit({ components: disabledComponents as any });
        } catch (err: any) {
            logger.warn(`[CloseTicket] Button disable failed: ${err.message}`);
        }
    }

    async archiveOldClosedTickets(guild: Guild): Promise<void> {
        try {
            logger.info("[ArchiveClosedTickets] Starting archive process for old closed tickets");

            const closedCategory = await this.getOrCreateClosedTicketsCategory(guild);
            if (!closedCategory) {
                logger.warn("[ArchiveClosedTickets] Could not find Closed Tickets category");
                return;
            }

            const closedChannels = guild.channels.cache.filter(
                channel =>
                    channel.parentId === closedCategory.id &&
                    channel.isTextBased() &&
                    channel.name.startsWith("closed-")
            );

            if (closedChannels.size === 0) {
                logger.info("[ArchiveClosedTickets] No closed tickets found to archive");
                return;
            }

            logger.info(`[ArchiveClosedTickets] Found ${closedChannels.size} closed ticket channels`);

            const now = Date.now();
            const archiveThreshold = discordConfig.closedTicketArchiveAfter;
            let archivedCount = 0;

            for (const [channelId, channel] of closedChannels) {
                try {

                    const lastMessage = channel.isTextBased() ?
                        await channel.messages.fetch({ limit: 1 }).then(msgs => msgs.first()) :
                        null;

                    const lastActivityTime = lastMessage?.createdTimestamp || channel.createdTimestamp || 0;
                    const timeSinceLastActivity = now - lastActivityTime;

                    if (timeSinceLastActivity >= archiveThreshold) {
                        logger.info(
                            `[ArchiveClosedTickets] Archiving ${channel.name} (last activity: ${Math.floor(timeSinceLastActivity / (60 * 60 * 1000))}h ago)`
                        );

                        await channel.delete(`Auto-archive: Closed ticket older than ${Math.floor(archiveThreshold / (60 * 60 * 1000))} hours`);
                        archivedCount++;

                        logger.info(`[ArchiveClosedTickets] Archived and deleted ${channel.name}`);
                    }
                } catch (error) {
                    logger.error(`[ArchiveClosedTickets] Error archiving channel ${channel.name}:`, error);
                }
            }

            logger.info(`[ArchiveClosedTickets] Archive process completed. Archived ${archivedCount} tickets`);
        } catch (error) {
            logger.error("[ArchiveClosedTickets] Error in archive process:", error);
        }
    }

    async getTicketById(ticketId: string): Promise<any> {
        try {
            const response = await this.apiClient.get(
                `/api/discord/tickets/${ticketId}`
            );

            const responseData = response.data.data || response.data;
            const ticketData = responseData.data || responseData;

            if (ticketData && ticketData.id) {
                return ticketData;
            }
            return null;
        } catch (error) {
            logger.error("Error fetching ticket:", error);
            return null;
        }
    }

    async getTicketByChannelId(channelId: string): Promise<any> {
        try {
            const response = await this.apiClient.get(
                `/api/discord/tickets/channel/${channelId}`
            );
            
            const responseData = response.data.data || response.data;
            const ticketData = responseData.data || responseData;

            if (ticketData && ticketData.id) {
                return ticketData;
            }
            return null;
        } catch (error) {
            logger.error("Error fetching ticket by channel:", error);
            return null;
        }
    }

    async getOpenTicketsForUser(discordId: string): Promise<any[]> {
        try {
            const response = await this.apiClient.get(
                `/api/discord/tickets/customer/${discordId}/open`
            );
            
            const responseData = response.data.data || response.data;
            const ticketsData = responseData.data || responseData;

            if (Array.isArray(ticketsData)) {
                return ticketsData;
            }
            return [];
        } catch (error) {
            logger.error("Error fetching open tickets:", error);
            return [];
        }
    }

    async updateTicketStatus(
        ticketId: string,
        status: string,
        reason?: string
    ): Promise<void> {
        try {
            await this.apiClient.patch(
                `/api/discord/tickets/${ticketId}/status`,
                {
                    status,
                    reason,
                }
            );
        } catch (error) {
            logger.error("Error updating ticket status:", error);
            throw error;
        }
    }
}

let ticketServiceInstance: TicketService | null = null;

export function getTicketService(client: Client): TicketService {
    if (!ticketServiceInstance) {
        ticketServiceInstance = new TicketService(client);
    }
    return ticketServiceInstance;
}

export default TicketService;
