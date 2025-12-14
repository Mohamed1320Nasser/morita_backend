import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import axios from "axios";
import logger from "../../../common/loggers";
import { TicketType } from "../../types/discord.types";
import { discordConfig } from "../../config/discord.config";
import { CustomFieldDefinition } from "../../../api/ticketTypeSettings/dtos";

/**
 * Handle Create Ticket button clicks
 * Supports all ticket types:
 * - PURCHASE_SERVICES_OSRS, PURCHASE_SERVICES_RS3
 * - BUY_GOLD_OSRS, BUY_GOLD_RS3
 * - SELL_GOLD_OSRS, SELL_GOLD_RS3
 * - SWAP_CRYPTO
 */
export async function handleCreateTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Extract ticket type from customId
        // Format: create_ticket_PURCHASE_SERVICES_OSRS
        const ticketType = interaction.customId.replace("create_ticket_", "") as TicketType;

        logger.info(`[CreateTicket] Opening modal for ${ticketType} by ${interaction.user.tag}`);

        // Build modal based on ticket type (dynamically from API)
        const modal = await buildModalForTicketType(ticketType);

        await interaction.showModal(modal as any);
    } catch (error: any) {
        logger.error("[CreateTicket] Error showing modal:", error);

        // Check if error is due to interaction timeout
        if (error.message?.includes('Unknown interaction') || error.code === 10062) {
            logger.warn("[CreateTicket] Interaction expired - user may need to click button again");
            // Can't reply - interaction is expired
            return;
        }

        // Only try to reply if interaction wasn't acknowledged yet
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: "❌ Failed to open ticket form. Please try again or contact support.",
                    ephemeral: true,
                });
            } catch (replyError) {
                logger.error("[CreateTicket] Failed to send error reply:", replyError);
            }
        }
    }
}

/**
 * Build modal based on ticket type (fetch custom fields from API)
 */
