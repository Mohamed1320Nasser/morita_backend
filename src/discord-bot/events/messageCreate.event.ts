import { Events, Message, EmbedBuilder } from "discord.js";
import logger from "../../common/loggers";
import { ApiService } from "../services/api.service";
import { discordConfig } from "../config/discord.config";
import PricingCalculatorService from "../../api/pricingCalculator/pricingCalculator.service";
import {
    sendEphemeralError,
    sendServiceNotFoundError,
    sendValidationError,
    sendInvalidParameterError,
    sendCalculationError,
    deleteThinkingMessage,
} from "../utils/messageHelpers";

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
        await sendValidationError(
            message,
            "!s <service> <start-level>-<end-level>\nExample: !s agility 70-99",
            "Missing service name or level range"
        );
        return;
    }

    // Parse service name (can have multiple words before level range)
    const lastArg = args[args.length - 1];
    const levelMatch = lastArg.match(/^(\d+)-(\d+)$/);

    if (!levelMatch) {
        await sendValidationError(
            message,
            "!s <service> <start-level>-<end-level>\nExample: !s agility 70-99",
            "Invalid level range format. Use format: 70-99"
        );
        return;
    }

    const startLevel = parseInt(levelMatch[1]);
    const endLevel = parseInt(levelMatch[2]);

    // Service name is everything except the last argument
    const serviceName = args.slice(0, -1).join(" ").toLowerCase();

    logger.info(`[PriceCalculator] Command: !s ${serviceName} ${startLevel}-${endLevel} by ${message.author.tag}`);

    // Validate levels
    if (startLevel < 1 || startLevel > 99 || endLevel < 1 || endLevel > 99) {
        await sendInvalidParameterError(
            message,
            "Level Range",
            `${startLevel}-${endLevel}`,
            "Levels must be between 1 and 99"
        );
        return;
    }

    if (startLevel >= endLevel) {
        await sendInvalidParameterError(
            message,
            "Level Range",
            `${startLevel}-${endLevel}`,
            "Start level must be less than end level"
        );
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

    // If still no service found, check if serviceName is a groupName
    let groupNameToUse: string | undefined = undefined;
    if (!service) {
        logger.info(`[PriceCalculator] 🔍 Service not found, checking if "${serviceName}" is a groupName`);

        // Search for methods with this groupName across all services
        for (const s of services) {
            const methodWithGroup = s.pricingMethods?.find((m: any) =>
                m.groupName && m.groupName.toLowerCase() === serviceName
            );

            if (methodWithGroup) {
                service = s;
                groupNameToUse = methodWithGroup.groupName;
                logger.info(`[PriceCalculator] ✅ Found groupName "${groupNameToUse}" in service "${service.name}"`);
                break;
            }
        }
    }

    if (!service) {
        await deleteThinkingMessage(thinkingMsg);
        await sendServiceNotFoundError(
            message,
            serviceName,
            "Skills",
            ["!s agility 70-99", "!s mining 50-99", "!s thieving 60-99"]
        );
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
            groupName: groupNameToUse, // Pass groupName if found
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
            // Build pricing display - group by method name (groupName)
            const priceLines: string[] = [];

            // Get only individual segments (not Optimal Combination)
            const individualSegments = data.methodOptions.filter((m: any) => {
                // Skip "Optimal Combination" and other combined methods
                return m.methodName.includes('(') && m.methodName.includes('-') && m.methodName.includes(')');
            });

            // Group segments by method name (extract base name before level range)
            const groupedMethods: { [key: string]: any[] } = {};

            for (const method of individualSegments) {
                // Extract base method name: "Barbarian Fishing (50-58)" -> "Barbarian Fishing"
                const baseNameMatch = method.methodName.match(/^(.+?)\s*\(\d+-\d+\)$/);
                const baseName = baseNameMatch ? baseNameMatch[1].trim() : method.methodName;

                if (!groupedMethods[baseName]) {
                    groupedMethods[baseName] = [];
                }
                groupedMethods[baseName].push(method);
            }

            // Display grouped methods (like MMOGoldHut style)
            for (const [groupName, methods] of Object.entries(groupedMethods)) {
                // Sort methods by start level
                methods.sort((a, b) => {
                    const aMatch = a.methodName.match(/\((\d+)-\d+\)/);
                    const bMatch = b.methodName.match(/\((\d+)-\d+\)/);
                    return (aMatch ? parseInt(aMatch[1]) : 0) - (bMatch ? parseInt(bMatch[1]) : 0);
                });

                // Calculate total price for this group
                const totalPrice = methods.reduce((sum, m) => sum + m.finalPrice, 0);

                // Add group header
                priceLines.push(`**${groupName}**`);

                // Add level ranges with price for each method in the group
                for (const method of methods) {
                    const levelMatch = method.methodName.match(/\((\d+-\d+)\)/);
                    const levelRange = levelMatch ? levelMatch[1] : '';
                    const price = method.finalPrice.toFixed(2);
                    priceLines.push(`  📊 [ ${levelRange} ] — $${price}`);
                }

                // Add total price for the group
                priceLines.push(`  💰 **Total: $${totalPrice.toFixed(2)}**`);
                priceLines.push(''); // Spacing between groups
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
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(
            message,
            apiError instanceof Error ? apiError.message : String(apiError)
        );
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
        await sendValidationError(
            message,
            "!p <boss-name> <kill-count>\nExample: !p cox 120 or !p cgp 50",
            "Missing boss name or kill count"
        );
        return;
    }

    // Last argument is kill count
    const killCountStr = args[args.length - 1];
    const killCount = parseInt(killCountStr);

    if (isNaN(killCount) || killCount < 1) {
        await sendInvalidParameterError(
            message,
            "Kill Count",
            killCountStr,
            "Must be a valid number greater than 0"
        );
        return;
    }

    // Validate kill count range
    if (killCount > 10000) {
        await sendInvalidParameterError(
            message,
            "Kill Count",
            killCount,
            "Must be between 1 and 10,000"
        );
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

    // If no service found, check if serviceName is a groupName
    let groupNameFilter: string | undefined = undefined;
    if (!service) {
        logger.info(`[PvM] 🔍 Service not found, checking if "${serviceName}" is a groupName`);

        // Debug: Log all groupNames to see what's available
        const allGroupNames: string[] = [];
        for (const s of services) {
            if (s.pricingMethods) {
                s.pricingMethods.forEach((m: any) => {
                    if (m.pricingUnit === 'PER_KILL' && m.groupName) {
                        allGroupNames.push(m.groupName);
                    }
                });
            }
        }
        logger.info(`[PvM] 🔍 Available groupNames: ${allGroupNames.slice(0, 20).join(', ')}...`);

        // Search for methods with this groupName across all services
        for (const s of services) {
            const methodWithGroup = s.pricingMethods?.find((m: any) =>
                m.pricingUnit === 'PER_KILL' &&
                m.groupName &&
                m.groupName.toLowerCase() === serviceName
            );

            if (methodWithGroup) {
                service = s;
                groupNameFilter = methodWithGroup.groupName;
                logger.info(`[PvM] ✅ Found groupName "${groupNameFilter}" in service "${service.name}"`);
                break;
            }
        }
    }

    // Fetch full service with modifiers (both service-level and method-level)
    if (service) {
        const fullService = await apiService.getServiceWithPricing(service.id);
        service = fullService;
    }

    if (!service) {
        logger.warn(`[PvM] ❌ No service found matching "${serviceName}" with PER_KILL pricing`);

        // Delete thinking message
        await deleteThinkingMessage(thinkingMsg);

        // Send ephemeral error
        await sendServiceNotFoundError(
            message,
            serviceName,
            "PvM",
            ["!p cox 120", "!p cgp 50", "!p zulrah 100", "!p tob 25"]
        );
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

        let allMethods = service.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_KILL');

        // Filter by groupName if specified
        if (groupNameFilter) {
            allMethods = allMethods.filter((m: any) => m.groupName === groupNameFilter);
            logger.info(`[PvM] 🎯 Filtered to ${allMethods.length} methods with groupName "${groupNameFilter}"`);
        }

        if (allMethods.length === 0) {
            throw new Error(groupNameFilter
                ? `No PER_KILL pricing methods found with groupName "${groupNameFilter}"`
                : 'No PER_KILL pricing method found for this service'
            );
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
            .setColor(0xfca311) // Orange color
            .setTimestamp();

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

        // Add footer
        embed.setFooter({
            text: `Morita Gaming Services`,
        });

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

        logger.info(`[PriceCalculator] Multi-tier result sent for ${service.name} (${killCount} kills) to ${message.author.tag}`);
    } catch (apiError) {
        logger.error('[PriceCalculator] API error:', apiError);

        // Delete thinking message
        await deleteThinkingMessage(thinkingMsg);

        // Send ephemeral error
        await sendCalculationError(
            message,
            apiError instanceof Error ? apiError.message : String(apiError)
        );
    }
}

// Helper function to find minigame service or method
function findMinigameItem(services: any[], searchTerm: string): {
    service: any;
    method: any | null;
    showAllMethods: boolean;
    groupName?: string;
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

    // Priority 2.5: Exact match on GROUP NAME
    for (const service of minigameServices) {
        if (!service.pricingMethods) continue;

        const methodsInGroup = service.pricingMethods.filter((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            m.groupName &&
            m.groupName.toLowerCase() === normalized
        );

        if (methodsInGroup.length > 0) {
            logger.info(`[Minigames] ✅ Exact groupName match: "${methodsInGroup[0].groupName}" in service "${service.name}" (${methodsInGroup.length} methods)`);
            return {
                service,
                method: null,
                showAllMethods: true,
                groupName: methodsInGroup[0].groupName
            };
        }
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
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(
            message,
            error instanceof Error ? error.message : String(error)
        );
    }
}

// Handler for !m command (Minigames - PER_ITEM pricing)
async function handleMinigamesCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const input = message.content.slice(prefix.length + 2).trim();

    if (!input) {
        await sendValidationError(
            message,
            "!m <game-name> <quantity>\nExample: !m barrows 100\nMultiple: !m toa 50, barrows 100",
            "Missing minigame name or quantity"
        );
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
                await sendValidationError(
                    message,
                    "!m <game1> <qty1>, <game2> <qty2>\nExample: barrows 100, toa 50",
                    "Each minigame needs a name and quantity"
                );
                return;
            }

            const qty = parseInt(tokens[tokens.length - 1]);
            if (isNaN(qty) || qty < 1) {
                await sendInvalidParameterError(
                    message,
                    "Quantity",
                    tokens[tokens.length - 1],
                    `Must be a positive number in: ${part}`
                );
                return;
            }

            const itemName = tokens.slice(0, -1).join(" ").toLowerCase();
            items.push({ name: itemName, quantity: qty });
        }
    } else {
        // Single item format: "game name quantity"
        const args = input.split(/\s+/);

        if (args.length < 2) {
            await sendValidationError(
                message,
                "!m <game-name> <quantity>\nExample: !m barrows 100",
                "Missing minigame name or quantity"
            );
            return;
        }

        const quantity = parseInt(args[args.length - 1]);
        if (isNaN(quantity) || quantity < 1) {
            await sendInvalidParameterError(
                message,
                "Quantity",
                args[args.length - 1],
                "Must be a positive number"
            );
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
        await deleteThinkingMessage(thinkingMsg);
        await sendServiceNotFoundError(
            message,
            gameName,
            "Minigames",
            ["!m lms 100", "!m ba 50", "!m pc 200", "!m cw 75"]
        );
        return;
    }

    const { service, method: specificMethod, showAllMethods, groupName } = searchResult;

    try {
        logger.info(`[Minigames] Calculating with serviceId: ${service.id}, quantity: ${quantity}, showAllMethods: ${showAllMethods}, groupName: ${groupName || 'none'}`);

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

        // CASE A: Show all methods (when service name or groupName is used)
        if (showAllMethods) {
            logger.info('[Minigames] 📋 Showing all methods for service');

            // Get all PER_ITEM methods
            let allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');

            // Filter by groupName if specified
            if (groupName) {
                allMethods = allMethods.filter((m: any) => m.groupName === groupName);
                logger.info(`[Minigames] 🎯 Filtered to ${allMethods.length} methods with groupName "${groupName}"`);
            }

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
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(
            message,
            error instanceof Error ? error.message : String(error)
        );
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

    // Priority 2.5: Exact match on GROUP NAME
    for (const service of ironmanServices) {
        if (!service.pricingMethods) continue;

        const methodsInGroup = service.pricingMethods.filter((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            m.groupName &&
            m.groupName.toLowerCase() === normalized
        );

        if (methodsInGroup.length > 0) {
            logger.info(`[Ironman] ✅ Exact groupName match: "${methodsInGroup[0].groupName}" in service "${service.name}" (${methodsInGroup.length} methods)`);
            return {
                service,
                method: null,
                showAllMethods: true,
                groupName: methodsInGroup[0].groupName
            };
        }
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
                await deleteThinkingMessage(thinkingMsg);
                await sendServiceNotFoundError(
                    message,
                    item.name,
                    "Ironman Gathering",
                    ["!i amethyst 1000", "!i raw karambwan 500", "!i logs 200"]
                );
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
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(
            message,
            error instanceof Error ? error.message : String(error)
        );
    }
}

// Handler for !i command (Ironman Gathering - PER_ITEM pricing, filtered by category)
async function handleIronmanCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const input = message.content.slice(prefix.length + 2).trim();

    if (!input) {
        await sendValidationError(
            message,
            "!i <item-name> <quantity>\n!i <item1> <qty1>, <item2> <qty2>",
            "No input provided. Use a single item or comma-separated list."
        );
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
                await sendValidationError(
                    message,
                    "!i blue dragon scales 1000, snape grass 500",
                    `Each item needs a name and quantity. Check: "${part}"`
                );
                return;
            }

            const qty = parseInt(tokens[tokens.length - 1]);
            if (isNaN(qty) || qty < 1) {
                await sendInvalidParameterError(
                    message,
                    "Quantity",
                    tokens[tokens.length - 1],
                    `Must be a positive number in: "${part}"`
                );
                return;
            }

            const itemName = tokens.slice(0, -1).join(" ").toLowerCase();
            items.push({ name: itemName, quantity: qty });
        }
    } else {
        // Single item format: "item name quantity"
        const args = input.split(/\s+/);

        if (args.length < 2) {
            await sendValidationError(
                message,
                "!i amethyst 1000",
                "Missing item name or quantity"
            );
            return;
        }

        const quantity = parseInt(args[args.length - 1]);
        if (isNaN(quantity) || quantity < 1) {
            await sendInvalidParameterError(
                message,
                "Quantity",
                args[args.length - 1],
                "Must be a positive number (e.g., 1000)"
            );
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
        await deleteThinkingMessage(thinkingMsg);
        await sendServiceNotFoundError(
            message,
            serviceName,
            "Ironman Gathering",
            ["!i amethyst 1000", "!i raw karambwan 500", "!i logs 200", "!i blue dragon scales 1000"]
        );
        return;
    }

    const { service, method: specificMethod, showAllMethods, groupName } = searchResult;

    try {
        logger.info(`[Ironman] Calculating with serviceId: ${service.id}, quantity: ${quantity}, showAllMethods: ${showAllMethods}, groupName: ${groupName || 'none'}`);

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

        // CASE A: Show all methods (when service name or groupName is used)
        if (showAllMethods) {
            logger.info('[Ironman] 📋 Showing all methods for service');

            // Get all PER_ITEM methods
            let allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');

            // Filter by groupName if specified
            if (groupName) {
                allMethods = allMethods.filter((m: any) => m.groupName === groupName);
                logger.info(`[Ironman] 🎯 Filtered to ${allMethods.length} methods with groupName "${groupName}"`);
            }

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
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(
            message,
            apiError instanceof Error ? apiError.message : String(apiError)
        );
    }
}

// Handler for !q command (Quote - FIXED pricing)
// Supports: service name (gets all methods), method name, groupName, or comma-separated list
async function handleQuoteCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const input = message.content.slice(prefix.length + 2).trim();

    if (!input) {
        await sendValidationError(
            message,
            "!q Free Quests\n!q Cook's Assistant\n!q Cook's Assistant, Demon Slayer, Sheep Shearer",
            "No input provided. Specify a service name, quest name, or comma-separated list."
        );
        return;
    }

    // Check if batch request (contains commas)
    const isBatchRequest = input.includes(',');

    logger.info(`[Quote] Command: !q ${input} by ${message.author.tag} (batch: ${isBatchRequest})`);

    const thinkingMsg = await message.reply(
        isBatchRequest ? "💰 Fetching quotes..." : "💰 Fetching quote..."
    );

    try {
        // Get all services with pricing
        const services = await apiService.getAllServicesWithPricing();

        if (isBatchRequest) {
            // Batch mode: find each item separately
            const itemNames = input.split(',').map(s => s.trim().toLowerCase());
            const foundMethods: Array<{ name: string; price: number; displayOrder: number; groupName?: string }> = [];
            const notFound: string[] = [];

            for (const itemName of itemNames) {
                const result = findQuoteMatch(services, itemName);
                if (result && result.methods.length > 0) {
                    // Add all methods from this result
                    foundMethods.push(...result.methods);
                } else {
                    notFound.push(itemName);
                }
            }

            if (foundMethods.length === 0) {
                await deleteThinkingMessage(thinkingMsg);
                await sendServiceNotFoundError(
                    message,
                    input,
                    "Quest/Service",
                    ["!q Free Quests", "!q Cook's Assistant", "!q Cook's Assistant, Demon Slayer"]
                );
                return;
            }

            // Build batch result
            const batchResult = {
                title: `Batch Quote (${foundMethods.length} items)`,
                description: 'Multiple quests/services',
                emoji: '📋',
                methods: foundMethods,
                notFound,
            };

            await sendQuoteEmbed(thinkingMsg, batchResult);
            logger.info(`[Quote] ✅ Batch quote sent: ${foundMethods.length} found, ${notFound.length} not found`);

        } else {
            // Single mode: find one service/method/group
            const result = findQuoteMatch(services, input.toLowerCase());

            if (!result) {
                await deleteThinkingMessage(thinkingMsg);
                await sendServiceNotFoundError(
                    message,
                    input,
                    "Quest/Service",
                    ["!q Free Quests", "!q Cook's Assistant", "!q desert treasure 1"]
                );
                return;
            }

            await sendQuoteEmbed(thinkingMsg, result);
            logger.info(`[Quote] ✅ Quote sent for "${result.title}" (${result.methods.length} methods) to ${message.author.tag}`);
        }

    } catch (error) {
        logger.error('[Quote] Error:', error);
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(message, "Quote calculation failed. Please try again.");
    }
}

/**
 * Find matching service/methods for quote command
 * Priority: 1. Exact service name, 2. Exact method name, 3. Exact groupName, 4. Partial matches
 */
function findQuoteMatch(services: any[], searchName: string): {
    title: string;
    description: string;
    emoji: string;
    methods: Array<{ name: string; price: number; displayOrder: number; groupName?: string }>;
} | null {
    const normalized = normalizeQuestName(searchName);

    // Filter services that have FIXED pricing methods
    const fixedServices = services.filter((s: any) =>
        s.pricingMethods?.some((m: any) => m.pricingUnit === 'FIXED')
    );

    // 1. Try exact match on SERVICE NAME → return ALL methods in that service
    for (const service of fixedServices) {
        if (normalizeQuestName(service.name) === normalized ||
            normalizeQuestName(service.slug) === normalized) {

            const fixedMethods = service.pricingMethods
                .filter((m: any) => m.pricingUnit === 'FIXED')
                .map((m: any) => ({
                    name: m.name,
                    price: Number(m.basePrice),
                    displayOrder: m.displayOrder ?? 999,
                    groupName: m.groupName || null,
                }))
                .sort((a: any, b: any) => a.displayOrder - b.displayOrder);

            logger.info(`[Quote] ✅ Exact service match: "${service.name}" (${fixedMethods.length} methods)`);

            return {
                title: service.name,
                description: service.description || 'Fixed price service',
                emoji: service.emoji || '⭐',
                methods: fixedMethods,
            };
        }
    }

    // 2. Try exact match on PRICING METHOD NAME → return just that method
    for (const service of fixedServices) {
        const methodMatch = service.pricingMethods?.find((m: any) =>
            m.pricingUnit === 'FIXED' &&
            normalizeQuestName(m.name) === normalized
        );

        if (methodMatch) {
            logger.info(`[Quote] ✅ Exact method match: "${methodMatch.name}" in "${service.name}"`);

            return {
                title: methodMatch.name,
                description: service.description || 'Fixed price quest',
                emoji: service.emoji || '⭐',
                methods: [{
                    name: methodMatch.name,
                    price: Number(methodMatch.basePrice),
                    displayOrder: methodMatch.displayOrder ?? 0,
                    groupName: methodMatch.groupName || null,
                }],
            };
        }
    }

    // 3. Try exact match on GROUP NAME → return all methods in that group
    for (const service of fixedServices) {
        const methodsInGroup = service.pricingMethods?.filter((m: any) =>
            m.pricingUnit === 'FIXED' &&
            m.groupName &&
            normalizeQuestName(m.groupName) === normalized
        );

        if (methodsInGroup && methodsInGroup.length > 0) {
            logger.info(`[Quote] ✅ Exact group match: "${methodsInGroup[0].groupName}" (${methodsInGroup.length} methods)`);

            const methods = methodsInGroup
                .map((m: any) => ({
                    name: m.name,
                    price: Number(m.basePrice),
                    displayOrder: m.displayOrder ?? 999,
                    groupName: m.groupName || null,
                }))
                .sort((a: any, b: any) => a.displayOrder - b.displayOrder);

            return {
                title: methodsInGroup[0].groupName,
                description: service.description || 'Fixed price group',
                emoji: service.emoji || '⭐',
                methods,
            };
        }
    }

    // 4. Try partial match on service names
    const partialServiceMatches = fixedServices.filter((s: any) =>
        normalizeQuestName(s.name).includes(normalized)
    );

    if (partialServiceMatches.length > 0) {
        // Prefer shortest match (more specific)
        const bestMatch = partialServiceMatches.reduce((shortest, curr) =>
            curr.name.length < shortest.name.length ? curr : shortest
        );

        const fixedMethods = bestMatch.pricingMethods
            .filter((m: any) => m.pricingUnit === 'FIXED')
            .map((m: any) => ({
                name: m.name,
                price: Number(m.basePrice),
                displayOrder: m.displayOrder ?? 999,
                groupName: m.groupName || null,
            }))
            .sort((a: any, b: any) => a.displayOrder - b.displayOrder);

        logger.info(`[Quote] ✅ Partial service match: "${bestMatch.name}" (${fixedMethods.length} methods)`);

        return {
            title: bestMatch.name,
            description: bestMatch.description || 'Fixed price service',
            emoji: bestMatch.emoji || '⭐',
            methods: fixedMethods,
        };
    }

    // 5. Try partial match on pricing method names
    for (const service of fixedServices) {
        const methodMatch = service.pricingMethods?.find((m: any) =>
            m.pricingUnit === 'FIXED' &&
            normalizeQuestName(m.name).includes(normalized)
        );

        if (methodMatch) {
            logger.info(`[Quote] ✅ Partial method match: "${methodMatch.name}"`);

            return {
                title: methodMatch.name,
                description: service.description || 'Fixed price quest',
                emoji: service.emoji || '⭐',
                methods: [{
                    name: methodMatch.name,
                    price: Number(methodMatch.basePrice),
                    displayOrder: methodMatch.displayOrder ?? 0,
                    groupName: methodMatch.groupName || null,
                }],
            };
        }
    }

    logger.warn(`[Quote] ❌ No match found for: "${searchName}"`);
    return null;
}

/**
 * Send quote embed (matches style of other commands like !s, !i)
 */
async function sendQuoteEmbed(
    thinkingMsg: Message,
    result: {
        title: string;
        description: string;
        emoji: string;
        methods: Array<{ name: string; price: number; displayOrder: number; groupName?: string }>;
        notFound?: string[];
    }
) {
    const embed = new EmbedBuilder()
        .setTitle(`${result.emoji} ${result.title}`)
        .setColor(0xfca311)
        .setTimestamp();

    // Build pricing display - show each method individually (no grouping for batch)
    const priceLines: string[] = [];
    let totalPrice = 0;

    // Sort methods by displayOrder
    const sortedMethods = [...result.methods].sort((a, b) => a.displayOrder - b.displayOrder);

    for (const method of sortedMethods) {
        priceLines.push(`**${method.name}**`);
        priceLines.push(`  💰 $${method.price.toFixed(2)}`);
        priceLines.push('');
        totalPrice += method.price;
    }

    // Remove last empty line
    if (priceLines.length > 0 && priceLines[priceLines.length - 1] === '') {
        priceLines.pop();
    }

    embed.addFields({
        name: "💵 Pricing",
        value: priceLines.join('\n') || 'No pricing available',
        inline: false,
    });

    // Show grand total if multiple items
    if (result.methods.length > 1) {
        embed.addFields({
            name: "💎 Grand Total",
            value: `\`\`\`ansi\n\u001b[1;32m$${totalPrice.toFixed(2)}\u001b[0m\n\`\`\``,
            inline: false,
        });
    }

    // Show not found items if any
    const notFoundContent = result.notFound && result.notFound.length > 0
        ? `⚠️ Not found: ${result.notFound.join(', ')}`
        : "";

    await thinkingMsg.edit({
        content: notFoundContent,
        embeds: [embed.toJSON() as any],
    });
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
