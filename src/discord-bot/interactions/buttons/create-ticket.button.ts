import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import logger from "../../../common/loggers";
import { TicketType } from "../../types/discord.types";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { CustomFieldDefinition } from "../../../api/ticketTypeSettings/dtos";

const modalCache = new Map<string, { modal: ModalBuilder; timestamp: number }>();
const CACHE_TTL = 30000; 

export async function handleCreateTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {

        const ticketType = interaction.customId.replace("create_ticket_", "") as TicketType;

        logger.info(`[CreateTicket] Opening modal for ${ticketType} by ${interaction.user.tag}`);

        const modal = await buildModalForTicketTypeCached(ticketType);

        await interaction.showModal(modal as any);
    } catch (error: any) {
        logger.error("[CreateTicket] Error showing modal:", error);

        if (error.message?.includes('Unknown interaction') || error.code === 10062) {
            logger.warn("[CreateTicket] Interaction expired - user may need to click button again");
            
            return;
        }

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

async function buildModalForTicketTypeCached(ticketType: TicketType): Promise<ModalBuilder> {
    const now = Date.now();
    const cached = modalCache.get(ticketType);

    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        // Validate cached modal has components
        if (cached.modal.data.components && cached.modal.data.components.length > 0) {
            logger.info(`[CreateTicket] Using cached modal for ${ticketType}`);
            return cloneModal(cached.modal, ticketType);
        } else {
            logger.warn(`[CreateTicket] Cached modal for ${ticketType} has no components, rebuilding`);
            modalCache.delete(ticketType);
        }
    }

    const modal = await buildModalForTicketType(ticketType);

    // Only cache if modal has valid components
    if (modal.data.components && modal.data.components.length > 0) {
        modalCache.set(ticketType, { modal, timestamp: now });
    }

    return modal;
}

function cloneModal(originalModal: ModalBuilder, ticketType: TicketType): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${ticketType}`)
        .setTitle(originalModal.data.title || getModalTitle(ticketType));

    if (originalModal.data.components) {
        modal.addComponents(...(originalModal.data.components as any));
    }

    return modal;
}

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

            // If custom fields returned empty rows, fallback to defaults
            if (fields.length > 0) {
                modal.addComponents(...fields.slice(0, 5));
            } else {
                logger.warn(`[CreateTicket] Custom fields returned empty for ${ticketType}, using defaults`);
                const defaultFields = getModalFields(ticketType);
                modal.addComponents(...defaultFields);
            }
        } else {
            const fields = getModalFields(ticketType);
            modal.addComponents(...fields);
        }
    } catch (error) {
        logger.warn(`[CreateTicket] Failed to fetch custom fields for ${ticketType}, using defaults:`, error);
        const fields = getModalFields(ticketType);
        modal.addComponents(...fields);
    }

    return modal;
}

function buildFieldsFromCustomDefinitions(
    customFields: CustomFieldDefinition[]
): ActionRowBuilder<TextInputBuilder>[] {
    const rows: ActionRowBuilder<TextInputBuilder>[] = [];

    // Safety check for invalid array
    if (!Array.isArray(customFields) || customFields.length === 0) {
        logger.warn("[CreateTicket] Invalid or empty customFields array");
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

            if (field.type === "number") {
                if (field.min !== undefined) {
                    input.setMinLength(1);
                }
                if (field.max !== undefined) {
                    input.setMaxLength(20);
                }
            }

            rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        } catch (fieldError) {
            logger.error(`[CreateTicket] Error building field ${field.id}:`, fieldError);
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
    } else if (ticketType === TicketType.BUY_GOLD_OSRS || ticketType === TicketType.BUY_GOLD_RS3) {
        
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
        
        rows.push(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("gold_amount")
                    .setLabel("How much gold to sell? (in millions)")
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
