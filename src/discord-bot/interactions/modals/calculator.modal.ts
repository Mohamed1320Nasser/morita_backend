import { ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import PricingCalculatorService from "../../../api/pricingCalculator/pricingCalculator.service";
import Container from "typedi";

export async function handleCalculatorModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        // Defer the reply
        await interaction.deferReply({ ephemeral: false });

        // Get service ID from modal custom ID (format: calculator_modal_<serviceId>)
        const serviceId = interaction.customId.replace("calculator_modal_", "");

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

            logger.info('[Calculator] Calculation completed successfully');
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

            // Add level range and XP required
            embed.addFields({
                name: "📊 Level Range",
                value:
                    `**${data.levels.start}  →  ${data.levels.end}**\n` +
                    `\`\`\`ansi\n\u001b[36m${data.levels.formattedXp} XP Required\u001b[0m\n\`\`\``,
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

                    // Create visually appealing line with proper spacing
                    const methodName = method.methodName.padEnd(30, ' ');
                    priceLines.push(`${indicator} **${method.methodName}**`);
                    priceLines.push(`   💰 Price: \`$${price}\` • Rate: \`${rate} $/XP\``);
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
                    const hasModifiers = cheapest.modifiersTotal > 0;

                    // Build beautiful breakdown
                    let breakdown = `\`\`\`yml\n`;
                    breakdown += `Service:        ${data.service.name}\n`;
                    breakdown += `Method:         ${cheapest.methodName}\n`;
                    breakdown += `─────────────────────────────────────────\n`;
                    breakdown += `Levels:         ${data.levels.start} → ${data.levels.end}\n`;
                    breakdown += `XP Required:    ${data.levels.formattedXp}\n`;
                    breakdown += `Rate:           ${cheapest.basePrice.toFixed(8)} $/XP\n`;
                    breakdown += `─────────────────────────────────────────\n`;
                    breakdown += `Base Cost:      $${cheapest.subtotal.toFixed(2)}\n`;

                    if (hasModifiers) {
                        const upcharges = cheapest.modifiers.filter(m => m.displayType === 'UPCHARGE' && m.applied);
                        for (const mod of upcharges) {
                            const modValue = mod.type === 'PERCENTAGE'
                                ? `+${mod.value}%`
                                : `+$${mod.value.toFixed(2)}`;
                            breakdown += `${mod.name}:`.padEnd(16) + `${modValue}\n`;
                        }
                        breakdown += `─────────────────────────────────────────\n`;
                    }

                    breakdown += `\`\`\``;

                    // Add final price in ANSI color
                    breakdown += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${cheapest.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

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
                .setCustomId(`recalculate_${serviceId}`)
                .setLabel('Recalculate')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary);

            const orderButton = new ButtonBuilder()
                .setCustomId(`order_from_price_${serviceId}`)
                .setLabel('Place Order')
                .setEmoji('🛒')
                .setStyle(ButtonStyle.Success);

            const actionRow = new ActionRowBuilder()
                .addComponents(recalculateButton, orderButton);

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
