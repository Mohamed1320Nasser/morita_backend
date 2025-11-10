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

            // Add price breakdown by level ranges
            if (data.priceBreakdown.length > 0) {
                const breakdownLines: string[] = [];
                for (const range of data.priceBreakdown) {
                    const rangeName =
                        range.methodName.length > 30
                            ? range.methodName.substring(0, 27) + "..."
                            : range.methodName;
                    const price = range.totalPrice.toFixed(2);
                    breakdownLines.push(`**${rangeName}**`);
                    breakdownLines.push(
                        `\`\`\`ansi\n\u001b[36m${range.startLevel}  -  ${range.endLevel} = $${price}\u001b[0m\n\`\`\``
                    );
                }

                embed.addFields({
                    name: "💵 Price Breakdown",
                    value: breakdownLines.join("\n").substring(0, 1024),
                    inline: false,
                });
            }

            // Add upcharges if any
            const upcharges = data.modifiers.filter(
                (m: any) => m.displayType === "UPCHARGE" && m.applied
            );
            if (upcharges.length > 0) {
                const upchargeLines = upcharges.map((m: any) => `⚠️ ${m.name}`);
                embed.addFields({
                    name: "⚠️ Additional Charges",
                    value: upchargeLines.join("\n").substring(0, 1024),
                    inline: false,
                });
            }

            // Add notes if any
            const notes = data.modifiers.filter(
                (m: any) => m.displayType === "NOTE"
            );
            if (notes.length > 0) {
                const noteLines = notes.slice(0, 3).map((m: any) => `→ ${m.name}`);
                embed.addFields({
                    name: "📝 Important Notes",
                    value: noteLines.join("\n").substring(0, 1024),
                    inline: false,
                });
            }

            // Add total price section
            const totalSection =
                `**Subtotal:** $${data.totals.subtotal.toFixed(2)}\n` +
                (data.totals.modifiersTotal > 0
                    ? `**Modifiers:** +$${data.totals.modifiersTotal.toFixed(2)}\n`
                    : "") +
                `\`\`\`ansi\n\u001b[1;32mTotal: $${data.totals.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

            embed.addFields({
                name: "💰 Total Price",
                value: totalSection,
                inline: false,
            });

            // Add GP cost if available
            if (data.totals.gpCost) {
                embed.addFields({
                    name: "🪙 GP Cost",
                    value: `\`\`\`ansi\n\u001b[33m${data.totals.gpCost.toLocaleString()} GP\u001b[0m\n\`\`\``,
                    inline: false,
                });
            }

            // Send the result
            await interaction.editReply({
                embeds: [embed.toJSON() as any],
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