async function buildModalForTicketType(ticketType: TicketType): Promise<ModalBuilder> {
    const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${ticketType}`)
        .setTitle(getModalTitle(ticketType));

    try {
        // Fetch custom fields from API
        const response = await axios.get(
            `${discordConfig.apiBaseUrl}/api/discord/ticket-type-settings/${ticketType}/custom-fields`
        );

        const customFieldsData = response.data?.data;

        if (customFieldsData && customFieldsData.fields && customFieldsData.fields.length > 0) {
            // Use custom fields from database
            const fields = buildFieldsFromCustomDefinitions(customFieldsData.fields);
            modal.addComponents(...fields.slice(0, 5)); // Discord max 5 components per modal
        } else {
            // Fallback to hardcoded fields
            const fields = getModalFields(ticketType);
            modal.addComponents(...fields);
        }
    } catch (error) {
        logger.warn(`[CreateTicket] Failed to fetch custom fields for ${ticketType}, using defaults:`, error);
        // Fallback to hardcoded fields
        const fields = getModalFields(ticketType);
        modal.addComponents(...fields);
    }

    return modal;
}

/**
 * Build modal fields from custom field definitions
 */
function buildFieldsFromCustomDefinitions(
    customFields: CustomFieldDefinition[]
): ActionRowBuilder<TextInputBuilder>[] {
    const rows: ActionRowBuilder<TextInputBuilder>[] = [];

    // Discord modals support max 5 action rows
    for (let i = 0; i < Math.min(customFields.length, 5); i++) {
        const field = customFields[i];

        const input = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label)
            .setRequired(field.required);

        // Set placeholder if provided
        if (field.placeholder) {
            input.setPlaceholder(field.placeholder);
        }

        // Set style based on type
        if (field.type === "textarea") {
            input.setStyle(TextInputStyle.Paragraph);
        } else {
            input.setStyle(TextInputStyle.Short);
        }

        // Set max length if provided
        if (field.maxLength) {
            input.setMaxLength(field.maxLength);
        }

        // Set min/max for number fields (as value constraints)
        if (field.type === "number") {
            if (field.min !== undefined) {
                input.setMinLength(1); // At least 1 character for numbers
            }
            if (field.max !== undefined) {
                input.setMaxLength(20); // Reasonable max for numbers
            }
        }

        rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    return rows;
}

/**
 * Get modal title based on ticket type
 */
function getModalTitle(ticketType: TicketType): string {
    switch (ticketType) {
        case TicketType.PURCHASE_SERVICES_OSRS:
            return "Order OSRS Service";
        case TicketType.PURCHASE_SERVICES_RS3:
            return "Order RS3 Service";
        case TicketType.BUY_GOLD_OSRS:
            return "Buy OSRS Gold";
        case TicketType.BUY_GOLD_RS3:
            return "Buy RS3 Gold";
        case TicketType.SELL_GOLD_OSRS:
            return "Sell OSRS Gold";
        case TicketType.SELL_GOLD_RS3:
            return "Sell RS3 Gold";
        case TicketType.SWAP_CRYPTO:
            return "Swap Cryptocurrency";
        default:
            return "Open Support Ticket";
    }
}

/**
 * Get modal fields based on ticket type
 */
function getModalFields(ticketType: TicketType): ActionRowBuilder<TextInputBuilder>[] {
    // Common fields
    const rows: ActionRowBuilder<TextInputBuilder>[] = [];

    if (ticketType === TicketType.PURCHASE_SERVICES_OSRS || ticketType === TicketType.PURCHASE_SERVICES_RS3) {
        // SERVICE ORDER FORM
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
    } else if (ticketType === TicketType.BUY_GOLD_OSRS || ticketType === TicketType.BUY_GOLD_RS3) {
        // BUY GOLD FORM
        rows.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("gold_amount")
                    .setLabel("How much gold do you need? (in millions)")
                    .setPlaceholder("e.g., 100 (for 100M)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(20)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("delivery_method")
                    .setLabel("Preferred Delivery Method")
                    .setPlaceholder("F2P, P2P, Drop Trading, POH, etc.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(100)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("osrs_username")
                    .setLabel(`${ticketType.includes("OSRS") ? "OSRS" : "RS3"} Username`)
                    .setPlaceholder("Your in-game username")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("additional_notes")
                    .setLabel("Additional Notes (Optional)")
                    .setPlaceholder("Any special requirements...")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(500)
            )
        );
    } else if (ticketType === TicketType.SELL_GOLD_OSRS || ticketType === TicketType.SELL_GOLD_RS3) {
        // SELL GOLD FORM
        rows.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("gold_amount")
                    .setLabel("How much gold do you want to sell? (in millions)")
                    .setPlaceholder("e.g., 500 (for 500M)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(20)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("payment_method")
                    .setLabel("Preferred Payment Method")
                    .setPlaceholder("PayPal, Crypto, Bank Transfer, etc.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("payment_details")
                    .setLabel("Payment Details (Email/Wallet Address)")
                    .setPlaceholder("PayPal email or crypto wallet address")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(255)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("osrs_username")
                    .setLabel(`${ticketType.includes("OSRS") ? "OSRS" : "RS3"} Username`)
                    .setPlaceholder("Your in-game username")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
            )
        );
    } else if (ticketType === TicketType.SWAP_CRYPTO) {
        // CRYPTO SWAP FORM
        rows.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("swap_direction")
                    .setLabel("Swap Direction")
                    .setPlaceholder("Crypto to Gold OR Gold to Crypto")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("crypto_type")
                    .setLabel("Cryptocurrency Type")
                    .setPlaceholder("BTC, ETH, USDT, etc.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(20)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("amount")
                    .setLabel("Amount")
                    .setPlaceholder("How much crypto or gold?")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("wallet_or_username")
                    .setLabel("Wallet Address or OSRS Username")
                    .setPlaceholder("Depending on swap direction")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(500)
            )
        );
    }

    return rows;
}
