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

        // Check if message starts with any calculator command (!s, !p, !m, !i, !q)
        const commandMatch = content.match(/^!([spmiq])\s+/);
        if (!commandMatch) return;

        const commandType = commandMatch[1]; // s, p, m, i, or q

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
                case 'p': // PvM/Bossing - PER_KILL
                    await handleBossingCommand(message, apiService);
                    break;
                case 'm': // Minigames - PER_ITEM
                    await handleMinigamesCommand(message, apiService);
                    break;
                case 'i': // Ironman - PER_ITEM (filtered by category)
                    await handleIronmanCommand(message, apiService);
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

    // Find service by name or slug - prioritize exact matches
    let service = services.find((s: any) =>
        s.name.toLowerCase() === serviceName ||
        s.slug.toLowerCase() === serviceName
    );

    // If no exact match, try partial match
    if (!service) {
        service = services.find((s: any) =>
            s.name.toLowerCase().includes(serviceName) ||
            s.slug.toLowerCase().includes(serviceName)
        );
    }

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

        // Calculate total discount/upcharge from all methods to show at top
        const cheapestMethod = data.methodOptions?.find((m: any) => m.isCheapest);
        const allDiscounts = cheapestMethod?.modifiers?.filter((m: any) => m.applied && Number(m.value) < 0) || [];
        const totalDiscountPercent = allDiscounts.reduce((sum: number, mod: any) =>
            mod.type === 'PERCENTAGE' ? sum + Math.abs(Number(mod.value)) : sum, 0
        );

        logger.info('[PriceCalculator] Total discount percent: ' + totalDiscountPercent);

        // Add level range, XP required, and discount (if any)
        let levelRangeValue =
            `**${data.levels.start}  →  ${data.levels.end}**\n` +
            `\`\`\`ansi\n\u001b[36m${data.levels.formattedXp} XP Required\u001b[0m\n\`\`\``;

        if (totalDiscountPercent > 0) {
            logger.info('[PriceCalculator] ✅ Adding discount to display: ' + totalDiscountPercent.toFixed(1) + '%');
            levelRangeValue += `\`\`\`ansi\n\u001b[32mDiscount: ${totalDiscountPercent.toFixed(1)}%\u001b[0m\n\`\`\``;
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

                // Calculate OSRS gold
                const osrsGoldRate = 5.5; // 5.5M per $1 USD
                const osrsGold = method.finalPrice * osrsGoldRate;
                const osrsGoldFormatted = osrsGold >= 1000
                    ? `${(osrsGold / 1000).toFixed(2)}B`
                    : `${osrsGold.toFixed(1)}M`;

                logger.info(`[PriceCalculator] 💰 ${method.methodName}: $${price} = ${osrsGoldFormatted} OSRS Gold`);

                // Create visually appealing line with proper spacing
                priceLines.push(`${indicator} **${method.methodName}**`);
                priceLines.push(`   💰 Price: \`$${price}\` • Rate: \`${rate} $/XP\``);
                priceLines.push(`   🔥 \`${osrsGoldFormatted}\` OSRS Gold`);
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

                // Add header with service info
                let headerBreakdown = `\`\`\`yml\n`;
                headerBreakdown += `Service:        ${data.service.name}\n`;
                headerBreakdown += `─────────────────────────────────────────\n`;
                headerBreakdown += `Levels:         ${data.levels.start} → ${data.levels.end}\n`;
                headerBreakdown += `XP Required:    ${data.levels.formattedXp}\n`;
                headerBreakdown += `\`\`\``;

                embed.addFields({
                    name: "✅ Recommended Option — Full Breakdown",
                    value: headerBreakdown,
                    inline: false,
                });

                // Add each segment as its own field for professional display
                if (cheapest.levelRanges && cheapest.levelRanges.length > 0) {
                    for (let i = 0; i < cheapest.levelRanges.length; i++) {
                        const range = cheapest.levelRanges[i];
                        const methodName = range.methodName || cheapest.methodName;
                        const ratePerXp = range.ratePerXp || cheapest.basePrice;
                        const segmentPrice = range.totalPrice || 0;

                        let segmentDisplay = `\`\`\`yml\n`;
                        segmentDisplay += `Method:         ${methodName}\n`;
                        segmentDisplay += `Rate:           ${ratePerXp.toFixed(8)} $/XP\n`;
                        segmentDisplay += `XP:             ${range.xpRequired?.toLocaleString() || '0'}\n`;
                        segmentDisplay += `Cost:           $${segmentPrice.toFixed(2)}\n`;
                        segmentDisplay += `\`\`\``;

                        embed.addFields({
                            name: `📊 ${range.startLevel}-${range.endLevel}`,
                            value: segmentDisplay,
                            inline: false,
                        });
                    }
                }

                // Build pricing summary
                let pricingSummary = `\`\`\`yml\n`;
                pricingSummary += `Base Cost:      $${cheapest.subtotal.toFixed(2)}\n`;

                // Show discounts
                if (discounts.length > 0) {
                    for (const mod of discounts) {
                        const modValue = mod.type === 'PERCENTAGE'
                            ? `${mod.value}%`
                            : `-$${Math.abs(Number(mod.value)).toFixed(2)}`;
                        pricingSummary += `${mod.name}:`.padEnd(16) + `${modValue}\n`;
                    }
                }

                // Show upcharges
                if (upcharges.length > 0) {
                    for (const mod of upcharges) {
                        const modValue = mod.type === 'PERCENTAGE'
                            ? `+${mod.value}%`
                            : `+$${mod.value.toFixed(2)}`;
                        pricingSummary += `${mod.name}:`.padEnd(16) + `${modValue}\n`;
                    }
                }

                pricingSummary += `\`\`\``;

                // Calculate OSRS gold conversion (1 USD = 5.5M OSRS gold average)
                const osrsGoldRate = 5.5; // 5.5M per $1 USD
                const osrsGold = cheapest.finalPrice * osrsGoldRate;
                const osrsGoldFormatted = osrsGold >= 1000
                    ? `${(osrsGold / 1000).toFixed(3)}B`
                    : `${osrsGold.toFixed(1)}M`;

                logger.info('[PriceCalculator] 🔥 Final breakdown OSRS gold: ' + osrsGoldFormatted + ' for $' + cheapest.finalPrice.toFixed(2));

                // Add final price in ANSI color with OSRS gold
                pricingSummary += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${cheapest.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;
                pricingSummary += `\`\`\`ansi\n\u001b[1;33m🔥 ${osrsGoldFormatted} OSRS Gold\u001b[0m\n\`\`\``;

                logger.info('[PriceCalculator] ✅ Sending embed with all features');

                embed.addFields({
                    name: "💰 Price Summary",
                    value: pricingSummary,
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

// Handler for !p command (PvM/Bossing - PER_KILL pricing)
async function handleBossingCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const args = message.content.slice(prefix.length + 2).trim().split(/\s+/);

    if (args.length < 2) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Usage:** `!p <boss-name> <kill-count>`\n" +
                "**Example:** `!p cox 120` or `!p zulrah 100`",
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
    let serviceName = args.slice(0, -1).join(" ").toLowerCase();

    // Common boss aliases - map short names to full service names
    const bossAliases: { [key: string]: string } = {
        'cox': 'chambers',
        'chambers of xeric': 'chambers',
        'tob': 'theatre',
        'theatre of blood': 'theatre',
        'toa': 'tombs',
        'tombs of amascut': 'tombs',
    };

    // Check if serviceName matches an alias
    if (bossAliases[serviceName]) {
        logger.info(`[PvM] 🔄 Alias detected: "${serviceName}" → "${bossAliases[serviceName]}"`);
        serviceName = bossAliases[serviceName];
    }

    logger.info(`[PriceCalculator] Command: !p ${serviceName} ${killCount} by ${message.author.tag}`);

    // Send "calculating..." message
    const thinkingMsg = await message.reply("🔢 Calculating price...");

    // Get all services to find matching service
    const services = await apiService.getAllServicesWithPricing();

    logger.info(`[PvM] 📊 Total services fetched: ${services.length}`);

    // Log all services with PER_KILL pricing for debugging
    const perKillServices = services.filter((s: any) =>
        s.pricingMethods?.some((m: any) => m.pricingUnit === 'PER_KILL')
    );
    logger.info(`[PvM] 🎯 Services with PER_KILL pricing: ${perKillServices.length}`);
    perKillServices.forEach((s: any) => {
        logger.info(`[PvM]   - "${s.name}" (slug: ${s.slug})`);
    });

    logger.info(`[PvM] 🔍 Searching for service matching: "${serviceName}"`);

    // Find service by name or slug (filter for PER_KILL services)
    const service = services.find((s: any) => {
        const matchesName = s.name.toLowerCase().includes(serviceName) ||
            s.slug.toLowerCase().includes(serviceName);
        const hasPerKillPricing = s.pricingMethods?.some((m: any) => m.pricingUnit === 'PER_KILL');

        logger.debug(`[PvM]   Checking: "${s.name}" | Name match: ${s.name.toLowerCase().includes(serviceName)} | Slug match: ${s.slug.toLowerCase().includes(serviceName)} | Has PER_KILL: ${hasPerKillPricing}`);

        return matchesName && hasPerKillPricing;
    });

    if (!service) {
        logger.warn(`[PvM] ❌ No service found matching "${serviceName}" with PER_KILL pricing`);
        await thinkingMsg.edit({
            content: `❌ **Service Not Found**\n\n` +
                `Could not find a PvM service matching "${serviceName}".\n\n` +
                `Make sure the service supports kill-count pricing.\n` +
                `**Tip:** Try \`!p cox 120\` or \`!p zulrah 100\``,
        });
        return;
    }

    logger.info(`[PvM] ✅ Found service: "${service.name}" (id: ${service.id})`);

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

// Handler for !i command (Ironman Gathering - PER_ITEM pricing, filtered by category)
async function handleIronmanCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const args = message.content.slice(prefix.length + 2).trim().split(/\s+/);

    if (args.length < 2) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Usage:** `!i <item-name> <quantity>`\n" +
                "**Example:** `!i amethyst 1000`",
        });
        return;
    }

    // Last argument is quantity
    const quantityStr = args[args.length - 1];
    const quantity = parseInt(quantityStr);

    if (isNaN(quantity) || quantity < 1) {
        await message.reply({
            content: "❌ **Invalid Quantity**\n\n" +
                "Please specify a valid number.\n" +
                "**Example:** `1000`",
        });
        return;
    }

    // Service name is everything except the last argument
    const serviceName = args.slice(0, -1).join(" ").toLowerCase();

    logger.info(`[Ironman] Command: !i ${serviceName} ${quantity} by ${message.author.tag}`);

    // Send "calculating..." message
    const thinkingMsg = await message.reply("🔗 Calculating Ironman service price...");

    // Get all services to find matching service
    const services = await apiService.getAllServicesWithPricing();

    // Find service by name or slug (filter for Ironman Gathering category)
    const service = services.find((s: any) => {
        const matchesName = s.name.toLowerCase().includes(serviceName) ||
            s.slug.toLowerCase().includes(serviceName);
        const isIronmanCategory = s.category?.slug === 'ironman-gathering' ||
                                  s.category?.name?.toLowerCase().includes('ironman');

        // All Ironman services use PER_ITEM pricing, so we only check category
        return matchesName && isIronmanCategory;
    });

    if (!service) {
        await thinkingMsg.edit({
            content: `❌ **Ironman Service Not Found**\n\n` +
                `Could not find an Ironman gathering service matching "${serviceName}".\n\n` +
                `Available services: amethyst, ores-bars, charter-ship, chinchompas, farm-runs, raw-fish, herblore-secondaries, impling, logs-planks`,
        });
        return;
    }

    try {
        logger.info(`[Ironman] Calculating with serviceId: ${service.id}, quantity: ${quantity}`);

        // Fetch full service details with pricing methods
        const fullService = await apiService.getServiceWithPricing(service.id);

        const pricingService = new PricingCalculatorService();

        // Get the first PER_ITEM pricing method
        if (!fullService.pricingMethods || fullService.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        const method = fullService.pricingMethods.find((m: any) => m.pricingUnit === 'PER_ITEM');

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
            quantity: quantity,
        });

        // Calculate OSRS gold conversion
        const osrsGoldRate = 5.5; // 5.5M per $1 USD
        const osrsGold = result.finalPrice * osrsGoldRate;
        const osrsGoldFormatted = osrsGold >= 1000
            ? `${(osrsGold / 1000).toFixed(3)}B`
            : `${osrsGold.toFixed(1)}M`;

        const embed = new EmbedBuilder()
            .setTitle(`${service.emoji || '🔗'} ${service.name}`)
            .setColor(0xfca311) // Orange color
            .setTimestamp();

        embed.addFields({
            name: "🔗 Ironman Gathering",
            value: `\`\`\`ansi\n\u001b[36m${quantity} × ${method.name}\u001b[0m\n\`\`\``,
            inline: false,
        });

        // Add modifiers info
        const appliedModifiers = result.modifiers.filter((m: any) => m.applied);
        if (appliedModifiers.length > 0) {
            const modLines = appliedModifiers.map((m: any) => {
                const icon = m.displayType === 'UPCHARGE' ? '⚠️' : m.displayType === 'DISCOUNT' ? '✅' : '→';
                return `${icon} ${m.name}: ${m.type === 'PERCENTAGE' ? m.value + '%' : '$' + m.value}`;
            });
            embed.addFields({
                name: "📝 Modifiers Applied",
                value: modLines.join('\n').substring(0, 1024),
                inline: false,
            });
        }

        // Build price breakdown
        let priceBreakdown = `**Method:** ${method.name}\n`;
        priceBreakdown += `**Rate:** $${method.basePrice.toFixed(6)}/item\n`;
        priceBreakdown += `**Base Cost:** $${result.basePrice.toFixed(2)}\n`;

        if (result.breakdown.totalModifiers !== 0) {
            const modSymbol = result.breakdown.totalModifiers > 0 ? '+' : '';
            priceBreakdown += `**Modifiers:** ${modSymbol}$${result.breakdown.totalModifiers.toFixed(2)}\n`;
        }

        priceBreakdown += `\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;
        priceBreakdown += `\`\`\`ansi\n\u001b[1;33m🔥 ${osrsGoldFormatted} OSRS Gold\u001b[0m\n\`\`\``;

        embed.addFields({
            name: "💰 Price Breakdown",
            value: priceBreakdown,
            inline: false,
        });

        // Add requirements note if available
        if (method.description) {
            embed.addFields({
                name: "📋 Requirements",
                value: method.description,
                inline: false,
            });
        }

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[Ironman] Result sent for ${service.name} (${quantity} items) to ${message.author.tag}`);
    } catch (apiError) {
        logger.error('[Ironman] API error:', apiError);
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
