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
import { ApiService } from "./api.service";
import logger from "../../common/loggers";
import axios, { AxiosInstance } from "axios";

// Ticket data interface
export interface TicketData {
    id?: string;
    ticketNumber?: number;
    customerId?: number;
    customerDiscordId: string;
    categoryId: string;
    serviceId?: string;
    channelId?: string;
    calculatedPrice?: number;
    paymentMethodId?: string;
    currency?: string;
    customerNotes?: string;
    customerName: string;
}

// Welcome message settings interface
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
            timeout: 5000, // Reduced timeout for faster failure detection
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    /**
     * Create a new ticket channel
     */
    async createTicketChannel(
        guild: Guild,
        user: User,
        ticketData: TicketData
    ): Promise<{ channel: TextChannel; ticket: any }> {
        try {
            // Get or create the tickets category first
            let ticketCategory = await this.getOrCreateTicketsCategory(guild);

            // Generate a temporary ticket number for the channel name
            // We'll use timestamp-based to ensure uniqueness
            const tempTicketNumber = Date.now().toString().slice(-6);
            const tempChannelName = `${discordConfig.ticketChannelPrefix}${tempTicketNumber}`;

            // Create the channel first with proper permissions
            const channel = await guild.channels.create({
                name: tempChannelName,
                type: ChannelType.GuildText,
                parent: ticketCategory?.id,
                permissionOverwrites: [
                    {
                        // Deny everyone from viewing
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        // Allow the customer
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
                        // Allow support role
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
                        // Allow admin role
                        id: discordConfig.adminRoleId,
                        allow: [PermissionFlagsBits.Administrator],
                    },
                ],
            });

            // Now create the ticket in the database with the real channel ID
            const ticketResponse = await this.apiClient.post(
                "/api/discord/tickets",
                {
                    customerDiscordId: user.id,
                    categoryId: ticketData.categoryId,
                    serviceId: ticketData.serviceId,
                    channelId: channel.id, // Use the real channel ID
                    calculatedPrice: ticketData.calculatedPrice,
                    paymentMethodId: ticketData.paymentMethodId,
                    currency: ticketData.currency || "USD",
                    customerNotes: ticketData.customerNotes,
                    customerName: user.username || user.displayName,
                    customerEmail: undefined,
                }
            );

            logger.info(`[TicketService] API Response: ${JSON.stringify(ticketResponse.data)}`);

            // Handle nested response from API interceptor
            // Response format: { msg, status, data: { success, data: ticket }, error }
            const responseData = ticketResponse.data.data || ticketResponse.data;

            if (!responseData.success && !responseData.id) {
                // Delete the channel if ticket creation failed
                logger.error(`[TicketService] Ticket creation failed. Response: ${JSON.stringify(ticketResponse.data)}`);
                await channel.delete("Ticket creation failed").catch(() => {});
                throw new Error("Failed to create ticket in database");
            }

            // Get the ticket from nested response or direct response
            const ticket = responseData.data || responseData;
            const ticketNumber = ticket.ticketNumber
                .toString()
                .padStart(4, "0");

            // Rename the channel with the proper ticket number
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

    /**
     * Get or create the tickets category
     */
    async getOrCreateTicketsCategory(
        guild: Guild
    ): Promise<CategoryChannel | null> {
        try {
            // Try to find existing category
            if (discordConfig.ticketCategoryId) {
                const existing = guild.channels.cache.get(
                    discordConfig.ticketCategoryId
                );
                if (existing && existing.type === ChannelType.GuildCategory) {
                    return existing as CategoryChannel;
                }
            }

            // Try to find by name
            const existingByName = guild.channels.cache.find(
                (c) =>
                    c.name.toLowerCase() === "tickets" &&
                    c.type === ChannelType.GuildCategory
            );
            if (existingByName) {
                return existingByName as CategoryChannel;
            }

            // Create new category
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

    /**
     * Get welcome message settings for a category
     */
    async getWelcomeMessageSettings(
        categoryId: string
    ): Promise<WelcomeMessageSettings> {
        try {
            const response = await this.apiClient.get(
                `/api/discord/category-ticket-settings/category/${categoryId}`
            );

            // Handle nested response from API interceptor
            const responseData = response.data.data || response.data;
            const settingsData = responseData.data || responseData;

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

            // Return defaults
            return {
                title: "Welcome to Support!",
                message:
                    "Our support team will assist you shortly.\n\nPlease wait patiently while we review your request.",
                embedColor: "5865F2",
            };
        } catch (error) {
            logger.error("Error fetching welcome message settings:", error);
            // Return defaults on error
            return {
                title: "Welcome to Support!",
                message:
                    "Our support team will assist you shortly.\n\nPlease wait patiently while we review your request.",
                embedColor: "5865F2",
            };
        }
    }

    /**
     * Render welcome message with variables
     */
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
            // Get settings and render manually (more reliable than API call)
            const settings = await this.getWelcomeMessageSettings(categoryId);
            let message = settings.message;
            let title = settings.title;

            logger.info(`[Ticket] Raw template message: ${message}`);

            // First, handle cases where users added @ before mention variables
            // (e.g., @{customer}, @@{support}, etc.) - the variables already contain the mention format
            // Use @+ to match one or more @ symbols before the variable
            message = message.replace(/@+{customer}/g, "{customer}");
            message = message.replace(/@+{support}/g, "{support}");
            title = title.replace(/@+{customer}/g, "{customer}");
            title = title.replace(/@+{support}/g, "{support}");

            logger.info(`[Ticket] After @ strip: ${message}`);

            // Also handle literal @Support or @@Support text (not using variable)
            // Replace any instance of @+Support (case insensitive) with the proper mention
            message = message.replace(/@+Support/gi, variables.support);
            title = title.replace(/@+Support/gi, variables.support);

            // Variable replacement in message
            message = message.replace(/{customer}/g, variables.customer);
            message = message.replace(/{support}/g, variables.support);
            message = message.replace(/{service}/g, variables.service || "N/A");
            message = message.replace(/{price}/g, variables.price || "TBD");
            message = message.replace(/{currency}/g, variables.currency || "USD");
            message = message.replace(/{ticket_id}/g, variables.ticketId);

            // Variable replacement in title
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
            // Return basic defaults
            return {
                title: "Welcome to Support!",
                message: `Hello ${variables.customer}!\n\nOur support team (${variables.support}) will assist you shortly.\n\nPlease wait patiently while we review your request.`,
                embedColor: "5865F2",
            };
        }
    }

    /**
     * Send welcome message to ticket channel
     */
    async sendWelcomeMessage(
        channel: TextChannel,
        ticket: any,
        user: User
    ): Promise<void> {
        try {
            const ticketNumber = ticket.ticketNumber
                .toString()
                .padStart(4, "0");

            // Build support mention - ensure clean format
            const supportMention = `<@&${discordConfig.supportRoleId}>`;
            logger.info(`[Ticket] Support mention: ${supportMention}`);
            logger.info(`[Ticket] Support role ID: ${discordConfig.supportRoleId}`);

            // Get rendered welcome message
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

            // Create the embed
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

            // Add banner image if set (both as thumbnail on right and large image at bottom)
            if (welcomeSettings.bannerUrl) {
                embed.setThumbnail(welcomeSettings.bannerUrl); // Small image on the right
                embed.setImage(welcomeSettings.bannerUrl);     // Large banner at the bottom
            }

            // Add ticket details field
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

            // Add footer text if set
            if (welcomeSettings.footerText) {
                embed.addFields({
                    name: "ℹ️ Information",
                    value: welcomeSettings.footerText,
                    inline: false,
                });
            }

            // Create action buttons
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

            // Send the welcome message with mentions
            // Use the supportMention variable we created earlier (already validated)
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

    /**
     * Close a ticket
     */
    async closeTicket(
        ticketId: string,
        closedByUser: User,
        reason?: string
    ): Promise<void> {
        try {
            logger.info(`[CloseTicket] Starting close for ticket ${ticketId}`);

            // Run API call and ticket fetch in parallel for faster response
            const [_, ticketResponse] = await Promise.all([
                this.apiClient.post(`/api/discord/tickets/${ticketId}/close`, {
                    reason,
                }).catch(err => {
                    logger.warn(`[CloseTicket] API close call failed (will continue):`, err.message);
                    return null;
                }),
                this.getTicketById(ticketId),
            ]);

            logger.info(`[CloseTicket] API call completed, ticket data: ${ticketResponse ? 'found' : 'not found'}`);

            if (ticketResponse && ticketResponse.channelId) {
                const channel = this.client.channels.cache.get(
                    ticketResponse.channelId
                );

                if (channel && channel instanceof TextChannel) {
                    // Send closing message first (most important)
                    const embed = new EmbedBuilder()
                        .setTitle("🔒 Ticket Closed")
                        .setDescription(
                            `This ticket has been closed by <@${closedByUser.id}>.`
                        )
                        .setColor(0xed4245)
                        .setTimestamp();

                    if (reason) {
                        embed.addFields({
                            name: "Reason",
                            value: reason,
                        });
                    }

                    await channel.send({ embeds: [embed.toJSON() as any] });
                    logger.info(`[CloseTicket] Sent close message`);

                    // Run channel updates in parallel (non-critical)
                    const updatePromises: Promise<any>[] = [];

                    // Rename channel
                    updatePromises.push(
                        channel.setName(`closed-${channel.name.replace("ticket-", "")}`)
                            .catch(err => logger.warn(`[CloseTicket] Failed to rename channel:`, err.message))
                    );

                    // Remove customer permissions
                    if (ticketResponse.customerDiscordId) {
                        updatePromises.push(
                            channel.permissionOverwrites.edit(
                                ticketResponse.customerDiscordId,
                                { ViewChannel: false }
                            ).catch(err => logger.warn(`[CloseTicket] Failed to update permissions:`, err.message))
                        );
                    }

                    // Wait for all updates but don't fail if they error
                    await Promise.allSettled(updatePromises);
                    logger.info(`[CloseTicket] Channel updates completed`);
                }
            }

            logger.info(
                `[CloseTicket] Ticket ${ticketId} closed by ${closedByUser.tag}${reason ? `: ${reason}` : ""}`
            );
        } catch (error) {
            logger.error("[CloseTicket] Error closing ticket:", error);
            throw error;
        }
    }

    /**
     * Get ticket by ID
     */
    async getTicketById(ticketId: string): Promise<any> {
        try {
            const response = await this.apiClient.get(
                `/api/discord/tickets/${ticketId}`
            );
            // Handle nested response from API interceptor
            // Response format: { msg, status, data: { success, data: ticket }, error }
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

    /**
     * Get ticket by channel ID
     */
    async getTicketByChannelId(channelId: string): Promise<any> {
        try {
            const response = await this.apiClient.get(
                `/api/discord/tickets/channel/${channelId}`
            );
            // Handle nested response from API interceptor
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

    /**
     * Get open tickets for a user
     */
    async getOpenTicketsForUser(discordId: string): Promise<any[]> {
        try {
            const response = await this.apiClient.get(
                `/api/discord/tickets/customer/${discordId}/open`
            );
            // Handle nested response from API interceptor
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

    /**
     * Update ticket status
     */
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

// Singleton instance
let ticketServiceInstance: TicketService | null = null;

export function getTicketService(client: Client): TicketService {
    if (!ticketServiceInstance) {
        ticketServiceInstance = new TicketService(client);
    }
    return ticketServiceInstance;
}

export default TicketService;
