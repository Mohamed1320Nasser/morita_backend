import { Events, Message, EmbedBuilder } from "discord.js";
import logger from "../../common/loggers";
import { ApiService } from "../services/api.service";
import { discordConfig } from "../config/discord.config";
import PricingCalculatorService from "../../api/pricingCalculator/pricingCalculator.service";

const apiService = new ApiService(discordConfig.apiBaseUrl);

export default {
    name: Events.MessageCreate,
    async execute(message: Message) {
        // Ignore bot messages
        if (message.author.bot) return;

        const prefix = discordConfig.prefix;
        const content = message.content.toLowerCase();

        // Check if message starts with any calculator command (!s, !b, !m, !q)
        const commandMatch = content.match(/^!([sbmq])\s+/);
        if (!commandMatch) return;

        const commandType = commandMatch[1]; // s, b, m, or q

        // If calculator channel is configured, only respond in that channel
        if (discordConfig.calculatorChannelId) {
            if (message.channelId !== discordConfig.calculatorChannelId) {
                return; // Silently ignore if not in calculator channel
            }
        }

        try {
            // Route to appropriate handler based on command type
            switch (commandType) {
                case 's': // Skills - PER_LEVEL
                    await handleSkillsCommand(message, apiService);
                    break;
                case 'b': // Bossing - PER_KILL
                    await handleBossingCommand(message, apiService);
                    break;
                case 'm': // Minigames - PER_ITEM
                    await handleMinigamesCommand(message, apiService);
                    break;
                case 'q': // Quote - FIXED price
                    await handleQuoteCommand(message, apiService);
                    break;
                default:
                    return;
            }
        } catch (error) {
            logger.error('[PriceCalculator] Error handling command:', error);

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

// Handler for !s command (Skills - PER_LEVEL pricing)
async function handleSkillsCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
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

        // Create a new instance of the pricing service (no dependencies)
        const pricingService = new PricingCalculatorService();

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
}

// Handler for !b command (Bossing - PER_KILL pricing)
async function handleBossingCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const args = message.content.slice(prefix.length + 2).trim().split(/\s+/);

    if (args.length < 2) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Usage:** `!b <boss-name> <kill-count>`\n" +
                "**Example:** `!b zulrah 100`",
        });
        return;
    }

    // Last argument is kill count
    const killCountStr = args[args.length - 1];
    const killCount = parseInt(killCountStr);

    if (isNaN(killCount) || killCount < 1) {
        await message.reply({
            content: "❌ **Invalid Kill Count**\n\n" +
                "Please specify a valid number of kills.\n" +
                "**Example:** `100`",
        });
        return;
    }

    // Service name is everything except the last argument
    const serviceName = args.slice(0, -1).join(" ").toLowerCase();

    logger.info(`[PriceCalculator] Command: !b ${serviceName} ${killCount} by ${message.author.tag}`);

    // Send "calculating..." message
    const thinkingMsg = await message.reply("🔢 Calculating price...");

    // Get all services to find matching service
    const services = await apiService.getAllServicesWithPricing();

    // Find service by name or slug (filter for PER_KILL services)
    const service = services.find((s: any) => {
        const matchesName = s.name.toLowerCase().includes(serviceName) ||
            s.slug.toLowerCase().includes(serviceName);
        const hasPerKillPricing = s.pricingMethods?.some((m: any) => m.pricingUnit === 'PER_KILL');
        return matchesName && hasPerKillPricing;
    });

    if (!service) {
        await thinkingMsg.edit({
            content: `❌ **Service Not Found**\n\n` +
                `Could not find a bossing service matching "${serviceName}".\n\n` +
                `Make sure the service supports kill-count pricing.`,
        });
        return;
    }

    try {
        logger.info(`[PriceCalculator] Calculating with serviceId: ${service.id}, kills: ${killCount}`);

        const pricingService = new PricingCalculatorService();

        // Get the first PER_KILL pricing method
        if (!service.pricingMethods || service.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        const method = service.pricingMethods.find((m: any) => m.pricingUnit === 'PER_KILL');

        if (!method) {
            throw new Error('No PER_KILL pricing method found for this service');
        }

        // Get payment methods to get the default one
        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }
        const defaultPaymentMethod = paymentMethods[0];

        // Calculate price using the generic calculatePrice method
        const result = await pricingService.calculatePrice({
            methodId: method.id,
            paymentMethodId: defaultPaymentMethod.id,
            quantity: killCount,
        });

        const embed = new EmbedBuilder()
            .setTitle(`${service.emoji || '⚔️'} ${service.name}`)
            .setColor(0xfca311)
            .setTimestamp();

        embed.addFields({
            name: "🎯 Kill Count",
            value: `\`\`\`ansi\n\u001b[36m${killCount} Kills\u001b[0m\n\`\`\``,
            inline: false,
        });

        // Add modifiers info
        const appliedModifiers = result.modifiers.filter((m: any) => m.applied);
        if (appliedModifiers.length > 0) {
            const modLines = appliedModifiers.map((m: any) =>
                `${m.displayType === 'UPCHARGE' ? '⚠️' : '→'} ${m.name}`
            );
            embed.addFields({
                name: "📝 Modifiers Applied",
                value: modLines.join('\n').substring(0, 1024),
                inline: false,
            });
        }

        // Add total price
        const totalSection =
            `**Base Price:** $${result.basePrice.toFixed(2)}\n` +
            (result.breakdown.totalModifiers > 0 ? `**Modifiers:** +$${result.breakdown.totalModifiers.toFixed(2)}\n` : '') +
            `\`\`\`ansi\n\u001b[1;32mTotal: $${result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

        embed.addFields({
            name: "💰 Total Price",
            value: totalSection,
            inline: false,
        });

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[PriceCalculator] Result sent for ${service.name} (${killCount} kills) to ${message.author.tag}`);
    } catch (apiError) {
        logger.error('[PriceCalculator] API error:', apiError);
        await thinkingMsg.edit({
            content: `❌ **Calculation Error**\n\n` +
                `An error occurred while calculating the price.\n\n` +
                `Please try another service or contact support.`,
        });
    }
}

