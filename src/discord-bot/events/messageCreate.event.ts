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
            // Build pricing display - just show all individual segments
            const priceLines: string[] = [];

            // Get only individual segments (not Optimal Combination)
            const individualSegments = data.methodOptions.filter((m: any) => {
                // Skip "Optimal Combination" and other combined methods
                return m.methodName.includes('(') && m.methodName.includes('-') && m.methodName.includes(')');
            });

            // Display all individual segments
            for (const method of individualSegments) {
                const price = method.finalPrice.toFixed(2);
                const rate = method.basePrice ? method.basePrice.toFixed(8) : '0.00000000';

                logger.info(`[PriceCalculator] 💰 ${method.methodName}: $${price}`);

                // Compact display with rate
                priceLines.push(`◻️ **${method.methodName}**`);
                priceLines.push(`   💰 \`$${price}\` • Rate: \`${rate} $/XP\``);
                priceLines.push(''); // Spacing
            }

            // Remove last empty line
            if (priceLines.length > 0) {
                priceLines.pop();

                embed.addFields({
                    name: "💵 Pricing Options",
                    value: priceLines.join('\n'),
                    inline: false,
                });
            }

            // Show beautiful breakdown for cheapest COMPLETE option (not partial segments)
            // Filter to only methods that cover the FULL requested range
            const completeMethods = data.methodOptions.filter((m: any) => {
                // Check if this method covers the full range
                if (!m.levelRanges || m.levelRanges.length === 0) return false;

                const minLevel = Math.min(...m.levelRanges.map((r: any) => r.startLevel));
                const maxLevel = Math.max(...m.levelRanges.map((r: any) => r.endLevel));

                return minLevel <= data.levels.start && maxLevel >= data.levels.end;
            });

            // Find cheapest complete method
            const cheapest = completeMethods.length > 0
                ? completeMethods.reduce((min, curr) => curr.finalPrice < min.finalPrice ? curr : min)
                : data.methodOptions.find(m => m.isCheapest); // Fallback to original logic
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
                    // Sort level ranges by start level
                    const sortedRanges = [...cheapest.levelRanges].sort((a, b) => a.startLevel - b.startLevel);

                    for (let i = 0; i < sortedRanges.length; i++) {
                        const range = sortedRanges[i];
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

                logger.info('[PriceCalculator] 💰 Final price: $' + cheapest.finalPrice.toFixed(2));

                // Add final price in ANSI color
                pricingSummary += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${cheapest.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

                logger.info('[PriceCalculator] ✅ Sending embed with all segments');

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
// Enhanced to match old OSRS Machines system with multi-tier pricing table
async function handleBossingCommand(message: Message, apiService: ApiService) {
    // Prevent duplicate responses from bot messages
    if (message.author.bot) {
        logger.debug('[PvM] Ignoring bot message to prevent duplicates');
        return;
    }

    const prefix = discordConfig.prefix;
    const args = message.content.slice(prefix.length + 2).trim().split(/\s+/);

    if (args.length < 2) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Usage:** `!p <boss-name> <kill-count>`\n" +
                "**Example:** `!p cox 120` or `!p cgp 50`",
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
        'cg': 'gauntlet',
        'cgp': 'corrupted gauntlet',
        'corrupted': 'corrupted gauntlet',
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

    // Find service by name or slug (filter for PER_KILL services)
    let service = services.find((s: any) => {
        const matchesName = s.name.toLowerCase().includes(serviceName) ||
            s.slug.toLowerCase().includes(serviceName);
        const hasPerKillPricing = s.pricingMethods?.some((m: any) => m.pricingUnit === 'PER_KILL');

        return matchesName && hasPerKillPricing;
    });

    // Fetch full service with modifiers (both service-level and method-level)
    if (service) {
        const fullService = await apiService.getServiceWithPricing(service.id);
        service = fullService;
    }

    if (!service) {
        logger.warn(`[PvM] ❌ No service found matching "${serviceName}" with PER_KILL pricing`);
        await thinkingMsg.edit({
            content: `❌ **Service Not Found**\n\n` +
                `Could not find a PvM service matching "${serviceName}".\n\n` +
                `Make sure the service supports kill-count pricing.\n` +
                `**Tip:** Try \`!p cox 120\`, \`!p cgp 50\`, or \`!p zulrah 100\``,
        });
        return;
    }

    logger.info(`[PvM] ✅ Found service: "${service.name}" (id: ${service.id})`);

    try {
        logger.info(`[PriceCalculator] Calculating with serviceId: ${service.id}, kills: ${killCount}`);

        const pricingService = new PricingCalculatorService();

        // Get ALL PER_KILL pricing methods (multiple tiers like old system)
        if (!service.pricingMethods || service.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        const allMethods = service.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_KILL');

        if (allMethods.length === 0) {
            throw new Error('No PER_KILL pricing method found for this service');
        }

        // Get ALL payment methods (to show multiple price options like old system)
        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }

        logger.info(`[PvM] Found ${allMethods.length} pricing tiers and ${paymentMethods.length} payment methods`);

        // Build OLD SYSTEM style embed with table and colors
        const embed = new EmbedBuilder()
            .setTitle(`🔥 Bossing Calculator`) // Red fire emoji like old system
            .setColor(0x36393F) // Discord dark theme color
            .setTimestamp()
            .setThumbnail('https://oldschool.runescape.wiki/images/thumb/Crystalline_Hunllef.png/250px-Crystalline_Hunllef.png'); // Monster image like old system

        // Calculate total discount from service-level modifiers
        const serviceModifiers = service.serviceModifiers || [];
        const discountModifiers = serviceModifiers.filter((m: any) =>
            m.active && m.modifierType === 'PERCENTAGE' && Number(m.value) < 0
        );
        const totalDiscountPercent = discountModifiers.reduce((sum: number, mod: any) =>
            sum + Math.abs(Number(mod.value)), 0
        );

        // Compact table header
        let tableText = "```ansi\n";
        tableText += `\u001b[0;37mMonster:                   Amount  Discount\u001b[0m\n`;
        tableText += `\u001b[0;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n`;

        // Show service name, kill count, and discount (compact)
        const monsterName = service.name.substring(0, 25).padEnd(25);
        const discountDisplay = totalDiscountPercent > 0
            ? `\u001b[0;32m${totalDiscountPercent.toFixed(0)}%\u001b[0m`
            : `\u001b[0;37mNone\u001b[0m`;

        tableText += `\u001b[0;36m${monsterName}\u001b[0m  \u001b[0;36m${killCount.toString().padStart(6)}\u001b[0m  ${discountDisplay}\n`;
        tableText += "```";

        embed.setDescription(tableText);

        // Calculate prices for each tier (using first/default payment method)
        const tierResults: Array<{
            tier: string;
            notes: string;
            pricePerKill: number;
            basePrice: number;
            modifiers: Array<{ name: string; value: number; type: string }>;
            finalPrice: number;
        }> = [];

        const defaultPaymentMethod = paymentMethods[0];

        // Get all active service modifier IDs to apply them automatically
        const serviceModifierIds = (service.serviceModifiers || [])
            .filter((m: any) => m.active)
            .map((m: any) => m.id);

        logger.info(`[PvM] Applying ${serviceModifierIds.length} service-level modifiers`);

        for (const method of allMethods) {
            try {
                const result = await pricingService.calculatePrice({
                    methodId: method.id,
                    paymentMethodId: defaultPaymentMethod.id,
                    quantity: killCount,
                    serviceModifierIds, // ✅ Pass service modifier IDs
                });

                logger.info(`[PvM] Method: ${method.name} | Base: $${result.basePrice} | Modifiers: $${result.breakdown?.totalModifiers || 0} | Final: $${result.finalPrice}`);

                // Extract applied modifiers
                const appliedModifiers = result.modifiers
                    ?.filter((m: any) => m.applied)
                    .map((m: any) => ({
                        name: m.name,
                        value: m.type === 'PERCENTAGE' ? Number(m.value) : Number(m.value),
                        type: m.type,
                    })) || [];

                tierResults.push({
                    tier: method.name,
                    notes: method.description || "Per Kc",
                    pricePerKill: method.basePrice,
                    basePrice: result.basePrice,
                    modifiers: appliedModifiers,
                    finalPrice: result.finalPrice,
                });
            } catch (err) {
                logger.warn(`[PvM] Failed to calculate for ${method.name}:`, err);
            }
        }

        // Build pricing tiers section - COMPACT with modifier breakdown
        for (const tier of tierResults) {
            let tierSection = "";

            // Tier header
            tierSection += `\`\`\`fix\n${tier.tier}\n\`\`\``;

            // Notes and Price Per Kill
            tierSection += `**${tier.notes}** • \`$${tier.pricePerKill.toFixed(2)}/kc\`\n`;

            // Price breakdown
            if (tier.modifiers.length > 0) {
                // Has modifiers - show breakdown
                tierSection += `\`\`\`diff\n`;
                tierSection += `  Base Price           $${tier.basePrice.toFixed(2)}\n`;

                for (const mod of tier.modifiers) {
                    const symbol = mod.value < 0 ? '-' : '+';
                    const absValue = Math.abs(mod.value);
                    const displayValue = mod.type === 'PERCENTAGE' ? `${absValue.toFixed(0)}%` : `$${absValue.toFixed(2)}`;
                    tierSection += `${symbol} ${mod.name.substring(0, 18).padEnd(18)} ${displayValue}\n`;
                }

                tierSection += `\n= Total              $${tier.finalPrice.toFixed(2)}\n`;
                tierSection += `\`\`\``;
            } else {
                // No modifiers - show direct price
                tierSection += `\`\`\`ansi\n\u001b[1;32m💰 Price: $${tier.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;
            }

            // Add field
            embed.addFields({
                name: "\u200B",
                value: tierSection,
                inline: false,
            });
        }

        // Add footer with timestamp (like old system)
        embed.setFooter({
            text: `Morita Gaming Services • Today at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
        });

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[PriceCalculator] Multi-tier result sent for ${service.name} (${killCount} kills) to ${message.author.tag}`);
    } catch (apiError) {
        logger.error('[PriceCalculator] API error:', apiError);
        await thinkingMsg.edit({
            content: `❌ **Calculation Error**\n\n` +
                `An error occurred while calculating the price.\n\n` +
                `Please try another service or contact support.`,
        });
    }
}

// Helper function to find minigame service or method
function findMinigameItem(services: any[], searchTerm: string): {
    service: any;
    method: any | null;
    showAllMethods: boolean;
} | null {
    const normalized = searchTerm.toLowerCase().trim();

    logger.info(`[Minigames] 🔍 Searching for: "${searchTerm}"`);

    // Filter for minigame services (PER_ITEM pricing)
    // Note: We don't exclude any categories here - let the search find what matches
    const minigameServices = services.filter((s: any) => {
        const hasPerItemPricing = s.pricingMethods?.some((m: any) => m.pricingUnit === 'PER_ITEM');
        return hasPerItemPricing;
    });

    logger.info(`[Minigames] 📋 Found ${minigameServices.length} PER_ITEM services to search`);

    // Log first few service names for debugging
    minigameServices.slice(0, 5).forEach((s: any) => {
        logger.info(`[Minigames]   - "${s.name}" (${s.pricingMethods?.filter((m: any) => m.pricingUnit === 'PER_ITEM').length} methods)`);
    });

    // Priority 1: Exact match on METHOD name
    for (const service of minigameServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            (m.name.toLowerCase() === normalized || m.slug?.toLowerCase() === normalized)
        );

        if (method) {
            logger.info(`[Minigames] ✅ Exact method match: "${method.name}" in service "${service.name}"`);
            return {
                service,
                method,
                showAllMethods: false
            };
        }
    }

    // Priority 2: Exact match on SERVICE name
    const exactServiceMatch = minigameServices.find((s: any) =>
        s.name.toLowerCase() === normalized ||
        s.slug.toLowerCase() === normalized
    );

    if (exactServiceMatch) {
        logger.info(`[Minigames] ✅ Exact service match: "${exactServiceMatch.name}"`);
        return {
            service: exactServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

    // Priority 3: Partial match on METHOD name
    for (const service of minigameServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            m.name.toLowerCase().includes(normalized)
        );

        if (method) {
            logger.info(`[Minigames] ✅ Partial method match: "${method.name}" in service "${service.name}"`);
            return {
                service,
                method,
                showAllMethods: false
            };
        }
    }

    // Priority 4: Partial match on SERVICE name
    const partialServiceMatch = minigameServices.find((s: any) =>
        s.name.toLowerCase().includes(normalized) ||
        s.slug.toLowerCase().includes(normalized)
    );

    if (partialServiceMatch) {
        logger.info(`[Minigames] ✅ Partial service match: "${partialServiceMatch.name}"`);
        return {
            service: partialServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

    logger.warn(`[Minigames] ❌ No matches found for "${searchTerm}"`);
    return null;
}

// Batch minigame quote handler
async function handleBatchMinigameQuote(
    message: Message,
    apiService: ApiService,
    items: Array<{ name: string; quantity: number }>
) {
    logger.info(`[Minigames] Batch quote: ${items.length} items by ${message.author.tag}`);
    const thinkingMsg = await message.reply("🎮 Calculating batch Minigame quote...");

    try {
        const services = await apiService.getAllServicesWithPricing();
        const pricingService = new PricingCalculatorService();
        const paymentMethods = await apiService.getPaymentMethods();

        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }

        const defaultPaymentMethod = paymentMethods[0];

        const calculations: Array<{
            itemName: string;
            quantity: number;
            service: any;
            method: any;
            result: any;
        }> = [];

        let totalPrice = 0;

        for (const item of items) {
            const searchResult = findMinigameItem(services, item.name);
            if (!searchResult) {
                await thinkingMsg.edit({
                    content:
                        `❌ **Service Not Found**\n\n` +
                        `Could not find: **"${item.name}"**\n\n` +
                        `*Try a different name or use \`/services\` to see all available services.*`,
                });
                return;
            }

            const { service, method: specificMethod } = searchResult;
            const fullService = await apiService.getServiceWithPricing(service.id);

            // Get service modifiers
            const serviceModifierIds = (fullService.serviceModifiers || [])
                .filter((m: any) => m.active)
                .map((m: any) => m.id);

            // Determine which method to use
            let method = specificMethod;
            if (!method) {
                // Use cheapest method if service search
                const allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');
                let cheapestMethod = allMethods[0];
                let cheapestPrice = Infinity;

                for (const m of allMethods) {
                    const result = await pricingService.calculatePrice({
                        methodId: m.id,
                        paymentMethodId: defaultPaymentMethod.id,
                        quantity: item.quantity,
                        serviceModifierIds,
                    });
                    if (result.finalPrice < cheapestPrice) {
                        cheapestPrice = result.finalPrice;
                        cheapestMethod = m;
                    }
                }
                method = cheapestMethod;
            }

            const result = await pricingService.calculatePrice({
                methodId: method.id,
                paymentMethodId: defaultPaymentMethod.id,
                quantity: item.quantity,
                serviceModifierIds,
            });

            calculations.push({
                itemName: item.name,
                quantity: item.quantity,
                service,
                method,
                result,
            });

            totalPrice += result.finalPrice;
        }

        // Build batch quote embed
        const embed = new EmbedBuilder()
            .setTitle(`🎮 Minigame Batch Quote`)
            .setColor(0xfca311)
            .setTimestamp();

        let itemsList = `\`\`\`yml\n`;
        for (let i = 0; i < calculations.length; i++) {
            const calc = calculations[i];
            itemsList += `${i + 1}. ${calc.method.name}\n`;
            itemsList += `   Quantity:    ${calc.quantity.toLocaleString()} items\n`;
            itemsList += `   Price:       $${calc.result.finalPrice.toFixed(2)}\n`;
            if (i < calculations.length - 1) {
                itemsList += `\n`;
            }
        }
        itemsList += `\`\`\``;

        embed.addFields({
            name: "🎮 Minigames",
            value: itemsList,
            inline: false,
        });

        let totalDisplay = `\`\`\`yml\n`;
        totalDisplay += `Items:          ${calculations.length}\n`;
        totalDisplay += `─────────────────────────────────────────\n`;
        totalDisplay += `\`\`\``;
        totalDisplay += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${totalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

        embed.addFields({
            name: "💰 Total",
            value: totalDisplay,
            inline: false,
        });

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[Minigames] ✅ Batch quote sent: ${calculations.length} items, total $${totalPrice.toFixed(2)}`);
    } catch (error) {
        logger.error('[Minigames] Batch quote error:', error);
        await thinkingMsg.edit({
            content: `❌ **Calculation Error**\n\nAn error occurred while calculating the batch quote.`,
        });
    }
}

// Handler for !m command (Minigames - PER_ITEM pricing)
async function handleMinigamesCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const input = message.content.slice(prefix.length + 2).trim();

    if (!input) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Single Minigame:** `!m <game-name> <quantity>`\n" +
                "**Multiple Minigames:** `!m <game1> <qty1>, <game2> <qty2>`\n" +
                "**Examples:**\n" +
                "• `!m barrows 100`\n" +
                "• `!m toa 50, barrows 100`\n" +
                "• `!m corrupted gauntlet 25`",
        });
        return;
    }

    // Parse multiple items (comma-separated)
    const items: Array<{ name: string; quantity: number }> = [];

    if (input.includes(',')) {
        // Comma-separated format: "game1 qty1, game2 qty2"
        const parts = input.split(',').map(s => s.trim());

        for (const part of parts) {
            const tokens = part.split(/\s+/);
            if (tokens.length < 2) {
                await message.reply({
                    content: `❌ **Invalid Format**\n\nEach minigame needs a name and quantity.\n**Example:** \`barrows 100, toa 50\``,
                });
                return;
            }

            const qty = parseInt(tokens[tokens.length - 1]);
            if (isNaN(qty) || qty < 1) {
                await message.reply({
                    content: `❌ **Invalid Quantity**\n\nQuantity must be a positive number in: \`${part}\``,
                });
                return;
            }

            const itemName = tokens.slice(0, -1).join(" ").toLowerCase();
            items.push({ name: itemName, quantity: qty });
        }
    } else {
        // Single item format: "game name quantity"
        const args = input.split(/\s+/);

        if (args.length < 2) {
            await message.reply({
                content: "❌ **Invalid Command Format**\n\n" +
                    "**Usage:** `!m <game-name> <quantity>`\n" +
                    "**Example:** `!m barrows 100`",
            });
            return;
        }

        const quantity = parseInt(args[args.length - 1]);
        if (isNaN(quantity) || quantity < 1) {
            await message.reply({
                content: "❌ **Invalid Quantity**\n\n" +
                    "Please specify a valid number.\n" +
                    "**Example:** `100`",
            });
            return;
        }

        const gameName = args.slice(0, -1).join(" ").toLowerCase();
        items.push({ name: gameName, quantity });
    }

    // Check if batch quote (multiple items)
    if (items.length > 1) {
        await handleBatchMinigameQuote(message, apiService, items);
        return;
    }

    // Single item - continue with show all methods or specific method logic
    const gameName = items[0].name;
    const quantity = items[0].quantity;

    logger.info(`[Minigames] Command: !m ${gameName} ${quantity} by ${message.author.tag}`);

    // Send "calculating..." message
    const thinkingMsg = await message.reply("🎮 Calculating Minigame service price...");

    // Get all services
    const services = await apiService.getAllServicesWithPricing();

    // Find minigame item (service or method)
    const searchResult = findMinigameItem(services, gameName);

    if (!searchResult) {
        await thinkingMsg.edit({
            content:
                `❌ **Service Not Found**\n\n` +
                `Could not find: **"${gameName}"**\n\n` +
                `*Try a different name or use \`/services\` to see all available services.*`,
        });
        return;
    }

    const { service, method: specificMethod, showAllMethods } = searchResult;

    try {
        logger.info(`[Minigames] Calculating with serviceId: ${service.id}, quantity: ${quantity}, showAllMethods: ${showAllMethods}`);

        // Fetch full service details with pricing methods
        const fullService = await apiService.getServiceWithPricing(service.id);

        const pricingService = new PricingCalculatorService();

        // Get payment methods
        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }
        const defaultPaymentMethod = paymentMethods[0];

        // Get all active service modifier IDs
        const serviceModifierIds = (fullService.serviceModifiers || [])
            .filter((m: any) => m.active)
            .map((m: any) => m.id);

        logger.info(`[Minigames] Applying ${serviceModifierIds.length} service-level modifiers`);

        if (!fullService.pricingMethods || fullService.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        // CASE A: Show all methods (when service name is used)
        if (showAllMethods) {
            logger.info('[Minigames] 📋 Showing all methods for service');

            // Get all PER_ITEM methods
            const allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');

            if (allMethods.length === 0) {
                throw new Error('No PER_ITEM pricing methods found for this service');
            }

            // Calculate price for each method
            const methodResults = [];
            for (const method of allMethods) {
                const result = await pricingService.calculatePrice({
                    methodId: method.id,
                    paymentMethodId: defaultPaymentMethod.id,
                    quantity: quantity,
                    serviceModifierIds,
                });

                methodResults.push({
                    method,
                    result,
                });
            }

            // Sort by price (cheapest first)
            methodResults.sort((a, b) => a.result.finalPrice - b.result.finalPrice);

            // Build embed showing all methods
            const embed = new EmbedBuilder()
                .setTitle(`${service.emoji || '🎮'} ${service.name}`)
                .setColor(0xfca311)
                .setTimestamp();

            embed.addFields({
                name: "🎮 Quantity",
                value: `\`\`\`ansi\n\u001b[36m${quantity.toLocaleString()} items\u001b[0m\n\`\`\``,
                inline: false,
            });

            // Show all pricing options
            const priceLines: string[] = [];
            for (let i = 0; i < methodResults.length; i++) {
                const { method, result } = methodResults[i];
                const indicator = i === 0 ? "✅" : "◻️"; // Cheapest first
                priceLines.push(`${indicator} **${method.name}**`);
                priceLines.push(`   💰 \`$${result.finalPrice.toFixed(2)}\``);
                priceLines.push('');
            }
            priceLines.pop(); // Remove last empty line

            embed.addFields({
                name: "💵 Pricing Options",
                value: priceLines.join('\n'),
                inline: false,
            });

            // Show breakdown for cheapest option
            const cheapest = methodResults[0];
            const appliedModifiers = cheapest.result.modifiers.filter((m: any) => m.applied);

            let breakdown = `\`\`\`yml\n`;
            breakdown += `Method:         ${cheapest.method.name}\n`;
            breakdown += `─────────────────────────────────────────\n`;
            breakdown += `Quantity:       ${quantity.toLocaleString()} items\n`;
            breakdown += `Rate:           $${cheapest.method.basePrice.toFixed(6)}/item\n`;
            breakdown += `─────────────────────────────────────────\n`;
            breakdown += `Base Cost:      $${cheapest.result.basePrice.toFixed(2)}\n`;

            if (appliedModifiers.length > 0) {
                for (const mod of appliedModifiers) {
                    const icon = Number(mod.value) > 0 ? '⚠️  ' : Number(mod.value) < 0 ? '✅ ' : '';
                    const displayName = `${icon}${mod.name}`;
                    const modValue = mod.type === 'PERCENTAGE'
                        ? `${mod.value}%`
                        : `$${mod.value.toFixed(2)}`;
                    breakdown += `${displayName}:`.padEnd(20) + `${modValue}\n`;
                }
                breakdown += `─────────────────────────────────────────\n`;
            }

            breakdown += `\`\`\``;
            breakdown += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${cheapest.result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

            embed.addFields({
                name: "✅ Recommended Option — Full Breakdown",
                value: breakdown,
                inline: false,
            });

            await thinkingMsg.edit({
                content: "",
                embeds: [embed.toJSON() as any],
            });

            logger.info(`[Minigames] ✅ Sent all methods for ${service.name} to ${message.author.tag}`);
        }
        // CASE B: Show specific method (when method name is used)
        else {
            logger.info(`[Minigames] 🎯 Showing specific method: ${specificMethod.name}`);

            const method = specificMethod;

            // Calculate price
            const result = await pricingService.calculatePrice({
                methodId: method.id,
                paymentMethodId: defaultPaymentMethod.id,
                quantity: quantity,
                serviceModifierIds,
            });

            const embed = new EmbedBuilder()
                .setTitle(`${service.emoji || '🎮'} ${service.name}`)
                .setColor(0xfca311)
                .setTimestamp();

            // Build clean price calculation display
            let priceCalc = `\`\`\`yml\n`;
            priceCalc += `Method:         ${method.name}\n`;
            priceCalc += `─────────────────────────────────────────\n`;
            priceCalc += `Quantity:       ${quantity.toLocaleString()} items\n`;
            priceCalc += `Rate:           $${method.basePrice.toFixed(6)}/item\n`;
            priceCalc += `─────────────────────────────────────────\n`;
            priceCalc += `Base Cost:      $${result.basePrice.toFixed(2)}\n`;

            // Add modifiers
            const appliedModifiers = result.modifiers.filter((m: any) => m.applied);
            if (appliedModifiers.length > 0) {
                for (const mod of appliedModifiers) {
                    const icon = Number(mod.value) > 0 ? '⚠️  ' : Number(mod.value) < 0 ? '✅ ' : '';
                    const displayName = `${icon}${mod.name}`;
                    const modValue = mod.type === 'PERCENTAGE'
                        ? `${mod.value}%`
                        : `$${mod.value.toFixed(2)}`;
                    priceCalc += `${displayName}:`.padEnd(20) + `${modValue}\n`;
                }
                priceCalc += `─────────────────────────────────────────\n`;
            }

            priceCalc += `\`\`\``;

            // Add final price in ANSI color
            priceCalc += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

            embed.addFields({
                name: "💰 Price Breakdown",
                value: priceCalc,
                inline: false,
            });

            await thinkingMsg.edit({
                content: "",
                embeds: [embed.toJSON() as any],
            });

            logger.info(`[Minigames] ✅ Sent specific method price for ${service.name} to ${message.author.tag}`);
        }
    } catch (error) {
        logger.error('[Minigames] Error handling minigame command:', error);
        await thinkingMsg.edit({
            content: `❌ **Calculation Error**\n\n` +
                `An error occurred while calculating the price.\n\n` +
                `Please try another service or contact support.`,
        });
    }
}

