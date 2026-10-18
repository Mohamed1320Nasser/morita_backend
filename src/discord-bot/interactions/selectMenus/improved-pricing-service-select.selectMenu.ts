import {
    StringSelectMenuInteraction,
    EmbedBuilder,
    Message,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    APIActionRowComponent,
    APIMessageActionRowComponent
} from "discord.js";
import { EnhancedPricingBuilder, CATEGORY_HEADER_PREFIX } from "../../utils/enhancedPricingBuilder";
import { rebuildSelectMenusWithoutDefaults } from "../../utils/selectMenuReset";
import { getTotalGroups } from "../../utils/pricingPagination";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import logger from "../../../common/loggers";
import { DISCORD_LIMITS } from "../../constants/discord-limits";

const apiService = new ApiService(discordConfig.apiBaseUrl);

const INTERACTION_EXPIRED_ERRORS = [
    "unknown interaction",
    "interaction has already been acknowledged",
    "already been acknowledged",
];

function isInteractionExpiredError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return INTERACTION_EXPIRED_ERRORS.some(err => message.includes(err));
}

/**
 * Clears the user's checkmark but keeps each category header selected, so the
 * closed menu still shows its icon and name. If the menus cannot be rebuilt
 * the message is left as it is rather than losing dropdowns.
 */
async function resetPricingMenus(interaction: StringSelectMenuInteraction): Promise<void> {
    const rows = rebuildSelectMenusWithoutDefaults(
        interaction.message.components as any,
        value => value.startsWith(CATEGORY_HEADER_PREFIX)
    );
    if (rows) {
        await interaction.update({ components: rows as any });
    } else {
        await interaction.deferUpdate();
    }
}

export async function handleImprovedPricingServiceSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    
    if (interaction.replied || interaction.deferred) {
        logger.debug(
            "[PricingServiceSelect] Interaction already handled, skipping"
        );
        return;
    }

    try {
        const categoryId = interaction.customId.replace(
            "pricing_service_select_",
            ""
        );
        const serviceId = interaction.values[0];

        // The header only displays the category; picking it is a no-op
        if (serviceId.startsWith(CATEGORY_HEADER_PREFIX)) {
            await resetPricingMenus(interaction).catch(() => {});
            return;
        }

        if (serviceId.startsWith("show_more_")) {
            
            await resetPricingMenus(interaction);

            await interaction.followUp({
                content:
                    "📋 **Additional Services**\n\n" +
                    "This category has more than 25 services. " +
                    "Please use the `/services` command to browse all available services in this category.\n\n" +
                    "Alternatively, contact us directly for assistance!",
                ephemeral: true
            });
            return;
        }

        try {
            logger.debug(
                `[PricingServiceSelect] Rebuilding components for message ${interaction.message.id}`
            );

            await resetPricingMenus(interaction);

            logger.debug(
                `[PricingServiceSelect] Update successful, checkmark cleared`
            );
        } catch (updateError) {
            logger.error(
                `[PricingServiceSelect] Update failed:`,
                updateError instanceof Error ? updateError.message : updateError
            );
            if (isInteractionExpiredError(updateError)) {
                logger.debug(
                    `[PricingServiceSelect] Interaction expired (likely bot restart). User: ${interaction.user.tag}`
                );
                return;
            }
            throw updateError;
        }

        const service = await apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await interaction.followUp({
                content:
                    "❌ **Service Not Found**\n\n" +
                    "The selected service could not be loaded. It may have been removed or is temporarily unavailable.\n\n" +
                    "Please try again or contact support.",
                ephemeral: true
            });
            return;
        }

        let embed, actionButtons;
        try {
            const page = 0; 
            const itemsPerPage = DISCORD_LIMITS.PAGINATION.PRICING_ITEMS_PER_PAGE;

            embed = EnhancedPricingBuilder.buildServiceInfoEmbed(service, {
                page,
                itemsPerPage
            });

            // Use group count for pagination, not individual method count
            const totalGroups = service.pricingMethods ? getTotalGroups(service.pricingMethods) : 0;
            const paginationOptions = totalGroups > itemsPerPage ? {
                currentPage: page,
                itemsPerPage,
                totalItems: totalGroups,
                serviceId,
                categoryId
            } : undefined;

            actionButtons = EnhancedPricingBuilder.buildServiceActionButtons(
                serviceId,
                categoryId,
                paginationOptions
            );

            const embedData = embed.toJSON();

            if (embedData.description && embedData.description.length > 4096) {
                logger.warn(
                    `[PricingServiceSelect] Embed description too long (${embedData.description.length} chars), truncating`
                );
                embed.setDescription(
                    embedData.description.substring(0, 4090) + "..."
                );
            }

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

        try {
            const embedData = embed.toJSON();
            const componentsData = actionButtons.map(row => row.toJSON());

            if (componentsData.length === 0 || componentsData.every(row => !row.components || row.components.length === 0)) {
                logger.warn(
                    "[PricingServiceSelect] No button components, skipping"
                );
            }

            await interaction.followUp({
                embeds: [embedData as any],
                components: componentsData as any,
                ephemeral: true
            });

            logger.info(
                `[PricingServiceSelect] Service details shown: ${service.name} by ${interaction.user.tag}`
            );
        } catch (sendError) {
            
            const errorDetails = {
                error:
                    sendError instanceof Error
                        ? sendError.message
                        : String(sendError),
                stack: sendError instanceof Error ? sendError.stack : undefined,
                embedSize: embed ? JSON.stringify(embed.toJSON()).length : 0,
                componentsSize: actionButtons
                    ? JSON.stringify(actionButtons.map(row => row.toJSON())).length
                    : 0,
            };

            logger.error(
                "[PricingServiceSelect] Failed to send service details:",
                errorDetails
            );

            if (
                sendError instanceof Error &&
                (sendError.message.includes("Received one or more errors") ||
                    sendError.message.includes("Invalid Form Body") ||
                    sendError.message.includes("validation"))
            ) {
                logger.warn(
                    "[PricingServiceSelect] Validation error detected, sending simplified version"
                );

                try {
                    const simplifiedEmbed = new EmbedBuilder()
                        .setTitle(`${service.emoji || "⭐"} ${service.name}`)
                        .setDescription(
                            (
                                service.description ||
                                "Professional gaming service"
                            ).substring(0, 4096)
                        )
                        .setColor(0xfca311)
                        .addFields({
                            name: "📋 Service Information",
                            value: `**Status:** ${service.active ? "✅ Active" : "❌ Inactive"}\n\nUse the buttons below to view pricing or create an order.`,
                        })
                        .setTimestamp();

                    await interaction.followUp({
                        embeds: [simplifiedEmbed.toJSON() as any],
                        components: actionButtons.map(row => row.toJSON()) as any,
                        ephemeral: true
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
        
        if (isInteractionExpiredError(error)) {
            logger.debug("[PricingServiceSelect] Interaction expired");
            return;
        }

        if (error instanceof Error) {
            const discordError = error as any;
            logger.error(
                "[PricingServiceSelect] Error handling service select:",
                {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                    code: discordError.code,
                    rawError: discordError.rawError,
                }
            );
        } else {
            logger.error(
                "[PricingServiceSelect] Error handling service select:",
                error
            );
        }

        try {
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content:
                        "❌ **Error Loading Service**\n\n" +
                        "An error occurred while loading the service details. " +
                        "Please try again later or contact support if the problem persists.",
                    ephemeral: true
                });
            } else {
                
                await interaction.reply({
                    content:
                        "❌ **Error Loading Service**\n\n" +
                        "An error occurred while loading the service details. " +
                        "Please try again later or contact support if the problem persists.",
                    ephemeral: true
                });
            }
        } catch (replyError) {
            logger.error(
                "[PricingServiceSelect] Could not send error message:",
                replyError
            );
        }
    }
}