// Handler for !m command (Minigames - PER_ITEM pricing)
async function handleMinigamesCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const args = message.content.slice(prefix.length + 2).trim().split(/\s+/);

    if (args.length < 2) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Usage:** `!m <game-name> <count>`\n" +
                "**Example:** `!m barrows 100`",
        });
        return;
    }

    // Last argument is item/game count
    const countStr = args[args.length - 1];
    const count = parseInt(countStr);

    if (isNaN(count) || count < 1) {
        await message.reply({
            content: "❌ **Invalid Count**\n\n" +
                "Please specify a valid number.\n" +
                "**Example:** `100`",
        });
        return;
    }

    // Service name is everything except the last argument
    const serviceName = args.slice(0, -1).join(" ").toLowerCase();

    logger.info(`[PriceCalculator] Command: !m ${serviceName} ${count} by ${message.author.tag}`);

    // Send "calculating..." message
    const thinkingMsg = await message.reply("🔢 Calculating price...");

    // Get all services to find matching service
    const services = await apiService.getAllServicesWithPricing();

    // Find service by name or slug (filter for PER_ITEM services)
    const service = services.find((s: any) => {
        const matchesName = s.name.toLowerCase().includes(serviceName) ||
            s.slug.toLowerCase().includes(serviceName);
        const hasPerItemPricing = s.pricingMethods?.some((m: any) => m.pricingUnit === 'PER_ITEM');
        return matchesName && hasPerItemPricing;
    });

    if (!service) {
        await thinkingMsg.edit({
            content: `❌ **Service Not Found**\n\n` +
                `Could not find a minigame service matching "${serviceName}".\n\n` +
                `Make sure the service supports per-item pricing.`,
        });
        return;
    }

    try {
        logger.info(`[PriceCalculator] Calculating with serviceId: ${service.id}, count: ${count}`);

        const pricingService = new PricingCalculatorService();

        // Get the first PER_ITEM pricing method
        if (!service.pricingMethods || service.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        const method = service.pricingMethods.find((m: any) => m.pricingUnit === 'PER_ITEM');

        if (!method) {
            throw new Error('No PER_ITEM pricing method found for this service');
        }

        // Get payment methods to get the default one
        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }
        const defaultPaymentMethod = paymentMethods[0];

        // Calculate price
        const result = await pricingService.calculatePrice({
            methodId: method.id,
            paymentMethodId: defaultPaymentMethod.id,
            quantity: count,
        });

        const embed = new EmbedBuilder()
            .setTitle(`${service.emoji || '🎮'} ${service.name}`)
            .setColor(0xfca311)
            .setTimestamp();

        embed.addFields({
            name: "🎮 Quantity",
            value: `\`\`\`ansi\n\u001b[36m${count} Games/Items\u001b[0m\n\`\`\``,
            inline: false,
        });

        // Add modifiers info
        const appliedModifiers = result.modifiers.filter((m: any) => m.applied);
        if (appliedModifiers.length > 0) {
            const modLines = appliedModifiers.map((m: any) =>
                `${m.displayType === 'UPCHARGE' ? '⚠️' : '→'} ${m.name}`
            );
            embed.addFields({
                name: "📝 Modifiers Applied",
                value: modLines.join('\n').substring(0, 1024),
                inline: false,
            });
        }

        // Add total price
        const totalSection =
            `**Base Price:** $${result.basePrice.toFixed(2)}\n` +
            (result.breakdown.totalModifiers > 0 ? `**Modifiers:** +$${result.breakdown.totalModifiers.toFixed(2)}\n` : '') +
            `\`\`\`ansi\n\u001b[1;32mTotal: $${result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

        embed.addFields({
            name: "💰 Total Price",
            value: totalSection,
            inline: false,
        });

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[PriceCalculator] Result sent for ${service.name} (${count} items) to ${message.author.tag}`);
    } catch (apiError) {
        logger.error('[PriceCalculator] API error:', apiError);
        await thinkingMsg.edit({
            content: `❌ **Calculation Error**\n\n` +
                `An error occurred while calculating the price.\n\n` +
                `Please try another service or contact support.`,
        });
    }
}