/**
 * Find Ironman item by service name or method name
 * Returns: { service, method?, showAllMethods }
 */
function findIronmanItem(services: any[], searchTerm: string): any | null {
    const normalized = searchTerm.toLowerCase().trim();

    // Filter to only Ironman Gathering services
    const ironmanServices = services.filter((s: any) =>
        s.category?.slug === 'ironman-gathering' ||
        s.category?.name?.toLowerCase().includes('ironman')
    );

    logger.info(`[Ironman] Searching for: "${normalized}" in ${ironmanServices.length} Ironman services`);

    // Priority 1: Exact match on METHOD name
    for (const service of ironmanServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            m.name.toLowerCase() === normalized
        );

        if (method) {
            logger.info(`[Ironman] ✅ Exact method match: "${method.name}" in service "${service.name}"`);
            return {
                service,
                method,
                showAllMethods: false
            };
        }
    }

    // Priority 2: Exact match on SERVICE name
    const exactServiceMatch = ironmanServices.find((s: any) =>
        s.name.toLowerCase() === normalized ||
        s.slug.toLowerCase() === normalized
    );

    if (exactServiceMatch) {
        logger.info(`[Ironman] ✅ Exact service match: "${exactServiceMatch.name}"`);
        return {
            service: exactServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

    // Priority 3: Partial match on METHOD name
    for (const service of ironmanServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            m.name.toLowerCase().includes(normalized)
        );

        if (method) {
            logger.info(`[Ironman] ✅ Partial method match: "${method.name}" in service "${service.name}"`);
            return {
                service,
                method,
                showAllMethods: false
            };
        }
    }

    // Priority 4: Partial match on SERVICE name
    const partialServiceMatch = ironmanServices.find((s: any) =>
        s.name.toLowerCase().includes(normalized) ||
        s.slug.toLowerCase().includes(normalized)
    );

    if (partialServiceMatch) {
        logger.info(`[Ironman] ✅ Partial service match: "${partialServiceMatch.name}"`);
        return {
            service: partialServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

    logger.warn(`[Ironman] ❌ No match found for: "${searchTerm}"`);
    return null;
}

// Handler for batch Ironman quote (multiple items)
async function handleBatchIronmanQuote(
    message: Message,
    apiService: ApiService,
    items: Array<{ name: string; quantity: number }>
) {
    logger.info(`[Ironman] Batch quote: ${items.length} items by ${message.author.tag}`);

    const thinkingMsg = await message.reply("🔗 Calculating batch Ironman quote...");

    try {
        const services = await apiService.getAllServicesWithPricing();
        const pricingService = new PricingCalculatorService();
        const paymentMethods = await apiService.getPaymentMethods();

        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }
        const defaultPaymentMethod = paymentMethods[0];

        // Calculate price for each item
        const calculations: Array<{
            itemName: string;
            quantity: number;
            service: any;
            method: any;
            result: any;
        }> = [];

        let totalPrice = 0;

        for (const item of items) {
            const searchResult = findIronmanItem(services, item.name);

            if (!searchResult) {
                await thinkingMsg.edit({
                    content: `❌ **Item Not Found**\n\nCould not find: "${item.name}"\n\nPlease check the item name and try again.`,
                });
                return;
            }

            const { service, method: specificMethod } = searchResult;

            // Get full service details
            const fullService = await apiService.getServiceWithPricing(service.id);

            // Get all active service modifier IDs to apply them automatically
            const serviceModifierIds = (fullService.serviceModifiers || [])
                .filter((m: any) => m.active)
                .map((m: any) => m.id);

            // Determine which method to use
            let method = specificMethod;
            if (!method) {
                // If service search, use cheapest method
                const allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');
                if (allMethods.length === 0) continue;

                // Calculate prices for all methods and find cheapest
                let cheapestMethod = allMethods[0];
                let cheapestPrice = Infinity;

                for (const m of allMethods) {
                    const result = await pricingService.calculatePrice({
                        methodId: m.id,
                        paymentMethodId: defaultPaymentMethod.id,
                        quantity: item.quantity,
                        serviceModifierIds, // ✅ Pass service modifier IDs
                    });
                    if (result.finalPrice < cheapestPrice) {
                        cheapestPrice = result.finalPrice;
                        cheapestMethod = m;
                    }
                }
                method = cheapestMethod;
            }

            // Calculate final price
            const result = await pricingService.calculatePrice({
                methodId: method.id,
                paymentMethodId: defaultPaymentMethod.id,
                quantity: item.quantity,
                serviceModifierIds, // ✅ Pass service modifier IDs
            });

            calculations.push({
                itemName: item.name,
                quantity: item.quantity,
                service,
                method,
                result,
            });

            totalPrice += result.finalPrice;
        }

        // Build batch quote embed
        const embed = new EmbedBuilder()
            .setTitle(`🔗 Ironman Batch Quote`)
            .setColor(0xfca311)
            .setTimestamp();

        // Build items list
        let itemsList = `\`\`\`yml\n`;
        for (let i = 0; i < calculations.length; i++) {
            const calc = calculations[i];
            itemsList += `${i + 1}. ${calc.method.name}\n`;
            itemsList += `   Quantity:    ${calc.quantity.toLocaleString()} items\n`;
            itemsList += `   Price:       $${calc.result.finalPrice.toFixed(2)}\n`;
            if (i < calculations.length - 1) {
                itemsList += `\n`;
            }
        }
        itemsList += `\`\`\``;

        embed.addFields({
            name: "📦 Items",
            value: itemsList,
            inline: false,
        });

        // Build total price display
        let totalDisplay = `\`\`\`yml\n`;
        totalDisplay += `Items:          ${calculations.length}\n`;
        totalDisplay += `─────────────────────────────────────────\n`;
        totalDisplay += `\`\`\``;
        totalDisplay += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${totalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

        embed.addFields({
            name: "💰 Total",
            value: totalDisplay,
            inline: false,
        });

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[Ironman] ✅ Batch quote sent: ${calculations.length} items, total $${totalPrice.toFixed(2)}`);
    } catch (error) {
        logger.error('[Ironman] Batch quote error:', error);
        await thinkingMsg.edit({
            content: `❌ **Calculation Error**\n\nAn error occurred while calculating the batch quote.`,
        });
    }
}

// Handler for !i command (Ironman Gathering - PER_ITEM pricing, filtered by category)
async function handleIronmanCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const input = message.content.slice(prefix.length + 2).trim();

    if (!input) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Single Item:** `!i <item-name> <quantity>`\n" +
                "**Multiple Items:** `!i <item1> <qty1>, <item2> <qty2>`\n" +
                "**Example:** `!i blue dragon scales 1000, snape grass 500`",
        });
        return;
    }

    // Parse multiple items (comma-separated)
    const items: Array<{ name: string; quantity: number }> = [];

    if (input.includes(',')) {
        // Comma-separated format: "item1 qty1, item2 qty2, item3 qty3"
        const parts = input.split(',').map(s => s.trim());

        for (const part of parts) {
            const tokens = part.split(/\s+/);
            if (tokens.length < 2) {
                await message.reply({
                    content: `❌ **Invalid Format**\n\nEach item needs a name and quantity.\n**Example:** \`blue dragon scales 1000\``,
                });
                return;
            }

            const qty = parseInt(tokens[tokens.length - 1]);
            if (isNaN(qty) || qty < 1) {
                await message.reply({
                    content: `❌ **Invalid Quantity**\n\nQuantity must be a positive number in: \`${part}\``,
                });
                return;
            }

            const itemName = tokens.slice(0, -1).join(" ").toLowerCase();
            items.push({ name: itemName, quantity: qty });
        }
    } else {
        // Single item format: "item name quantity"
        const args = input.split(/\s+/);

        if (args.length < 2) {
            await message.reply({
                content: "❌ **Invalid Command Format**\n\n" +
                    "**Usage:** `!i <item-name> <quantity>`\n" +
                    "**Example:** `!i amethyst 1000`",
            });
            return;
        }

        const quantity = parseInt(args[args.length - 1]);
        if (isNaN(quantity) || quantity < 1) {
            await message.reply({
                content: "❌ **Invalid Quantity**\n\n" +
                    "Please specify a valid number.\n" +
                    "**Example:** `1000`",
            });
            return;
        }

        const serviceName = args.slice(0, -1).join(" ").toLowerCase();
        items.push({ name: serviceName, quantity });
    }

    // Check if batch quote (multiple items)
    if (items.length > 1) {
        await handleBatchIronmanQuote(message, apiService, items);
        return;
    }

    // Single item - use existing logic
    const serviceName = items[0].name;
    const quantity = items[0].quantity;

    logger.info(`[Ironman] Command: !i ${serviceName} ${quantity} by ${message.author.tag}`);

    // Send "calculating..." message
    const thinkingMsg = await message.reply("🔗 Calculating Ironman service price...");

    // Get all services to find matching service
    const services = await apiService.getAllServicesWithPricing();

    // Find Ironman item (service or method)
    const searchResult = findIronmanItem(services, serviceName);

    if (!searchResult) {
        await thinkingMsg.edit({
            content: `❌ **Ironman Service Not Found**\n\n` +
                `Could not find an Ironman gathering service matching "${serviceName}".\n\n` +
                `Available services: amethyst, ores-bars, charter-ship, chinchompas, farm-runs, raw-fish, herblore-secondaries, impling, logs-planks`,
        });
        return;
    }

    const { service, method: specificMethod, showAllMethods } = searchResult;

    try {
        logger.info(`[Ironman] Calculating with serviceId: ${service.id}, quantity: ${quantity}, showAllMethods: ${showAllMethods}`);

        // Fetch full service details with pricing methods
        const fullService = await apiService.getServiceWithPricing(service.id);

        const pricingService = new PricingCalculatorService();

        // Get payment methods to get the default one
        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }
        const defaultPaymentMethod = paymentMethods[0];

        // Get all active service modifier IDs to apply them automatically
        const serviceModifierIds = (fullService.serviceModifiers || [])
            .filter((m: any) => m.active)
            .map((m: any) => m.id);

        logger.info(`[Ironman] Applying ${serviceModifierIds.length} service-level modifiers`);

        if (!fullService.pricingMethods || fullService.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        // CASE A: Show all methods (when service name is used)
        if (showAllMethods) {
            logger.info('[Ironman] 📋 Showing all methods for service');

            // Get all PER_ITEM methods
            const allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');

            if (allMethods.length === 0) {
                throw new Error('NO PER_ITEM pricing methods found for this service');
            }

            // Calculate price for each method
            const methodResults = [];
            for (const method of allMethods) {
                const result = await pricingService.calculatePrice({
                    methodId: method.id,
                    paymentMethodId: defaultPaymentMethod.id,
                    quantity: quantity,
                    serviceModifierIds, // ✅ Pass service modifier IDs
                });

                methodResults.push({
                    method,
                    result,
                });
            }

            // Sort by price (cheapest first)
            methodResults.sort((a, b) => a.result.finalPrice - b.result.finalPrice);

            // Build embed showing all methods
            const embed = new EmbedBuilder()
                .setTitle(`${service.emoji || '🔗'} ${service.name}`)
                .setColor(0xfca311) // Orange color
                .setTimestamp();

            embed.addFields({
                name: "🔗 Ironman Gathering",
                value: `\`\`\`ansi\n\u001b[36m${quantity} items\u001b[0m\n\`\`\``,
                inline: false,
            });

            // Build pricing options display
            const priceLines: string[] = [];

            for (let i = 0; i < methodResults.length; i++) {
                const { method, result } = methodResults[i];
                const indicator = i === 0 ? "✅" : "◻️"; // First is cheapest
                const price = result.finalPrice.toFixed(2);
                const rate = method.basePrice.toFixed(6);

                logger.info(`[Ironman] 💰 ${method.name}: $${price} (${rate}/item)`);

                // Compact display with rate
                priceLines.push(`${indicator} **${method.name}**`);
                priceLines.push(`   💰 \`$${price}\` • Rate: \`$${rate}/item\``);
                priceLines.push(''); // Spacing
            }

            // Remove last empty line
            if (priceLines.length > 0) {
                priceLines.pop();
            }

            embed.addFields({
                name: "💵 Pricing Options",
                value: priceLines.join('\n'),
                inline: false,
            });

            // Show breakdown for cheapest method
            const cheapest = methodResults[0];
            let breakdown = `\`\`\`yml\n`;
            breakdown += `Service:        ${service.name}\n`;
            breakdown += `─────────────────────────────────────────\n`;
            breakdown += `Quantity:       ${quantity} items\n`;
            breakdown += `Method:         ${cheapest.method.name}\n`;
            breakdown += `Rate:           $${cheapest.method.basePrice.toFixed(6)}/item\n`;
            breakdown += `─────────────────────────────────────────\n`;
            breakdown += `Base Cost:      $${cheapest.result.basePrice.toFixed(2)}\n`;

            // Show modifiers
            const appliedModifiers = cheapest.result.modifiers.filter((m: any) => m.applied);
            if (appliedModifiers.length > 0) {
                for (const mod of appliedModifiers) {
                    const modValue = mod.type === 'PERCENTAGE'
                        ? `${mod.value}%`
                        : (mod.value < 0 ? `-$${Math.abs(mod.value).toFixed(2)}` : `+$${mod.value.toFixed(2)}`);
                    breakdown += `${mod.name}:`.padEnd(16) + `${modValue}\n`;
                }
                breakdown += `─────────────────────────────────────────\n`;
            }

            breakdown += `\`\`\``;
            breakdown += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${cheapest.result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

            embed.addFields({
                name: "✅ Recommended Option — Full Breakdown",
                value: breakdown,
                inline: false,
            });

            await thinkingMsg.edit({
                content: "",
                embeds: [embed.toJSON() as any],
            });

            logger.info(`[Ironman] ✅ Sent all methods for ${service.name} to ${message.author.tag}`);
        }
        // CASE B: Show specific method (when method name is used)
        else {
            logger.info(`[Ironman] 🎯 Showing specific method: ${specificMethod.name}`);

            const method = specificMethod;

            // Calculate price
            const result = await pricingService.calculatePrice({
                methodId: method.id,
                paymentMethodId: defaultPaymentMethod.id,
                quantity: quantity,
                serviceModifierIds, // ✅ Pass service modifier IDs
            });

            const embed = new EmbedBuilder()
                .setTitle(`${service.emoji || '🔗'} ${service.name}`)
                .setColor(0xfca311) // Orange color
                .setTimestamp();

            // Build clean price calculation display
            let priceCalc = `\`\`\`yml\n`;
            priceCalc += `Method:         ${method.name}\n`;
            priceCalc += `─────────────────────────────────────────\n`;
            priceCalc += `Quantity:       ${quantity.toLocaleString()} items\n`;
            priceCalc += `Rate:           $${method.basePrice.toFixed(6)}/item\n`;
            priceCalc += `─────────────────────────────────────────\n`;
            priceCalc += `Base Cost:      $${result.basePrice.toFixed(2)}\n`;

            // Add modifiers
            const appliedModifiers = result.modifiers.filter((m: any) => m.applied);
            if (appliedModifiers.length > 0) {
                for (const mod of appliedModifiers) {
                    const modValue = mod.type === 'PERCENTAGE'
                        ? `${mod.value}%`
                        : (mod.value < 0 ? `-$${Math.abs(mod.value).toFixed(2)}` : `+$${mod.value.toFixed(2)}`);
                    // Determine icon based on modifier value (positive = upcharge, negative = discount)
                    const icon = Number(mod.value) > 0 ? '⚠️  ' : Number(mod.value) < 0 ? '✅ ' : '';
                    const displayName = `${icon}${mod.name}`;
                    priceCalc += `${displayName}:`.padEnd(16) + `${modValue}\n`;
                }
                priceCalc += `─────────────────────────────────────────\n`;
            }

            priceCalc += `\`\`\``;

            // Add final price in ANSI color
            priceCalc += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

            embed.addFields({
                name: "💰 Price Calculation",
                value: priceCalc,
                inline: false,
            });

            // Add requirements note if available
            if (method.description) {
                embed.addFields({
                    name: "📋 Requirements",
                    value: `\`\`\`${method.description}\`\`\``,
                    inline: false,
                });
            }

            await thinkingMsg.edit({
                content: "",
                embeds: [embed.toJSON() as any],
            });

            logger.info(`[Ironman] ✅ Result sent for ${method.name} (${quantity} items) to ${message.author.tag}`);
        }
    } catch (apiError) {
        logger.error('[Ironman] API error:', apiError);
        await thinkingMsg.edit({
            content: `❌ **Calculation Error**\n\n` +
                `An error occurred while calculating the price.\n\n` +
                `Please try another service or contact support.`,
        });
    }
}

