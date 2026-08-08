import { ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import PricingCalculatorService from "../../../api/pricingCalculator/pricingCalculator.service";
import LoyaltyTierService from "../../../api/loyalty-tier/loyalty-tier.service";
import { discordApiClient } from "../../clients/DiscordApiClient";
import {
    buildLevelScope,
    buildOptionsTable,
    buildTotalBlock,
    collectAdjustments,
} from "../../utils/priceEmbed";

const CALCULATOR_VERSION = "v3.0-improved-segments-display";

// Create shared service instances
const loyaltyTierService = new LoyaltyTierService();
const pricingService = new PricingCalculatorService(loyaltyTierService);

async function getUserByDiscordId(discordId: string): Promise<number | undefined> {
    try {
        const userResponse: any = await discordApiClient.get(`/discord/users/discord/${discordId}`);
        const user = userResponse.data || userResponse;
        if (user && user.id) {
            return user.id;
        }
        return undefined;
    } catch (error) {
        return undefined;
    }
}

export async function handleCalculatorModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        let serviceId = interaction.customId.replace("calculator_modal_", "");
        const isFromTicket = serviceId.startsWith("inticket_");

        if (isFromTicket) {
            serviceId = serviceId.replace("inticket_", "");
        }

        // Determine if we should show ephemeral or public
        // Public only in calculator channel and ticket channels
        const channelId = interaction.channelId;
        const isCalculatorChannel = channelId === discordConfig.calculatorChannelId;
        const isTicketChannel = isFromTicket || (interaction.channel && 'name' in interaction.channel &&
            (interaction.channel.name.startsWith(discordConfig.ticketChannelPrefix) || interaction.channel.name.startsWith("closed-")));

        // Calculator is public in calculator channel and ticket channels, ephemeral elsewhere
        const shouldBeEphemeral = !isCalculatorChannel && !isTicketChannel;

        await interaction.deferReply({ ephemeral: shouldBeEphemeral });

        if (!serviceId) {
            await interaction.editReply({
                content: "Invalid service selection. Please try again.",
            });
            return;
        }

        const startLevelStr = interaction.fields.getTextInputValue("start_level");
        const endLevelStr = interaction.fields.getTextInputValue("end_level");

        const startLevel = parseInt(startLevelStr);
        const endLevel = parseInt(endLevelStr);

        if (isNaN(startLevel) || isNaN(endLevel)) {
            await interaction.editReply({
                content:
                    "❌ **Invalid Input**\n\nPlease enter valid numbers for levels.",
            });
            return;
        }

        if (startLevel < 1 || startLevel > 99 || endLevel < 1 || endLevel > 99) {
            await interaction.editReply({
                content:
                    "❌ **Invalid Levels**\n\nLevels must be between 1 and 99.",
            });
            return;
        }

        if (startLevel >= endLevel) {
            await interaction.editReply({
                content:
                    "❌ **Invalid Range**\n\nStart level must be less than end level.",
            });
            return;
        }

        logger.info(
            `[Calculator] Modal submitted: ${serviceId}, ${startLevel}-${endLevel} by ${interaction.user.tag}`
        );

        try {
            logger.info(`[Calculator] Calculating with serviceId: ${serviceId}, levels: ${startLevel}-${endLevel}`);

            const userId = await getUserByDiscordId(interaction.user.id);

            const result = await pricingService.calculateLevelRangePrice({
                serviceId,
                startLevel,
                endLevel,
                userId,
            });

            logger.info(`[Calculator] ${CALCULATOR_VERSION} - Calculation completed successfully`);
            const data = result;

            if (!data || !data.service) {
                logger.error('[Calculator] Invalid API response structure:');
                logger.error('[Calculator] result:', JSON.stringify(result, null, 2));
                logger.error('[Calculator] data:', JSON.stringify(data, null, 2));
                throw new Error('Invalid response from pricing calculator API');
            }

            const embed = new EmbedBuilder()
                .setTitle(`${data.service.emoji} ${data.service.name} Calculator`)
                .setColor(0xfca311) 
                .setTimestamp();

            const cheapestMethod = data.methodOptions?.find((m: any) => m.isCheapest);
            logger.info('[Calculator] 🔍 Cheapest method: ' + cheapestMethod?.methodName);
            logger.info('[Calculator] 🔍 Method modifiers: ' + JSON.stringify(cheapestMethod?.modifiers, null, 2));

            const allDiscounts = cheapestMethod?.modifiers?.filter((m: any) => m.applied && Number(m.value) < 0) || [];
            logger.info('[Calculator] 🔍 Discounts found: ' + allDiscounts.length + ' - ' + JSON.stringify(allDiscounts));

            const totalDiscountPercent = allDiscounts.reduce((sum: number, mod: any) =>
                mod.type === 'PERCENTAGE' ? sum + Math.abs(Number(mod.value)) : sum, 0
            );
            logger.info('[Calculator] 🔍 Total discount percent: ' + totalDiscountPercent);

            const scopeSegments = (data.methodOptions?.find((m: any) => m.isCheapest)?.levelRanges || [])
                .map((r: any) => ({
                    startLevel: r.startLevel,
                    endLevel: r.endLevel,
                    xpRequired: r.xpRequired,
                    totalPrice: r.totalPrice,
                    methodName: r.methodName,
                }));

            embed.setDescription(
                buildLevelScope(
                    data.service.name,
                    scopeSegments,
                    data.levels.totalXp ?? 0,
                    totalDiscountPercent
                )
            );

            if (data.methodOptions && data.methodOptions.length > 0) {
                
                const isVariant = (m: any) =>
                    m.methodId === "combined" ||
                    String(m.methodId).startsWith("group_") ||
                    String(m.methodId).includes("_segment_");

                const combined = data.methodOptions.find((m: any) => m.methodId === "combined");
                const realMethods = data.methodOptions.filter((m: any) => !isVariant(m));
                const listed = realMethods.length > 0 ? realMethods : data.methodOptions;

                const bestPrice = Math.min(...listed.map((m: any) => m.finalPrice));
                const combinedIsBetter =
                    combined && combined.finalPrice < bestPrice - 0.005;

                const rangeOf = (m: any) => {
                    if (!m.levelRanges || m.levelRanges.length === 0) return "";
                    const min = Math.min(...m.levelRanges.map((r: any) => r.startLevel));
                    const max = Math.max(...m.levelRanges.map((r: any) => r.endLevel));
                    return `${min}-${max}`;
                };

                const optionRows = listed.map((m: any) => ({
                    name: m.methodName,
                    range: rangeOf(m),
                    originalPrice: m.loyaltyDiscount?.originalPrice,
                    finalPrice: m.finalPrice,
                    discountPercent: m.loyaltyDiscount?.discountPercent,
                    isBest: !combinedIsBetter && m.finalPrice <= bestPrice + 0.005,
                }));

                if (combinedIsBetter) {
                    optionRows.push({
                        name: combined.methodName,
                        range: rangeOf(combined),
                        originalPrice: combined.loyaltyDiscount?.originalPrice,
                        finalPrice: combined.finalPrice,
                        discountPercent: combined.loyaltyDiscount?.discountPercent,
                        isBest: true,
                    });
                }

                const optionsTable = buildOptionsTable(optionRows);

                if (optionsTable) {
                    embed.addFields({
                        name: "\u{1F4B5} Pricing Options",
                        value: optionsTable,
                        inline: false,
                    });
                }

                const cheapest = combinedIsBetter
                    ? combined
                    : listed.reduce((min: any, curr: any) =>
                          curr.finalPrice < min.finalPrice ? curr : min
                      );

                if (cheapest) {
                    embed.addFields({
                        name: "\u{1F4B0} Price Summary",
                        value: buildTotalBlock(
                            cheapest.methodName,
                            cheapest.subtotal,
                            collectAdjustments(cheapest),
                            cheapest.finalPrice
                        ),
                        inline: false,
                    });
                }
            }

            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const recalculateButton = new ButtonBuilder()
                .setCustomId(isFromTicket ? `recalculate_inticket_${serviceId}` : `recalculate_${serviceId}`)
                .setLabel('Recalculate')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary);

            const actionRow = new ActionRowBuilder();
            actionRow.addComponents(recalculateButton);

            if (!isFromTicket) {
                
                const cheapest = data.methodOptions?.find((m: any) => m.isCheapest);
                const finalPrice = cheapest?.finalPrice || data.methodOptions?.[0]?.finalPrice || 0;
                const categoryId = (data.service as any).categoryId || 'general';

                const openTicketButton = new ButtonBuilder()
                    .setCustomId(`open_ticket_${serviceId}_${categoryId}_${finalPrice.toFixed(2)}`)
                    .setLabel('Open Ticket')
                    .setEmoji('🎫')
                    .setStyle(ButtonStyle.Success);

                actionRow.addComponents(openTicketButton);
            }

            await interaction.editReply({
                embeds: [embed.toJSON() as any],
                components: [actionRow],
            });

            logger.info(
                `[Calculator] Result sent for ${data.service.name} (${startLevel}-${endLevel}) to ${interaction.user.tag}`
            );
        } catch (apiError) {
            logger.error("[Calculator] API error:", apiError);
            await interaction.editReply({
                content:
                    `❌ **Calculation Error**\n\n` +
                    `An error occurred while calculating the price. ` +
                    `This service may not support level-based pricing.\n\n` +
                    `Please try another service or contact support.`,
            });
        }
    } catch (error) {
        logger.error("[Calculator] Error handling calculator modal:", error);

        if (error instanceof Error) {
            await interaction
                .editReply({
                    content: `❌ **Error**\n\n${error.message}`,
                })
                .catch((err) =>
                    logger.error("[Calculator] Failed to send error message:", err)
                );
        } else {
            await interaction
                .editReply({
                    content:
                        "❌ **An error occurred while processing your request.**\n\n" +
                        "Please try again or contact support.",
                })
                .catch((err) =>
                    logger.error("[Calculator] Failed to send error message:", err)
                );
        }
    }
}