// Handler for !q command (Quote - FIXED pricing)
async function handleQuoteCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const args = message.content.slice(prefix.length + 2).trim().split(/\s+/);

    if (args.length < 1) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Usage:** `!q <service-name>`\n" +
                "**Example:** `!q infernal-cape`",
        });
        return;
    }

    // Service name is all arguments
    const serviceName = args.join(" ").toLowerCase();

    logger.info(`[PriceCalculator] Command: !q ${serviceName} by ${message.author.tag}`);

    // Send "fetching..." message
    const thinkingMsg = await message.reply("💰 Fetching price quote...");

    // Get all services to find matching service
    const services = await apiService.getAllServicesWithPricing();

    // Find service by name or slug (filter for FIXED services)
    const service = services.find((s: any) => {
        const matchesName = s.name.toLowerCase().includes(serviceName) ||
            s.slug.toLowerCase().includes(serviceName);
        const hasFixedPricing = s.pricingMethods?.some((m: any) => m.pricingUnit === 'FIXED');
        return matchesName && hasFixedPricing;
    });

    if (!service) {
        await thinkingMsg.edit({
            content: `❌ **Service Not Found**\n\n` +
                `Could not find a fixed-price service matching "${serviceName}".\n\n` +
                `Make sure the service has fixed pricing.`,
        });
        return;
    }

    try {
        logger.info(`[PriceCalculator] Getting quote for serviceId: ${service.id}`);

        const pricingService = new PricingCalculatorService();

        // Get all FIXED pricing methods for this service
        if (!service.pricingMethods || service.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        const fixedMethods = service.pricingMethods.filter((m: any) => m.pricingUnit === 'FIXED');

        if (fixedMethods.length === 0) {
            throw new Error('No FIXED pricing method found for this service');
        }

        // Get payment methods to get the default one
        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }
        const defaultPaymentMethod = paymentMethods[0];

        const embed = new EmbedBuilder()
            .setTitle(`${service.emoji || '⭐'} ${service.name}`)
            .setDescription(service.description || 'Fixed price service')
            .setColor(0xfca311)
            .setTimestamp();

        // Show all pricing options
        for (const method of fixedMethods) {
            const result = await pricingService.calculatePrice({
                methodId: method.id,
                paymentMethodId: defaultPaymentMethod.id,
                quantity: 1,
            });

            const priceInfo =
                `**Base Price:** $${result.basePrice.toFixed(2)}\n` +
                (result.breakdown.totalModifiers > 0 ? `**With Modifiers:** $${result.finalPrice.toFixed(2)}\n` : '') +
                `\`\`\`ansi\n\u001b[1;32m$${result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

            embed.addFields({
                name: `💎 ${method.name}`,
                value: priceInfo,
                inline: fixedMethods.length > 1,
            });
        }

        // Add note about modifiers
        embed.addFields({
            name: "📝 Note",
            value: "Final price may vary based on account requirements and selected options.\nContact support for a personalized quote!",
            inline: false,
        });

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[PriceCalculator] Quote sent for ${service.name} to ${message.author.tag}`);
    } catch (apiError) {
        logger.error('[PriceCalculator] API error:', apiError);
        await thinkingMsg.edit({
            content: `❌ **Quote Error**\n\n` +
                `An error occurred while fetching the price quote.\n\n` +
                `Please try another service or contact support.`,
        });
    }
}