// Handler for !q command (Quote - FIXED pricing with batch support)
async function handleQuoteCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const input = message.content.slice(prefix.length + 2).trim();

    if (!input) {
        await message.reply({
            content: "❌ **Invalid Command Format**\n\n" +
                "**Single Quest:** `!q desert treasure 1`\n" +
                "**Multiple Quests:** `!q desert treasure 1, monkey madness, infernal cape`",
        });
        return;
    }

    // Check if this is a batch request (contains commas)
    const isBatchRequest = input.includes(',');
    const questNames = isBatchRequest
        ? input.split(',').map(q => q.trim().toLowerCase())
        : [input.toLowerCase()];

    logger.info(`[Quest] Command: !q ${input} by ${message.author.tag} (${questNames.length} quests)`);

    // Send "fetching..." message
    const thinkingMsg = await message.reply(
        isBatchRequest
            ? `💰 Fetching quotes for ${questNames.length} quests...`
            : "💰 Fetching price quote..."
    );

    // Get all services
    const services = await apiService.getAllServicesWithPricing();

    // Find all matching quests
    const results: Array<{
        questName: string;
        service: any;
        price: number;
        upcharges: Array<{ method: string; price: number; difference: number }>;
    }> = [];

    const notFound: string[] = [];

    for (const questName of questNames) {
        // Find service with improved matching
        let service = findBestQuestMatch(services, questName);

        if (!service) {
            notFound.push(questName);
            continue;
        }

        // Fetch full service with modifiers
        const fullService = await apiService.getServiceWithPricing(service.id);
        service = fullService;

        try {
            // Get all FIXED pricing methods
            const fixedMethods = service.pricingMethods?.filter((m: any) => m.pricingUnit === 'FIXED') || [];

            if (fixedMethods.length === 0) {
                notFound.push(questName);
                continue;
            }

            // Get payment methods
            const paymentMethods = await apiService.getPaymentMethods();
            if (!paymentMethods || paymentMethods.length === 0) {
                throw new Error('No payment methods available');
            }
            const defaultPaymentMethod = paymentMethods[0];

            // Get all active service modifier IDs to apply them automatically
            const serviceModifierIds = (service.serviceModifiers || [])
                .filter((m: any) => m.active)
                .map((m: any) => m.id);

            logger.info(`[Quote] Applying ${serviceModifierIds.length} service-level modifiers for ${service.name}`);

            const pricingService = new PricingCalculatorService();

            // Calculate prices for all methods
            const methodPrices = await Promise.all(
                fixedMethods.map(async (method: any) => {
                    const result = await pricingService.calculatePrice({
                        methodId: method.id,
                        paymentMethodId: defaultPaymentMethod.id,
                        quantity: 1,
                        serviceModifierIds, // ✅ Pass service modifier IDs
                    });
                    return {
                        method: method.name,
                        price: result.finalPrice,
                        basePrice: result.basePrice,
                    };
                })
            );

            // Find cheapest price
            const cheapest = methodPrices.reduce((min, curr) =>
                curr.price < min.price ? curr : min
            );

            // Build upcharges list (other payment methods)
            const upcharges = methodPrices
                .filter(m => m.method !== cheapest.method)
                .map(m => ({
                    method: m.method,
                    price: m.price,
                    difference: m.price - cheapest.price,
                }));

            results.push({
                questName: service.name,
                service,
                price: cheapest.price,
                upcharges,
            });

        } catch (error) {
            logger.error(`[Quest] Error calculating price for ${questName}:`, error);
            notFound.push(questName);
        }
    }

    // Handle no results
    if (results.length === 0) {
        await thinkingMsg.edit({
            content: `❌ **No Quests Found**\n\n` +
                `Could not find any quests matching your search.\n\n` +
                `**Searched for:** ${questNames.join(', ')}`,
        });
        return;
    }

    // Build response based on single or batch
    if (isBatchRequest) {
        await sendBatchQuoteResponse(thinkingMsg, results, notFound);
    } else {
        await sendSingleQuoteResponse(thinkingMsg, results[0], notFound);
    }

    logger.info(`[Quest] Quote sent for ${results.length} quests to ${message.author.tag}`);
}

