import { Events, Message, EmbedBuilder } from "discord.js";
import logger from "../../common/loggers";
import { ApiService } from "../services/api.service";
import { discordConfig } from "../config/discord.config";
import PricingCalculatorService from "../../api/pricingCalculator/pricingCalculator.service";
import Container from "typedi";

const apiService = new ApiService(discordConfig.apiBaseUrl);

export default {
    name: Events.MessageCreate,
    async execute(message: Message) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check if message starts with !s
        const prefix = discordConfig.prefix;
        if (!message.content.toLowerCase().startsWith(`${prefix}s `)) return;

        // If calculator channel is configured, only respond in that channel
        if (discordConfig.calculatorChannelId) {
            if (message.channelId !== discordConfig.calculatorChannelId) {
                return; // Silently ignore if not in calculator channel
            }
        }

        try {
            // Parse command: !s servicename startlevel-endlevel
            // Example: !s agility 70-99
            const args = message.content.slice(prefix.length + 2).trim().split(/\s+/);

            if (args.length < 2) {
                await message.reply({
                    content: "❌ **Invalid Command Format**\n\n" +
                        "**Usage:** `!s <service> <start-level>-<end-level>`\n" +
                        "**Example:** `!s agility 70-99`",
                });
                return;
            }

            // Parse service name (can have multiple words before level range)
            const lastArg = args[args.length - 1];
            const levelMatch = lastArg.match(/^(\d+)-(\d+)$/);

            if (!levelMatch) {
                await message.reply({
                    content: "❌ **Invalid Level Range**\n\n" +
                        "Please specify levels in format: `start-end`\n" +
                        "**Example:** `70-99`",
                });
                return;
            }

            const startLevel = parseInt(levelMatch[1]);
            const endLevel = parseInt(levelMatch[2]);

            // Service name is everything except the last argument
            const serviceName = args.slice(0, -1).join(" ").toLowerCase();

            logger.info(`[PriceCalculator] Command: !s ${serviceName} ${startLevel}-${endLevel} by ${message.author.tag}`);

            // Validate levels
            if (startLevel < 1 || startLevel > 99 || endLevel < 1 || endLevel > 99) {
                await message.reply({
                    content: "❌ **Invalid Levels**\n\n" +
                        "Levels must be between 1 and 99.",
                });
                return;
            }

            if (startLevel >= endLevel) {
                await message.reply({
                    content: "❌ **Invalid Level Range**\n\n" +
                        "Start level must be less than end level.",
                });
                return;
            }

            // Send "calculating..." message
            const thinkingMsg = await message.reply("🔢 Calculating price...");

            // Get all services to find matching service
            const services = await apiService.getAllServicesWithPricing();

            // Find service by name or slug
            const service = services.find((s: any) =>
                s.name.toLowerCase() === serviceName ||
                s.slug.toLowerCase() === serviceName ||
                s.name.toLowerCase().includes(serviceName) ||
                s.slug.toLowerCase().includes(serviceName)
            );

            if (!service) {
                await thinkingMsg.edit({
                    content: `❌ **Service Not Found**\n\n` +
                        `Could not find a service matching "${serviceName}".\n\n` +
                        `Use \`/services\` to see all available services.`,
                });
                return;
            }

            // Call the pricing calculator service directly (avoids HTTP overhead and same-process issues)
            try {
                logger.info(`[PriceCalculator] Calculating with serviceId: ${service.id}, levels: ${startLevel}-${endLevel}`);

                // Get the service instance from the dependency injection container
                const pricingService = Container.get(PricingCalculatorService);

                // Call the service method directly
                const result = await pricingService.calculateLevelRangePrice({
                    serviceId: service.id,
                    startLevel,
                    endLevel,
                });

                logger.info('[PriceCalculator] Calculation completed successfully');
                const data = result;

                // Validate response structure
                if (!data || !data.service) {
                    logger.error('[PriceCalculator] Invalid API response structure:');
                    logger.error('[PriceCalculator] result:', JSON.stringify(result, null, 2));
                    logger.error('[PriceCalculator] data:', JSON.stringify(data, null, 2));
                    throw new Error('Invalid response from pricing calculator API');
                }

                // Build the calculator result embed (MMOGoldHut style)
                const embed = new EmbedBuilder()
                    .setTitle(`${data.service.emoji || '⭐'} ${data.service.name} Calculator`)
                    .setColor(0xfca311) // Orange color from MMOGoldHut
                    .setTimestamp();

                // Add level range and XP required
                embed.addFields({
                    name: "📊 Level Range",
                    value: `**${data.levels.start}  →  ${data.levels.end}**\n` +
                        `\`\`\`ansi\n\u001b[36m${data.levels.formattedXp} XP Required\u001b[0m\n\`\`\``,
                    inline: false,
                });

                // Add price breakdown by level ranges
                if (data.priceBreakdown.length > 0) {
                    const breakdownLines: string[] = [];
                    for (const range of data.priceBreakdown) {
                        const rangeName = range.methodName.length > 30
                            ? range.methodName.substring(0, 27) + "..."
                            : range.methodName;
                        const price = range.totalPrice.toFixed(2);
                        breakdownLines.push(`**${rangeName}**`);
                        breakdownLines.push(`\`\`\`ansi\n\u001b[36m${range.startLevel}  -  ${range.endLevel} = $${price}\u001b[0m\n\`\`\``);
                    }

                    embed.addFields({
                        name: "💵 Price Breakdown",
                        value: breakdownLines.join('\n').substring(0, 1024),
                        inline: false,
                    });
                }

                // Add upcharges if any
                const upcharges = data.modifiers.filter((m: any) => m.displayType === 'UPCHARGE' && m.applied);
                if (upcharges.length > 0) {
                    const upchargeLines = upcharges.map((m: any) => `⚠️ ${m.name}`);
                    embed.addFields({
                        name: "⚠️ Additional Charges",
                        value: upchargeLines.join('\n').substring(0, 1024),
                        inline: false,
                    });
                }

                // Add notes if any
                const notes = data.modifiers.filter((m: any) => m.displayType === 'NOTE');
                if (notes.length > 0) {
                    const noteLines = notes.slice(0, 3).map((m: any) => `→ ${m.name}`);
                    embed.addFields({
                        name: "📝 Important Notes",
                        value: noteLines.join('\n').substring(0, 1024),
                        inline: false,
                    });
                }

                // Add total price section
                const totalSection =
                    `**Subtotal:** $${data.totals.subtotal.toFixed(2)}\n` +
                    (data.totals.modifiersTotal > 0 ? `**Modifiers:** +$${data.totals.modifiersTotal.toFixed(2)}\n` : '') +
                    `\`\`\`ansi\n\u001b[1;32mTotal: $${data.totals.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

                embed.addFields({
                    name: "💰 Total Price",
                    value: totalSection,
                    inline: false,
                });

                // Add GP cost if available (assuming $1 = 1B GP for example)
                if (data.totals.gpCost) {
                    embed.addFields({
                        name: "🪙 GP Cost",
                        value: `\`\`\`ansi\n\u001b[33m${data.totals.gpCost.toLocaleString()} GP\u001b[0m\n\`\`\``,
                        inline: false,
                    });
                }

                // Edit the "calculating..." message with the result
                await thinkingMsg.edit({
                    content: "",
                    embeds: [embed.toJSON() as any],
                });

                logger.info(`[PriceCalculator] Result sent for ${service.name} (${startLevel}-${endLevel}) to ${message.author.tag}`);

            } catch (apiError) {
                logger.error('[PriceCalculator] API error:', apiError);
                await thinkingMsg.edit({
                    content: `❌ **Calculation Error**\n\n` +
                        `An error occurred while calculating the price. ` +
                        `This service may not support level-based pricing.\n\n` +
                        `Please try another service or contact support.`,
                });
            }

        } catch (error) {
            logger.error('[PriceCalculator] Error handling !s command:', error);

            if (error instanceof Error) {
                await message.reply({
                    content: `❌ **Error**\n\n${error.message}`,
                }).catch((err) => logger.error('[PriceCalculator] Failed to send error message:', err));
            } else {
                await message.reply({
                    content: "❌ **An error occurred while processing your request.**\n\n" +
                        "Please try again or contact support.",
                }).catch((err) => logger.error('[PriceCalculator] Failed to send error message:', err));
            }
        }
    },
};
