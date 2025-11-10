import { StringSelectMenuInteraction, EmbedBuilder } from "discord.js";
import { EnhancedPricingBuilder } from "../../utils/enhancedPricingBuilder";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import logger from "../../../common/loggers";

const apiService = new ApiService(discordConfig.apiBaseUrl);

/**
 * Error types that indicate an interaction is no longer valid
 */
const INTERACTION_EXPIRED_ERRORS = [
    "unknown interaction",
    "interaction has already been acknowledged",
    "already been acknowledged",
];

/**
 * Check if an error indicates the interaction expired
 */
function isInteractionExpiredError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return INTERACTION_EXPIRED_ERRORS.some(err => message.includes(err));
}

/**
 * Safely edit an interaction reply, handling expired interactions gracefully
 */
async function safeEditReply(
    interaction: StringSelectMenuInteraction,
    content: any
): Promise<boolean> {
    if (!interaction.deferred || interaction.replied) {
        return false;
    }

    try {
        await interaction.editReply(content);
        return true;
    } catch (error) {
        if (isInteractionExpiredError(error)) {
            logger.debug(
                "[PricingServiceSelect] Interaction expired during editReply"
            );
            return false;
        }
        throw error;
    }
}

/**
 * Handle pricing service selection from category dropdown
 */
export async function handleImprovedPricingServiceSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    // Early return if interaction already handled
    if (interaction.replied || interaction.deferred) {
        logger.debug(
            "[PricingServiceSelect] Interaction already handled, skipping"
        );
        return;
    }

    // Defer the reply to prevent timeout
    // NOTE: Changed to non-ephemeral so ANSI codes render properly in Discord
    try {
        await interaction.deferReply({ ephemeral: false });
    } catch (error) {
        // Silently return if interaction already acknowledged or expired
        if (isInteractionExpiredError(error)) {
            logger.debug(
                "[PricingServiceSelect] Interaction already acknowledged or expired"
            );
            return;
        }
        logger.error(
            "[PricingServiceSelect] Failed to defer interaction:",
            error
        );
        return;
    }

    try {
        const categoryId = interaction.customId.replace(
            "pricing_service_select_",
            ""
        );
        const serviceId = interaction.values[0];

        // Handle "Show More" option
        if (serviceId.startsWith("show_more_")) {
            await safeEditReply(interaction, {
                content:
                    "📋 **Additional Services**\n\n" +
                    "This category has more than 25 services. " +
                    "Please use the `/services` command to browse all available services in this category.\n\n" +
                    "Alternatively, contact us directly for assistance!",
            });
            return;
        }

        // Fetch service data
        const service = await apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await safeEditReply(interaction, {
                content:
                    "❌ **Service Not Found**\n\n" +
                    "The selected service could not be loaded. It may have been removed or is temporarily unavailable.\n\n" +
                    "Please try again or contact support.",
            });
            return;
        }

        // Build embed with pricing sections (MMOGoldHut style)
        let embed, actionButtons;
        try {
            // Build service info embed WITH pricing sections (clean Discord embed style)
            embed = EnhancedPricingBuilder.buildServiceInfoEmbed(service);
            actionButtons = EnhancedPricingBuilder.buildServiceActionButtons(
                serviceId,
                categoryId
            );

            // Validate embed before sending
            const embedData = embed.toJSON();

            // Check embed limits (Discord.js validation)
            if (embedData.description && embedData.description.length > 4096) {
                logger.warn(
                    `[PricingServiceSelect] Embed description too long (${embedData.description.length} chars), truncating`
                );
                embed.setDescription(
                    embedData.description.substring(0, 4090) + "..."
                );
            }

            // Check field values (max 1024 chars per field value)
            const fields = embedData.fields || [];
            for (let i = 0; i < fields.length; i++) {
                if (fields[i].value && fields[i].value.length > 1024) {
                    logger.warn(
                        `[PricingServiceSelect] Field "${fields[i].name}" value too long (${fields[i].value.length} chars), truncating`
                    );
                    const field = embed.data.fields?.[i];
                    if (field) {
                        field.value =
                            fields[i].value.substring(0, 1020) + "...";
                    }
                }
            }

            // Check title (max 256 chars)
            if (embedData.title && embedData.title.length > 256) {
                logger.warn(
                    `[PricingServiceSelect] Embed title too long (${embedData.title.length} chars), truncating`
                );
                embed.setTitle(embedData.title.substring(0, 253) + "...");
            }
        } catch (buildError) {
            logger.error(
                "[PricingServiceSelect] Failed to build embed/buttons:",
                buildError
            );
            throw buildError;
        }

        // Send the response
        try {
            const embedData = embed.toJSON();
            const buttonData = actionButtons.toJSON();

            // Validate components
            if (!buttonData.components || buttonData.components.length === 0) {
                logger.warn(
                    "[PricingServiceSelect] No button components, skipping"
                );
            }

            const success = await safeEditReply(interaction, {
                embeds: [embedData as any],
                components: [buttonData as any],
            });

            if (success) {
                logger.info(
                    `[PricingServiceSelect] Service details shown: ${service.name} by ${interaction.user.tag}`
                );
            }
        } catch (sendError) {
            // Log the actual error with full details
            const errorDetails = {
                error:
                    sendError instanceof Error
                        ? sendError.message
                        : String(sendError),
                stack: sendError instanceof Error ? sendError.stack : undefined,
                embedSize: embed ? JSON.stringify(embed.toJSON()).length : 0,
                buttonSize: actionButtons
                    ? JSON.stringify(actionButtons.toJSON()).length
                    : 0,
            };

            logger.error(
                "[PricingServiceSelect] Failed to send service details:",
                errorDetails
            );

            // If it's a validation error, try sending a simpler version
            if (
                sendError instanceof Error &&
                (sendError.message.includes("Received one or more errors") ||
                    sendError.message.includes("Invalid Form Body") ||
                    sendError.message.includes("validation"))
            ) {
                logger.warn(
                    "[PricingServiceSelect] Validation error detected, sending simplified version"
                );

                // Try sending a simplified embed without the pricing table
                try {
                    const simplifiedEmbed = new EmbedBuilder()
                        .setTitle(`${service.emoji || "⭐"} ${service.name}`)
                        .setDescription(
                            (
                                service.description ||
                                "Professional gaming service"
                            ).substring(0, 4096)
                        )
                        .setColor(0x00d9ff)
                        .addFields({
                            name: "📋 Service Information",
                            value: `**Status:** ${service.active ? "✅ Active" : "❌ Inactive"}\n\nUse the buttons below to view pricing or create an order.`,
                        })
                        .setTimestamp();

                    await safeEditReply(interaction, {
                        embeds: [simplifiedEmbed.toJSON() as any],
                        components: [actionButtons.toJSON() as any],
                    });
                    return;
                } catch (simplifiedError) {
                    logger.error(
                        "[PricingServiceSelect] Failed to send simplified embed:",
                        simplifiedError
                    );
                }
            }

            throw sendError;
        }
    } catch (error) {
        // Silently handle expired interactions
        if (isInteractionExpiredError(error)) {
            logger.debug("[PricingServiceSelect] Interaction expired");
            return;
        }

        // Log detailed error information
        if (error instanceof Error) {
            logger.error(
                "[PricingServiceSelect] Error handling service select:",
                {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                    // @ts-ignore - Discord.js errors have additional properties
                    code: error.code,
                    // @ts-ignore
                    rawError: error.rawError,
                }
            );
        } else {
            logger.error(
                "[PricingServiceSelect] Error handling service select:",
                error
            );
        }

        // Attempt to show error message to user
        await safeEditReply(interaction, {
            content:
                "❌ **Error Loading Service**\n\n" +
                "An error occurred while loading the service details. " +
                "Please try again later or contact support if the problem persists.",
        });
    }
}