/**
 * Find best matching quest service with improved logic
 * Searches both service names AND pricing method names
 */
function findBestQuestMatch(services: any[], searchName: string): any | null {
    // Normalize search name (handle Roman numerals)
    const normalized = normalizeQuestName(searchName);

    // Filter FIXED pricing services only
    const fixedServices = services.filter((s: any) =>
        s.pricingMethods?.some((m: any) => m.pricingUnit === 'FIXED')
    );

    // Try exact match on SERVICE NAME first
    let match = fixedServices.find((s: any) =>
        normalizeQuestName(s.name) === normalized ||
        normalizeQuestName(s.slug) === normalized
    );

    if (match) {
        logger.info(`[Quest] ✅ Exact service match: "${match.name}"`);
        return match;
    }

    // Try exact match on PRICING METHOD NAMES (for quests like "Cook's Assistant")
    for (const service of fixedServices) {
        const methodMatch = service.pricingMethods?.find((m: any) =>
            m.pricingUnit === 'FIXED' &&
            normalizeQuestName(m.name) === normalized
        );

        if (methodMatch) {
            logger.info(`[Quest] ✅ Exact pricing method match: "${methodMatch.name}" in service "${service.name}"`);
            // Return a virtual service object for this specific quest
            return {
                ...service,
                name: methodMatch.name,
                pricingMethods: [methodMatch],
            };
        }
    }

    // Try partial match on service names (but prefer shorter names to avoid DT2 matching DT1)
    const partialMatches = fixedServices.filter((s: any) =>
        normalizeQuestName(s.name).includes(normalized) ||
        normalizeQuestName(s.slug).includes(normalized)
    );

    if (partialMatches.length === 1) {
        logger.info(`[Quest] ✅ Partial service match: "${partialMatches[0].name}"`);
        return partialMatches[0];
    }

    if (partialMatches.length > 1) {
        // Prefer shortest name (more specific)
        match = partialMatches.reduce((shortest, curr) =>
            curr.name.length < shortest.name.length ? curr : shortest
        );
        logger.info(`[Quest] ✅ Best partial service match: "${match.name}" (shortest of ${partialMatches.length})`);
        return match;
    }

    // Try partial match on pricing method names
    for (const service of fixedServices) {
        const methodMatches = service.pricingMethods?.filter((m: any) =>
            m.pricingUnit === 'FIXED' &&
            normalizeQuestName(m.name).includes(normalized)
        );

        if (methodMatches && methodMatches.length > 0) {
            // Use the first/shortest match
            const bestMethod = methodMatches.reduce((shortest: any, curr: any) =>
                curr.name.length < shortest.name.length ? curr : shortest
            );

            logger.info(`[Quest] ✅ Partial pricing method match: "${bestMethod.name}" in service "${service.name}"`);
            return {
                ...service,
                name: bestMethod.name,
                pricingMethods: [bestMethod],
            };
        }
    }

    logger.warn(`[Quest] ❌ No match found for: "${searchName}"`);
    return null;
}

