import { ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import PricingCalculatorService from "../../../api/pricingCalculator/pricingCalculator.service";
import Container from "typedi";

// Add version check to verify new code is running
const CALCULATOR_VERSION = "v3.0-improved-segments-display";

export async function handleCalculatorModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        // Defer the reply
        await interaction.deferReply({ ephemeral: false });

        // Get service ID from modal custom ID
        // Format: calculator_modal_<serviceId> or calculator_modal_inticket_<serviceId>
        let serviceId = interaction.customId.replace("calculator_modal_", "");
        const isFromTicket = serviceId.startsWith("inticket_");

        if (isFromTicket) {
            serviceId = serviceId.replace("inticket_", "");
        }

        if (!serviceId) {
            await interaction.editReply({
                content: "Invalid service selection. Please try again.",
            });
            return;
        }

        // Get level inputs from modal
        const startLevelStr = interaction.fields.getTextInputValue("start_level");
        const endLevelStr = interaction.fields.getTextInputValue("end_level");

        // Parse levels
        const startLevel = parseInt(startLevelStr);
        const endLevel = parseInt(endLevelStr);

        // Validate levels
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

        // Call the pricing calculator service directly (avoids HTTP overhead and same-process issues)
        try {
            logger.info(`[Calculator] Calculating with serviceId: ${serviceId}, levels: ${startLevel}-${endLevel}`);

            // Get the service instance from the dependency injection container
            const pricingService = Container.get(PricingCalculatorService);

            // Call the service method directly
            const result = await pricingService.calculateLevelRangePrice({
                serviceId,
                startLevel,
                endLevel,
            });

            logger.info(`[Calculator] ${CALCULATOR_VERSION} - Calculation completed successfully`);
            const data = result;

            // Validate response structure
            if (!data || !data.service) {
                logger.error('[Calculator] Invalid API response structure:');
                logger.error('[Calculator] result:', JSON.stringify(result, null, 2));
                logger.error('[Calculator] data:', JSON.stringify(data, null, 2));
                throw new Error('Invalid response from pricing calculator API');
            }

            // Build the calculator result embed (MMOGoldHut style)
            const embed = new EmbedBuilder()
                .setTitle(`${data.service.emoji} ${data.service.name} Calculator`)
                .setColor(0xfca311) // Orange color from MMOGoldHut
                .setTimestamp();

            // Calculate total discount/upcharge from all methods to show at top
            const cheapestMethod = data.methodOptions?.find((m: any) => m.isCheapest);
            logger.info('[Calculator] 🔍 Cheapest method: ' + cheapestMethod?.methodName);
            logger.info('[Calculator] 🔍 Method modifiers: ' + JSON.stringify(cheapestMethod?.modifiers, null, 2));

            const allDiscounts = cheapestMethod?.modifiers?.filter((m: any) => m.applied && Number(m.value) < 0) || [];
            logger.info('[Calculator] 🔍 Discounts found: ' + allDiscounts.length + ' - ' + JSON.stringify(allDiscounts));

            const totalDiscountPercent = allDiscounts.reduce((sum: number, mod: any) =>
                mod.type === 'PERCENTAGE' ? sum + Math.abs(Number(mod.value)) : sum, 0
            );
            logger.info('[Calculator] 🔍 Total discount percent: ' + totalDiscountPercent);

            // Add level range, XP required, and discount (if any)
            let levelRangeValue =
                `**${data.levels.start}  →  ${data.levels.end}**\n` +
                `\`\`\`ansi\n\u001b[36m${data.levels.formattedXp} XP Required\u001b[0m\n\`\`\``;

            if (totalDiscountPercent > 0) {
                logger.info('[Calculator] ✅ Adding discount to display: ' + totalDiscountPercent.toFixed(1) + '%');
                levelRangeValue += `\`\`\`ansi\n\u001b[32mDiscount: ${totalDiscountPercent.toFixed(1)}%\u001b[0m\n\`\`\``;
            } else {
                logger.warn('[Calculator] ⚠️ NO discount to display (totalDiscountPercent: ' + totalDiscountPercent + ')');
            }

            embed.addFields({
                name: "📊 Level Range",
                value: levelRangeValue,
                inline: false,
            });

            // Add each method option as a separate choice
            if (data.methodOptions && data.methodOptions.length > 0) {
                // Build beautiful pricing options display
                const priceLines: string[] = [];

                for (const method of data.methodOptions) {
                    const indicator = method.isCheapest ? "✅" : "◻️";
                    const price = method.finalPrice.toFixed(2);
                    const rate = method.basePrice.toFixed(8);

                    logger.info(`[Calculator] 💰 ${method.methodName}: $${price}`);

                    // Create visually appealing line with proper spacing
                    priceLines.push(`${indicator} **${method.methodName}**`);
                    priceLines.push(`   💰 \`$${price}\``);
                    priceLines.push(''); // Empty line for spacing
                }

                // Remove last empty line
                priceLines.pop();

                embed.addFields({
                    name: "💵 Pricing Options",
                    value: priceLines.join('\n'),
                    inline: false,
                });

                // Show beautiful breakdown for cheapest option
                const cheapest = data.methodOptions.find(m => m.isCheapest);
                if (cheapest) {
                    const hasModifiers = cheapest.modifiersTotal !== 0;

                    // Separate modifiers by type
                    const discounts = cheapest.modifiers.filter(m => m.applied && Number(m.value) < 0);
                    const upcharges = cheapest.modifiers.filter(m => m.applied && Number(m.value) > 0);

                    // Build beautiful breakdown
                    let breakdown = `\`\`\`yml\n`;
                    breakdown += `Service:        ${data.service.name}\n`;
                    breakdown += `─────────────────────────────────────────\n`;
                    breakdown += `Levels:         ${data.levels.start} → ${data.levels.end}\n`;
                    breakdown += `XP Required:    ${data.levels.formattedXp}\n`;
                    breakdown += `─────────────────────────────────────────\n`;

                    // Sort level ranges by start level
                    const sortedRanges = cheapest.levelRanges
                        ? [...cheapest.levelRanges].sort((a, b) => a.startLevel - b.startLevel)
                        : [];

                    logger.info('[Calculator] 📊 Displaying ' + sortedRanges.length + ' segment(s)');

                    // Display ALL segments
                    if (sortedRanges.length > 0) {
                        for (const segment of sortedRanges) {
                            breakdown += `\n📊 ${segment.startLevel}-${segment.endLevel}\n`;
                            breakdown += `Method:         ${segment.methodName || 'N/A'}\n`;
                            breakdown += `Rate:           ${(segment.ratePerXp || 0).toFixed(8)} $/XP\n`;
                            breakdown += `XP:             ${segment.xpRequired.toLocaleString()}\n`;
                            breakdown += `Cost:           $${segment.totalPrice.toFixed(2)}\n`;
                        }
                        breakdown += `\n`;
                    }

                    breakdown += `─────────────────────────────────────────\n`;
                    breakdown += `Base Cost:      $${cheapest.subtotal.toFixed(2)}\n`;

                    // Show discounts
                    if (discounts.length > 0) {
                        for (const mod of discounts) {
                            const modValue = mod.type === 'PERCENTAGE'
                                ? `${mod.value}%`
                                : `-$${Math.abs(Number(mod.value)).toFixed(2)}`;
                            breakdown += `${mod.name}:`.padEnd(16) + `${modValue}\n`;
                        }
                    }

                    // Show upcharges
                    if (upcharges.length > 0) {
                        for (const mod of upcharges) {
                            const modValue = mod.type === 'PERCENTAGE'
                                ? `+${mod.value}%`
                                : `+$${mod.value.toFixed(2)}`;
                            breakdown += `${mod.name}:`.padEnd(16) + `${modValue}\n`;
                        }
                    }

                    if (hasModifiers) {
                        breakdown += `─────────────────────────────────────────\n`;
                    }

                    breakdown += `\`\`\``;

                    logger.info('[Calculator] 💰 Final price: $' + cheapest.finalPrice.toFixed(2));

                    // Add final price in ANSI color
                    breakdown += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${cheapest.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

                    logger.info('[Calculator] ✅ Sending embed with all segments');

                    embed.addFields({
                        name: "✅ Recommended Option — Full Breakdown",
                        value: breakdown,
                        inline: false,
                    });
                }
            }

            // Create action buttons for the result
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const recalculateButton = new ButtonBuilder()
                .setCustomId(isFromTicket ? `recalculate_inticket_${serviceId}` : `recalculate_${serviceId}`)
                .setLabel('Recalculate')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary);

            // Build action row - only add "Open Ticket" button if NOT already in a ticket
            const actionRow = new ActionRowBuilder();
            actionRow.addComponents(recalculateButton);

            if (!isFromTicket) {
                // Get the cheapest price for the ticket button
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

            // Send the result
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
