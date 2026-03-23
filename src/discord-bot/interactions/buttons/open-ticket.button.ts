import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import logger from "../../../common/loggers";
import { getTicketService } from "../../services/ticket.service";
import { discordConfig } from "../../config/discord.config";
import { TicketType } from "../../types/discord.types";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { getRedisService } from "../../../common/services/redis.service";

const redisService = getRedisService();

async function buildModalForTicketType(ticketType: TicketType): Promise<ModalBuilder> {
    const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${ticketType}`)
        .setTitle(getModalTitle(ticketType));

    try {
        const response: any = await discordApiClient.get(
            `/discord/ticket-type-settings/${ticketType}/custom-fields`
        );

        const customFieldsData = response?.data;

        if (customFieldsData && Array.isArray(customFieldsData.fields) && customFieldsData.fields.length > 0) {
            const fields = buildFieldsFromCustomDefinitions(customFieldsData.fields);
            if (fields.length > 0) {
                modal.addComponents(...fields.slice(0, 5));
            } else {
                const defaultFields = getModalFields(ticketType);
                modal.addComponents(...defaultFields);
            }
        } else {
            const fields = getModalFields(ticketType);
            modal.addComponents(...fields);
        }
    } catch (error) {
        logger.warn(`[OpenTicket] Failed to fetch custom fields for ${ticketType}, using defaults:`, error);
        const fields = getModalFields(ticketType);
        modal.addComponents(...fields);
    }

    return modal;
}

function buildFieldsFromCustomDefinitions(customFields: any[]): ActionRowBuilder<TextInputBuilder>[] {
    const rows: ActionRowBuilder<TextInputBuilder>[] = [];

    if (!Array.isArray(customFields) || customFields.length === 0) {
        return rows;
    }

    const validFields = customFields.filter(field => field && field.id && field.label);
    const fieldCount = Math.min(validFields.length, 5);

    for (let i = 0; i < fieldCount; i++) {
        const field = validFields[i];

        try {
            const input = new TextInputBuilder()
                .setCustomId(field.id)
                .setLabel((field.label || "Field").slice(0, 45))
                .setRequired(field.required ?? false);

            if (field.placeholder) {
                input.setPlaceholder(field.placeholder.slice(0, 100));
            }

            if (field.type === "textarea") {
                input.setStyle(TextInputStyle.Paragraph);
            } else {
                input.setStyle(TextInputStyle.Short);
            }

            if (field.maxLength && field.maxLength > 0) {
                input.setMaxLength(Math.min(field.maxLength, 4000));
            }

            rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        } catch (fieldError) {
            logger.error(`[OpenTicket] Error building field ${field.id}:`, fieldError);
        }
    }

    return rows;
}

function getModalTitle(ticketType: TicketType): string {
    switch (ticketType) {
        case TicketType.PURCHASE_SERVICES_OSRS:
            return "Order OSRS Service";
        case TicketType.PURCHASE_SERVICES_RS3:
            return "Order RS3 Service";
        default:
            return "Open Support Ticket";
    }
}

function getModalFields(ticketType: TicketType): ActionRowBuilder<TextInputBuilder>[] {
    const rows: ActionRowBuilder<TextInputBuilder>[] = [];

    if (ticketType === TicketType.PURCHASE_SERVICES_OSRS || ticketType === TicketType.PURCHASE_SERVICES_RS3) {
        rows.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("service_description")
                    .setLabel("What service do you need?")
                    .setPlaceholder("e.g., 1-99 Sailing, Quest Cape, Raids, etc.")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("osrs_username")
                    .setLabel(`${ticketType.includes("OSRS") ? "OSRS" : "RS3"} Username`)
                    .setPlaceholder("Your in-game username")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(50)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("additional_notes")
                    .setLabel("Additional Notes (Optional)")
                    .setPlaceholder("Any special requirements or details...")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(500)
            )
        );
    }

    return rows;
}

export async function handleOpenTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Extract serviceId and categoryId from button customId
        const customIdParts = interaction.customId.split("_");
        const serviceId = customIdParts[2] || undefined;
        const categoryId = customIdParts[3] || undefined;
        const calculatedPrice = customIdParts[4] ? parseFloat(customIdParts[4]) : undefined;

        // Determine ticket type based on service
        let ticketType: TicketType = TicketType.PURCHASE_SERVICES_OSRS;

        if (serviceId) {
            try {
                const serviceResponse: any = await discordApiClient.get(
                    `/api/public/services/${serviceId}/pricing`
                );
                const serviceData = serviceResponse.data || serviceResponse;
                const game = serviceData?.game || 'OSRS';
                ticketType = game === 'RS3'
                    ? TicketType.PURCHASE_SERVICES_RS3
                    : TicketType.PURCHASE_SERVICES_OSRS;

                logger.info(`[OpenTicket] Determined ticket type ${ticketType} for service ${serviceId} (game: ${game})`);
            } catch (error) {
                logger.warn(`[OpenTicket] Failed to fetch service ${serviceId}, defaulting to OSRS`, error);
            }
        }

        // Build modal using NEW ticket system
        const modal = await buildModalForTicketType(ticketType);

        // ALWAYS store metadata in Redis to avoid customId length issues
        const modalKey = `ticket_modal_${interaction.user.id}_${Date.now()}`;
        await redisService.set(modalKey, JSON.stringify({
            serviceId: serviceId || null,
            categoryId: categoryId || null,
            ticketType: ticketType
        }), 300); // 5 min TTL

        logger.info(`[OpenTicket] Stored ticket metadata in Redis: ${modalKey}, serviceId: ${serviceId}, categoryId: ${categoryId}`);

        // Use short customId with Redis key
        modal.setCustomId(`ticket_modal_${ticketType}_${modalKey}`);

        await interaction.showModal(modal as any);

        logger.info(
            `[OpenTicket] Opened NEW ticket modal for ${ticketType}, serviceId: ${serviceId}, categoryId: ${categoryId}`
        );
    } catch (error) {
        logger.error("[OpenTicket] Error handling open ticket button:", error);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content:
                    "Failed to open ticket form. Please try again or contact support directly.",
                ephemeral: true,
            });
        } else {
            await interaction.reply({
                content:
                    "Failed to open ticket form. Please try again or contact support directly.",
                ephemeral: true,
            });
        }
    }
}

export async function handleTicketCalculate(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const ticketId = interaction.customId.replace("ticket_calculate_", "");

        const ticketService = getTicketService(interaction.client);
        const ticket = await ticketService.getTicketById(ticketId);

        if (!ticket) {
            await interaction.reply({
                content: "Could not find ticket information.",
                ephemeral: true,
            });
            return;
        }

        if (ticket.serviceId) {
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

            const modal = new ModalBuilder()
                .setCustomId(`calculator_modal_inticket_${ticket.serviceId}`)
                .setTitle("Price Calculator");

            const startLevelInput = new TextInputBuilder()
                .setCustomId("start_level")
                .setLabel("Start Level")
                .setPlaceholder("Enter your current level (1-99)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(2);

            const endLevelInput = new TextInputBuilder()
                .setCustomId("end_level")
                .setLabel("End Level")
                .setPlaceholder("Enter your target level (1-99)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(2);

            const row1 = new ActionRowBuilder().addComponents(startLevelInput);
            const row2 = new ActionRowBuilder().addComponents(endLevelInput);

            modal.addComponents(row1, row2);

            await interaction.showModal(modal as any);
        } else {
            
            await interaction.reply({
                content:
                    "Use the `/pricing` command to browse services and calculate prices.",
                ephemeral: true,
            });
        }
    } catch (error) {
        logger.error("Error handling ticket calculate button:", error);
        await interaction.reply({
            content: "Failed to open calculator. Please try again.",
            ephemeral: true,
        });
    }
}

export async function handleTicketClose(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const ticketId = interaction.customId.replace("ticket_close_", "");

        const member = interaction.member;
        const isSupport =
            member &&
            "roles" in member &&
            (member.roles as any).cache?.has(discordConfig.supportRoleId);
        const isAdmin =
            member &&
            "roles" in member &&
            (member.roles as any).cache?.has(discordConfig.adminRoleId);

        if (!isSupport && !isAdmin) {
            
            const ticketService = getTicketService(interaction.client);
            const ticket = await ticketService.getTicketById(ticketId);

            if (!ticket) {
                await interaction.reply({
                    content: "Could not find ticket information.",
                    ephemeral: true,
                });
                return;
            }

            const isCustomer = ticket.customerDiscordId === interaction.user.id;

            if (!isCustomer) {
                await interaction.reply({
                    content: "You do not have permission to close this ticket.",
                    ephemeral: true,
                });
                return;
            }
        }

        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

        const modal = new ModalBuilder()
            .setCustomId(`ticket_close_confirm_${ticketId}`)
            .setTitle("Close Ticket");

        const reasonInput = new TextInputBuilder()
            .setCustomId("close_reason")
            .setLabel("Reason for closing (Optional)")
            .setPlaceholder("Why are you closing this ticket?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500);

        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);

        await interaction.showModal(modal as any);

        logger.info(
            `Close ticket modal opened for ticket ${ticketId} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling ticket close button:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "Failed to open close dialog. Please try again.",
                ephemeral: true,
            });
        }
    }
}