/**
 * Normalize quest name (handle Roman numerals and formatting)
 * IMPORTANT: Preserves apostrophes for quest names like "Cook's Assistant"
 */
function normalizeQuestName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/\bi\b/g, '1')     // I → 1
        .replace(/\bii\b/g, '2')    // II → 2
        .replace(/\biii\b/g, '3')   // III → 3
        .replace(/\biv\b/g, '4')    // IV → 4
        .replace(/\bv\b/g, '5')     // V → 5
        .replace(/[^a-z0-9\s']/g, '') // Remove special chars BUT keep apostrophes
        .replace(/\s+/g, ' ')       // Normalize spaces
        .replace(/'+/g, "'");       // Normalize multiple apostrophes to single
}

/**
 * Send single quest quote response
 */
async function sendSingleQuoteResponse(
    message: any,
    result: { questName: string; service: any; price: number; upcharges: any[] },
    notFound: string[]
) {
    const embed = new EmbedBuilder()
        .setTitle(`${result.service.emoji || '⭐'} ${result.questName}`)
        .setDescription(result.service.description || 'Fixed price quest service')
        .setColor(0xfca311)
        .setTimestamp();

    // Show main price
    embed.addFields({
        name: "💰 Price",
        value: `\`\`\`ansi\n\u001b[1;32m$${result.price.toFixed(2)}\u001b[0m\n\`\`\``,
        inline: false,
    });

    // Show upcharges in notes if any
    if (result.upcharges.length > 0) {
        const upchargeLines = result.upcharges.map(u =>
            `• ${u.method}: $${u.price.toFixed(2)} (+$${u.difference.toFixed(2)})`
        );
        embed.addFields({
            name: "📝 Payment Method Upcharges",
            value: upchargeLines.join('\n'),
            inline: false,
        });
    }

    // Add general note
    embed.addFields({
        name: "ℹ️ Note",
        value: "Price shown is base cost. Additional upcharges may apply based on account requirements.\nContact support for personalized quote!",
        inline: false,
    });

    await message.edit({
        content: notFound.length > 0 ? `⚠️ Could not find: ${notFound.join(', ')}` : "",
        embeds: [embed.toJSON() as any],
    });
}

/**
 * Send batch quest quote response
 */
async function sendBatchQuoteResponse(
    message: any,
    results: Array<{ questName: string; service: any; price: number; upcharges: any[] }>,
    notFound: string[]
) {
    const embed = new EmbedBuilder()
        .setTitle("📋 Quest Bundle Quote")
        .setColor(0xfca311)
        .setTimestamp();

    // Build quest list
    const questList = results.map((r, i) =>
        `${i + 1}. ${r.service.emoji || '⭐'} **${r.questName}** → \`$${r.price.toFixed(2)}\``
    ).join('\n');

    embed.addFields({
        name: "Quests",
        value: questList,
        inline: false,
    });

    // Calculate total
    const total = results.reduce((sum, r) => sum + r.price, 0);

    embed.addFields({
        name: "💰 Total Price",
        value: `\`\`\`ansi\n\u001b[1;32m$${total.toFixed(2)}\u001b[0m\n\`\`\``,
        inline: false,
    });

    // Show upcharges if any quest has them
    const hasUpcharges = results.some(r => r.upcharges.length > 0);
    if (hasUpcharges) {
        embed.addFields({
            name: "📝 Note",
            value: "Prices shown are base costs. Payment method upcharges may apply.\nContact support for detailed breakdown!",
            inline: false,
        });
    }

    await message.edit({
        content: notFound.length > 0 ? `⚠️ Could not find: ${notFound.join(', ')}` : "",
        embeds: [embed.toJSON() as any],
    });
}
