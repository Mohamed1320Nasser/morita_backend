import { ModalSubmitInteraction, TextChannel, Guild, EmbedBuilder as DiscordEmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { getTicketService } from "../../services/ticket.service";
import { TicketType, TicketMetadata } from "../../types/discord.types";
import { getRedisService } from "../../../common/services/redis.service";

const redisService = getRedisService();

export async function handleTicketModal(
    interaction: ModalSubmitInteraction
): Promise<void> {

    // Extract ticketType from customId: ticket_modal_{ticketType}_{redisKey}
    const customIdParts = interaction.customId.split("_");
    // Format: ticket_modal_PURCHASE_SERVICES_OSRS_ticket_modal_123_456
    // Parts: [0]ticket [1]modal [2]PURCHASE [3]SERVICES [4]OSRS [5]ticket [6]modal [7]123 [8]456
    // ticketType is parts[2] + "_" + parts[3] + "_" + parts[4]
    const ticketType = `${customIdParts[2]}_${customIdParts[3]}_${customIdParts[4]}` as TicketType;

    logger.info(`[TicketModal] Processing ${ticketType} for ${interaction.user.tag}`);

    try {
        
        await interaction.deferReply({ ephemeral: true });
        logger.info(`[TicketModal] Deferred reply for ${ticketType}`);

        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply({
                content: "❌ This command can only be used in a server.",
            });
            return;
        }

        const { customerNotes, metadata, serviceId, categoryId } = await extractFormData(interaction, ticketType);

        const ticketService = getTicketService(interaction.client);

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

        const ticketNumber = ticket.ticketNumber.toString().padStart(4, "0");
        const successEmbed = new DiscordEmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Ticket Created Successfully!")
            .setDescription(`Your ticket has been created and is ready for our team to assist you.`)
            .addFields(
                { name: "📋 Ticket Number", value: `#${ticketNumber}`, inline: true },
                { name: "🎮 Service Type", value: getTicketTypeLabel(ticketType), inline: true },
                { name: "📍 Ticket Channel", value: `Head to <#${channel.id}> to continue.`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: "Our support team will respond shortly" });

        await interaction.editReply({
            embeds: [successEmbed as any],
        });

        logger.info(`[TicketModal] Ticket #${ticketNumber} (${ticketType}) created for ${interaction.user.tag}`);
    } catch (error: any) {
        logger.error("[TicketModal] Error creating ticket:", {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
        });

        if (error.message?.includes('Unknown interaction') || error.code === 10062) {
            logger.warn("[TicketModal] Interaction expired before we could respond");
            
            return;
        }

        try {
            
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

async function extractFormData(
    interaction: ModalSubmitInteraction,
    ticketType: TicketType
): Promise<{
    customerNotes: string;
    metadata: TicketMetadata;
    serviceId?: string;
    categoryId?: string;
}> {
    const metadata: TicketMetadata = {};
    const customerNotesLines: string[] = [];
    let serviceId: string | undefined;
    let categoryId: string | undefined;

    // NEW: Retrieve serviceId and categoryId from Redis
    // Format: ticket_modal_PURCHASE_SERVICES_OSRS_ticket_modal_123_456
    // Parts: [0]ticket [1]modal [2]PURCHASE [3]SERVICES [4]OSRS [5]ticket [6]modal [7]123 [8]456
    // Redis key starts at index 5: ticket_modal_123_456
    const customIdParts = interaction.customId.split("_");
    if (customIdParts.length >= 9) {
        // Reconstruct redis key: ticket_modal_{userId}_{timestamp}
        const redisKey = `${customIdParts[5]}_${customIdParts[6]}_${customIdParts[7]}_${customIdParts[8]}`;

        if (redisKey && redisKey !== 'none') {
            try {
                const storedData = await redisService.get(redisKey);
                if (storedData) {
                    const parsedData = JSON.parse(storedData);
                    serviceId = parsedData.serviceId || undefined;
                    categoryId = parsedData.categoryId || undefined;

                    // Clean up Redis after retrieval
                    await redisService.delete(redisKey);

                    logger.info(`[TicketModal] Retrieved from Redis key ${redisKey}: serviceId: ${serviceId}, categoryId: ${categoryId}`);
                } else {
                    logger.warn(`[TicketModal] No data found in Redis for key: ${redisKey}`);
                }
            } catch (error) {
                logger.error(`[TicketModal] Failed to retrieve data from Redis:`, error);
            }
        }
    }

    const fieldMap: Record<string, string> = {};

    try {

        interaction.fields.fields.forEach((field, key) => {
            try {
                const value = interaction.fields.getTextInputValue(key);
                if (value) {
                    fieldMap[key] = value;
                }
            } catch (e) {

            }
        });
    } catch (error) {
        logger.warn("[TicketModal] Error extracting fields:", error);
    }

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

    Object.entries(fieldMap).forEach(([key, value]) => {
        if (value) {
            
            const label = key
                .split("_")
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");

            customerNotesLines.push(`**${label}:** ${value}`);
        }
    });

    // ONLY set categoryId from env if NOT already set from customId
    if (!categoryId) {
        if (ticketType === TicketType.PURCHASE_SERVICES_OSRS || ticketType === TicketType.PURCHASE_SERVICES_RS3) {
            categoryId = process.env.DEFAULT_SERVICE_CATEGORY_ID;
        } else if (ticketType === TicketType.BUY_GOLD_OSRS || ticketType === TicketType.BUY_GOLD_RS3 ||
                   ticketType === TicketType.SELL_GOLD_OSRS || ticketType === TicketType.SELL_GOLD_RS3) {
            categoryId = process.env.GOLD_CATEGORY_ID;
        } else if (ticketType === TicketType.SWAP_CRYPTO) {
            categoryId = process.env.CRYPTO_CATEGORY_ID;
        }
    }

    const customerNotes = customerNotesLines.length > 0
        ? customerNotesLines.join("\n")
        : `**Ticket Type:** ${getTicketTypeLabel(ticketType)}`;

    if (Object.keys(fieldMap).length > 0) {
        metadata.internalNotes = JSON.stringify(fieldMap);
    }

    return { customerNotes, metadata, serviceId, categoryId };
}

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
