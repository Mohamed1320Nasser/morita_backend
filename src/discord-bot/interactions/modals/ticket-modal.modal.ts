import { ModalSubmitInteraction, TextChannel, Guild } from "discord.js";
import logger from "../../../common/loggers";
import { getTicketService } from "../../services/ticket.service";
import { TicketType, TicketMetadata } from "../../types/discord.types";

/**
 * Handle ticket modal submissions for all ticket types
 */
export async function handleTicketModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    // Extract ticket type early (before defer)
    const ticketType = interaction.customId.replace("ticket_modal_", "") as TicketType;
    logger.info(`[TicketModal] Processing ${ticketType} for ${interaction.user.tag}`);

    try {
        // Immediately defer the reply to prevent timeout
        await interaction.deferReply({ ephemeral: true });
        logger.info(`[TicketModal] Deferred reply for ${ticketType}`);

        // Get guild
        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply({
                content: "❌ This command can only be used in a server.",
            });
            return;
        }

        // Extract form data based on ticket type
        const { customerNotes, metadata, serviceId, categoryId } = extractFormData(interaction, ticketType);

        // Get ticket service
        const ticketService = getTicketService(interaction.client);

        // Create ticket with type
        const { channel, ticket } = await ticketService.createTicketChannelWithType(
            guild,
            interaction.user,
            {
                customerDiscordId: interaction.user.id,
                categoryId: categoryId || undefined,
                serviceId,
                customerNotes,
                customerName: interaction.user.displayName || interaction.user.username,
                ticketType,
            },
            metadata
        );

        // Reply to user
        const ticketNumber = ticket.ticketNumber.toString().padStart(4, "0");
        await interaction.editReply({
            content: `✅ Your ticket has been created!\n\nHead to <#${channel.id}> to continue.\n\n**Ticket #${ticketNumber}** • ${getTicketTypeLabel(ticketType)}`,
        });

        logger.info(`[TicketModal] Ticket #${ticketNumber} (${ticketType}) created for ${interaction.user.tag}`);
    } catch (error: any) {
        logger.error("[TicketModal] Error creating ticket:", error);

        // Check if error is due to interaction timeout
        if (error.message?.includes('Unknown interaction') || error.code === 10062) {
            logger.warn("[TicketModal] Interaction expired before we could respond");
            // Can't reply - interaction is expired
            return;
        }

        try {
            // Only try to edit reply if interaction was deferred successfully
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: "❌ Failed to create ticket. Please try again or contact support directly.",
                });
            } else {
                await interaction.reply({
                    content: "❌ Failed to create ticket. Please try again or contact support directly.",
                    ephemeral: true,
                });
            }
        } catch (e: any) {
            logger.error("[TicketModal] Failed to send error message:", e);
        }
    }
}

/**
 * Extract form data based on ticket type (dynamically based on form fields)
 */
function extractFormData(
    interaction: ModalSubmitInteraction,
    ticketType: TicketType
): {
    customerNotes: string;
    metadata: TicketMetadata;
    serviceId?: string;
    categoryId?: string;
} {
    const metadata: TicketMetadata = {};
    const customerNotesLines: string[] = [];
    let serviceId: string | undefined;
    let categoryId: string | undefined;

    // Extract all fields from the modal dynamically
    const fieldMap: Record<string, string> = {};

    try {
        // Get all components from the modal
        interaction.fields.fields.forEach((field, key) => {
            try {
                const value = interaction.fields.getTextInputValue(key);
                if (value) {
                    fieldMap[key] = value;
                }
            } catch (e) {
                // Field doesn't exist or is empty
            }
        });
    } catch (error) {
        logger.warn("[TicketModal] Error extracting fields:", error);
    }

    // Map common fields to metadata
    if (fieldMap["gold_amount"]) {
        metadata.goldAmount = parseFloat(fieldMap["gold_amount"]);
    }
    if (fieldMap["delivery_method"]) {
        metadata.deliveryMethod = fieldMap["delivery_method"];
    }
    if (fieldMap["osrs_username"] || fieldMap["rs3_username"]) {
        metadata.osrsUsername = fieldMap["osrs_username"] || fieldMap["rs3_username"];
    }
    if (fieldMap["payment_method"]) {
        metadata.deliveryMethod = fieldMap["payment_method"];
    }
    if (fieldMap["payment_details"]) {
        metadata.paymentEmail = fieldMap["payment_details"];
    }
    if (fieldMap["swap_direction"]) {
        metadata.swapDirection = fieldMap["swap_direction"];
    }
    if (fieldMap["crypto_type"]) {
        metadata.cryptoType = fieldMap["crypto_type"];
    }
    if (fieldMap["amount"]) {
        // Could be crypto amount or general amount
        const amountValue = parseFloat(fieldMap["amount"]);
        if (!isNaN(amountValue)) {
            metadata.cryptoAmount = amountValue;
        }
    }
    if (fieldMap["wallet_or_username"] || fieldMap["wallet_address"]) {
        metadata.walletAddress = fieldMap["wallet_or_username"] || fieldMap["wallet_address"];
    }
    if (fieldMap["additional_notes"] || fieldMap["special_notes"]) {
        metadata.specialNotes = fieldMap["additional_notes"] || fieldMap["special_notes"];
    }

    // Build readable customer notes from all fields
    Object.entries(fieldMap).forEach(([key, value]) => {
        if (value) {
            // Convert field key to readable label
            const label = key
                .split("_")
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");

            customerNotesLines.push(`**${label}:** ${value}`);
        }
    });

    // Set default categories based on ticket type
    if (ticketType === TicketType.PURCHASE_SERVICES_OSRS || ticketType === TicketType.PURCHASE_SERVICES_RS3) {
        categoryId = process.env.DEFAULT_SERVICE_CATEGORY_ID;
    } else if (ticketType === TicketType.BUY_GOLD_OSRS || ticketType === TicketType.BUY_GOLD_RS3 ||
               ticketType === TicketType.SELL_GOLD_OSRS || ticketType === TicketType.SELL_GOLD_RS3) {
        categoryId = process.env.GOLD_CATEGORY_ID;
    } else if (ticketType === TicketType.SWAP_CRYPTO) {
        categoryId = process.env.CRYPTO_CATEGORY_ID;
    }

    // If no fields extracted, add a default note
    const customerNotes = customerNotesLines.length > 0
        ? customerNotesLines.join("\n")
        : `**Ticket Type:** ${getTicketTypeLabel(ticketType)}`;

    // Store all raw field data in metadata for future reference
    if (Object.keys(fieldMap).length > 0) {
        metadata.internalNotes = JSON.stringify(fieldMap);
    }

    return { customerNotes, metadata, serviceId, categoryId };
}

/**
 * Get user-friendly ticket type label
 */
function getTicketTypeLabel(ticketType: TicketType): string {
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
