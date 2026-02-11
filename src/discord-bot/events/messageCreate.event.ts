import { Events, Message, EmbedBuilder } from "discord.js";
import logger from "../../common/loggers";
import { ApiService } from "../services/api.service";
import { discordConfig } from "../config/discord.config";
import PricingCalculatorService from "../../api/pricingCalculator/pricingCalculator.service";
import LoyaltyTierService from "../../api/loyalty-tier/loyalty-tier.service";
import {
    sendEphemeralError,
    sendServiceNotFoundError,
    sendValidationError,
    sendInvalidParameterError,
    sendCalculationError,
    deleteThinkingMessage,
} from "../utils/messageHelpers";
import { discordApiClient } from "../clients/DiscordApiClient";
// Wallet embeds moved to slash commands /w and /t
import { getMentionTrackerService } from "../services/mention-tracker.service";

/**
 * Check if a channel is allowed for calculator commands
 * Only allowed in: Calculator channel OR any channel under Ticket category
 */
function isCalculatorAllowedChannel(message: Message): boolean {
    const channel = message.channel;

    // Check if it's the calculator channel
    if (channel.id === discordConfig.calculatorChannelId) {
        return true;
    }

    // Check if it's a channel under the ticket category (open or closed tickets)
    if ('parentId' in channel && channel.parentId) {
        const parentId = channel.parentId;

        // Check both open tickets category and closed tickets category
        if (parentId === discordConfig.ticketCategoryId ||
            parentId === discordConfig.closedTicketsCategoryId) {
            return true;
        }
    }

    return false;
}

const apiService = new ApiService(discordConfig.apiBaseUrl);
const loyaltyTierService = new LoyaltyTierService();
const pricingService = new PricingCalculatorService(loyaltyTierService);

/**
 * Fetch user by Discord ID for loyalty discount calculation
 */
async function getUserByDiscordId(discordId: string): Promise<number | undefined> {
    try {
        logger.info(`[Calculator] 🔍 Fetching user for Discord ID: ${discordId}`);
        const userResponse: any = await discordApiClient.get(`/discord/users/discord/${discordId}`);
        const user = userResponse.data || userResponse;

        if (user && user.id) {
            logger.info(`[Calculator] ✅ Found user ID: ${user.id} for Discord ID: ${discordId}`);
            return user.id;
        }

        logger.warn(`[Calculator] ⚠️ User not found for Discord ID: ${discordId}`);
        return undefined;
    } catch (error) {
        logger.warn(`[Calculator] ❌ Failed to fetch user for Discord ID ${discordId}:`, error);
        return undefined;
    }
}

export default {
    name: Events.MessageCreate,
    async execute(message: Message) {
        if (message.author.bot) return;

        // Track mentions for reminder system (only track NEW mentions from this message)
        const mentionTracker = getMentionTrackerService(message.client);

        // First mark the message author as responded (if they were previously mentioned in this channel)
        // This should happen BEFORE tracking new mentions from this message
        mentionTracker.markAsResponded(message.channelId, message.author.id).catch(err =>
            logger.error("[MessageCreate] Error marking as responded:", err)
        );

        // Then track any NEW mentions in this message
        mentionTracker.trackMention(message).catch(err =>
            logger.error("[MessageCreate] Error tracking mention:", err)
        );

        const prefix = discordConfig.prefix;
        const content = message.content.toLowerCase().trim();

        // Handle !daily command - only in daily gift channel
        if (content === "!daily") {
            if (discordConfig.dailyGiftChannelId && message.channel.id !== discordConfig.dailyGiftChannelId) {
                return; // Silently ignore if not in daily gift channel
            }
            await handleDailyRewardCommand(message);
            return;
        }

        // Wallet commands moved to slash commands /w and /t for ephemeral support
        // Users should use /w for balance and /t for transactions

        // Handle calculator commands - supports batch commands separated by comma
        // Examples: "!s agi 70-99" or "!s agi 70-99, !p cox 10, !m ba 100"
        const commandMatch = content.match(/^!([spmiq])\s+/);
        if (!commandMatch) return;

        // Calculator commands only work in calculator channel and ticket channels
        if (!isCalculatorAllowedChannel(message)) {
            // Silently ignore - don't respond in other channels
            return;
        }

        // Split by comma and check for multiple commands
        const parts = message.content.split(',').map(s => s.trim()).filter(s => s.length > 0);

        // Check if we have mixed commands (multiple !x prefixes) or single command type batch
        const hasMixedCommands = parts.some((part, index) => {
            if (index === 0) return false; // First part always has command
            return /^!([spmiq])\s+/.test(part.toLowerCase());
        });

        try {
            if (hasMixedCommands) {
                // Process each command separately (mixed command mode)
                for (const part of parts) {
                    const partLower = part.toLowerCase().trim();
                    const partMatch = partLower.match(/^!([spmiq])\s+/);

                    if (partMatch) {
                        const cmdType = partMatch[1];
                        // Create a fake message content for the single command
                        const singleCommandContent = part.trim();

                        await processSingleCommand(message, singleCommandContent, cmdType, apiService);
                    }
                }
            } else {
                // Original behavior - single command type (may have batch like "!s agi 70-99, cooking 1-99")
                const commandType = commandMatch[1];

                switch (commandType) {
                    case 's':
                        await handleSkillsCommand(message, apiService);
                        break;
                    case 'p':
                        await handleBossingCommand(message, apiService);
                        break;
                    case 'm':
                        await handleMinigamesCommand(message, apiService);
                        break;
                    case 'i':
                        await handleIronmanCommand(message, apiService);
                        break;
                    case 'q':
                        await handleQuoteCommand(message, apiService);
                        break;
                    default:
                        return;
                }
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

/**
 * Process a single command from a batch (for mixed commands like "!s agi 70-99, !p cox 10")
 * Creates a proxy message with modified content to reuse existing handlers
 */
async function processSingleCommand(
    message: Message,
    commandContent: string,
    commandType: string,
    apiService: ApiService
) {
    // Create a proxy object that overrides the content but keeps everything else
    const proxyMessage = Object.create(message);
    proxyMessage.content = commandContent;

    switch (commandType) {
        case 's':
            // For skills, extract args and use processSingleSkillRequest directly
            const skillArgs = commandContent.replace(/^!s\s+/i, '').trim();
            await processSingleSkillRequest(message, skillArgs, apiService);
            break;
        case 'p':
            await handleBossingCommand(proxyMessage, apiService);
            break;
        case 'm':
            await handleMinigamesCommand(proxyMessage, apiService);
            break;
        case 'i':
            await handleIronmanCommand(proxyMessage, apiService);
            break;
        case 'q':
            await handleQuoteCommand(proxyMessage, apiService);
            break;
    }
}

async function handleSkillsCommand(message: Message, apiService: ApiService) {
    const prefix = discordConfig.prefix;
    const content = message.content.slice(prefix.length + 2).trim();

    if (!content) {
        await sendValidationError(
            message,
            "!s <service> <start-level>-<end-level>\nExample: !s agility 70-99",
            "Missing parameters"
        );
        return;
    }

    // Split by comma for batch processing
    const requests = content.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (requests.length === 0) {
        await sendValidationError(
            message,
            "!s <service> <start-level>-<end-level>\nExample: !s agility 70-99",
            "Missing parameters"
        );
        return;
    }

    // Process each request sequentially
    for (const request of requests) {
        await processSingleSkillRequest(message, request, apiService);
    }
}

async function processSingleSkillRequest(message: Message, requestString: string, apiService: ApiService) {
    const args = requestString.split(/\s+/);

    if (args.length < 2) {
        await sendValidationError(
            message,
            "!s <service> <start-level>-<end-level>\nExample: !s agility 70-99",
            `Invalid format for request: "${requestString}"`
        );
        return;
    }

    const lastArg = args[args.length - 1];
    const levelMatch = lastArg.match(/^(\d+)-(\d+)$/);

    if (!levelMatch) {
         // Try to see if the user put the service name last e.g. "1-99 Cooking" - though we stick to standard format for now
        await sendValidationError(
            message,
            "!s <service> <start-level>-<end-level>\nExample: !s agility 70-99",
            `Invalid level range format in "${requestString}". Use format: 70-99`
        );
        return;
    }

    const startLevel = parseInt(levelMatch[1]);
    const endLevel = parseInt(levelMatch[2]);

    const serviceName = args.slice(0, -1).join(" ").toLowerCase();
    
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

    const thinkingMsg = await message.reply(`🔢 Calculating price for **${serviceName}** (${startLevel}-${endLevel})...`);

    const services = await apiService.getAllServicesWithPricing();

    let service = services.find((s: any) =>
        s.name.toLowerCase() === serviceName ||
        s.slug.toLowerCase() === serviceName ||
        (s.shortcuts && Array.isArray(s.shortcuts) && s.shortcuts.some((alias: string) => alias.toLowerCase() === serviceName))
    );

    if (!service) {
        service = services.find((s: any) =>
            s.name.toLowerCase().includes(serviceName) ||
            s.slug.toLowerCase().includes(serviceName) ||
            (s.shortcuts && Array.isArray(s.shortcuts) && s.shortcuts.some((alias: string) => alias.toLowerCase().includes(serviceName)))
        );
    }

    let groupNameToUse: string | undefined = undefined;
    if (!service) {
        for (const s of services) {
            const methodWithGroup = s.pricingMethods?.find((m: any) =>
                m.groupName && m.groupName.toLowerCase() === serviceName
            );

            if (methodWithGroup) {
                service = s;
                groupNameToUse = methodWithGroup.groupName;
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

    try {
        const userId = await getUserByDiscordId(message.author.id);
        logger.info(`[Skills Calculator] 💰 Calculating price for user ${message.author.tag} (userId: ${userId || 'undefined'})`);

        const result = await pricingService.calculateLevelRangePrice({
            serviceId: service.id,
            startLevel,
            endLevel,
            groupName: groupNameToUse,
            skipModifiers: true, // Disable modifiers for calculator commands
            userId,
        });

        const data = result;

        if (!data || !data.service) {
            logger.error('[PriceCalculator] Invalid API response structure');
            throw new Error('Invalid response from pricing calculator API');
        }

        const embed = new EmbedBuilder()
            .setTitle(`${data.service.emoji || '⭐'} ${data.service.name} Calculator`)
            .setColor(0xfca311)
            .setTimestamp();

        const cheapestMethod = data.methodOptions?.find((m: any) => m.isCheapest);
        const allDiscounts = cheapestMethod?.modifiers?.filter((m: any) => m.applied && Number(m.value) < 0) || [];
        const totalDiscountPercent = allDiscounts.reduce((sum: number, mod: any) =>
            mod.type === 'PERCENTAGE' ? sum + Math.abs(Number(mod.value)) : sum, 0
        );

        // Get loyalty discount info from any method option
        const loyaltyDiscount = data.methodOptions.find((m: any) => m.loyaltyDiscount)?.loyaltyDiscount;

        // Build level range display with ANSI table like !p calculator
        const discountText = loyaltyDiscount
            ? `${loyaltyDiscount.discountPercent.toFixed(1)}% ${loyaltyDiscount.tierEmoji}`
            : '0.0%';

        let levelRangeValue = `\`\`\`ansi\n`;
        levelRangeValue += `\u001b[0;37mSkill:        Start  End    Discount\u001b[0m\n`;
        levelRangeValue += `\u001b[0;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n`;

        const skillName = data.service.name.substring(0, 12).padEnd(12);
        const startLevelStr = String(data.levels.start).padEnd(5);
        const endLevelStr = String(data.levels.end).padEnd(5);
        const discountDisplay = totalDiscountPercent > 0
            ? `\u001b[0;32m${discountText}\u001b[0m`
            : `\u001b[0;37m${discountText}\u001b[0m`;

        levelRangeValue += `\u001b[0;36m${skillName}\u001b[0m  \u001b[0;36m${startLevelStr}\u001b[0m  \u001b[0;36m${endLevelStr}\u001b[0m  ${discountDisplay}\n`;
        levelRangeValue += `\`\`\`\n`;

        // XP Required on new line with green color
        levelRangeValue += `\`\`\`ansi\n`;
        levelRangeValue += `\u001b[0;32m${data.levels.formattedXp} XP Required\u001b[0m\n`;
        levelRangeValue += `\`\`\``;

        embed.addFields({
            name: "📊 Level Range",
            value: levelRangeValue,
            inline: false,
        });

        if (data.methodOptions && data.methodOptions.length > 0) {
            const priceLines: string[] = [];

            const individualSegments = data.methodOptions.filter((m: any) => {
                return m.methodName.includes('(') && m.methodName.includes('-') && m.methodName.includes(')');
            });

            const groupedMethods: { [key: string]: any[] } = {};

            for (const method of individualSegments) {
                const baseNameMatch = method.methodName.match(/^(.+?)\s*\(\d+-\d+\)$/);
                const baseName = baseNameMatch ? baseNameMatch[1].trim() : method.methodName;

                if (!groupedMethods[baseName]) {
                    groupedMethods[baseName] = [];
                }
                groupedMethods[baseName].push(method);
            }

            for (const [groupName, methods] of Object.entries(groupedMethods)) {
                methods.sort((a, b) => {
                    const aMatch = a.methodName.match(/\((\d+)-\d+\)/);
                    const bMatch = b.methodName.match(/\((\d+)-\d+\)/);
                    return (aMatch ? parseInt(aMatch[1]) : 0) - (bMatch ? parseInt(bMatch[1]) : 0);
                });

                const totalPrice = methods.reduce((sum, m) => sum + m.finalPrice, 0);

                priceLines.push(`**${groupName}**`);

                for (const method of methods) {
                    const levelMatch = method.methodName.match(/\((\d+-\d+)\)/);
                    const levelRange = levelMatch ? levelMatch[1] : '';
                    const price = method.finalPrice.toFixed(2);

                    // Show loyalty discount if present
                    let priceText = `$${price}`;
                    if (method.loyaltyDiscount) {
                        const originalPrice = method.loyaltyDiscount.originalPrice.toFixed(2);
                        priceText = `$${originalPrice} → $${price} (${method.loyaltyDiscount.tierEmoji} ${method.loyaltyDiscount.discountPercent}%)`;
                    }

                    priceLines.push(`  ► [ ${levelRange} ] — ${priceText}`);
                }

                priceLines.push(`  **Total: $${totalPrice.toFixed(2)}**`);
                priceLines.push('');
            }

            if (priceLines.length > 0) {
                priceLines.pop();

                embed.addFields({
                    name: "💵 Pricing Options",
                    value: priceLines.join('\n'),
                    inline: false,
                });
            }

            const completeMethods = data.methodOptions.filter((m: any) => {
                if (!m.levelRanges || m.levelRanges.length === 0) return false;

                const minLevel = Math.min(...m.levelRanges.map((r: any) => r.startLevel));
                const maxLevel = Math.max(...m.levelRanges.map((r: any) => r.endLevel));

                return minLevel <= data.levels.start && maxLevel >= data.levels.end;
            });

            const cheapest = completeMethods.length > 0
                ? completeMethods.reduce((min, curr) => curr.finalPrice < min.finalPrice ? curr : min)
                : data.methodOptions.find(m => m.isCheapest);
            if (cheapest) {
                const hasModifiers = cheapest.modifiersTotal !== 0;

                const discounts = cheapest.modifiers.filter(m => m.applied && Number(m.value) < 0);
                const upcharges = cheapest.modifiers.filter(m => m.applied && Number(m.value) > 0);

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

                if (cheapest.levelRanges && cheapest.levelRanges.length > 0) {
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

                let pricingSummary = `\`\`\`yml\n`;
                pricingSummary += `Base Cost:      $${cheapest.subtotal.toFixed(2)}\n`;

                if (discounts.length > 0) {
                    for (const mod of discounts) {
                        const modValue = mod.type === 'PERCENTAGE'
                            ? `${mod.value}%`
                            : `-$${Math.abs(Number(mod.value)).toFixed(2)}`;
                        pricingSummary += `${mod.name}:`.padEnd(16) + `${modValue}\n`;
                    }
                }

                if (upcharges.length > 0) {
                    for (const mod of upcharges) {
                        const modValue = mod.type === 'PERCENTAGE'
                            ? `+${mod.value}%`
                            : `+$${mod.value.toFixed(2)}`;
                        pricingSummary += `${mod.name}:`.padEnd(16) + `${modValue}\n`;
                    }
                }

                if (cheapest.loyaltyDiscount) {
                    pricingSummary += `${cheapest.loyaltyDiscount.tierEmoji} ${cheapest.loyaltyDiscount.tierName}:`.padEnd(16) + `-$${cheapest.loyaltyDiscount.discountAmount.toFixed(2)}\n`;
                }

                pricingSummary += `\`\`\``;

                pricingSummary += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${cheapest.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

                embed.addFields({
                    name: "💰 Price Summary",
                    value: pricingSummary,
                    inline: false,
                });
            }
        }

        await thinkingMsg.edit({
            content: "",
            embeds: [embed.toJSON() as any],
        });

    } catch (apiError) {
        logger.error('[PriceCalculator] API error:', apiError);
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(
            message,
            apiError instanceof Error ? apiError.message : String(apiError)
        );
    }
}

/**
 * Find PvM service/method by search term
 * Search priority: service name → groupName → method name (with shortcuts support)
 * Returns showAllMethods: true when matched by service/group, false when matched by specific method
 */
function findPvmItem(services: any[], searchTerm: string): {
    service: any;
    method: any | null;
    showAllMethods: boolean;
    groupName?: string;
} | null {
    const normalized = searchTerm.toLowerCase().trim();

    // Filter to only services with PER_KILL pricing
    const pvmServices = services.filter((s: any) =>
        s.pricingMethods?.some((m: any) => m.pricingUnit === 'PER_KILL')
    );

    // 1. Exact service name/slug/shortcut match → show ALL methods
    const exactServiceMatch = pvmServices.find((s: any) =>
        s.name.toLowerCase() === normalized ||
        s.slug?.toLowerCase() === normalized ||
        (s.shortcuts && Array.isArray(s.shortcuts) && s.shortcuts.some((alias: string) => alias.toLowerCase() === normalized))
    );

    if (exactServiceMatch) {
        logger.info(`[PvM] ✅ Exact service match: "${exactServiceMatch.name}"`);
        return {
            service: exactServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

    // 2. Exact groupName match → show ALL methods in that group
    for (const service of pvmServices) {
        if (!service.pricingMethods) continue;

        const methodsInGroup = service.pricingMethods.filter((m: any) =>
            m.pricingUnit === 'PER_KILL' &&
            m.groupName &&
            m.groupName.trim().toLowerCase() === normalized
        );

        if (methodsInGroup.length > 0) {
            logger.info(`[PvM] ✅ Exact groupName match: "${methodsInGroup[0].groupName}" in service "${service.name}" (${methodsInGroup.length} methods)`);
            return {
                service,
                method: null,
                showAllMethods: true,
                groupName: methodsInGroup[0].groupName
            };
        }
    }

    // 3. Exact method name/shortcut match → show ONLY this method
    for (const service of pvmServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_KILL' &&
            (m.name.toLowerCase() === normalized ||
            (m.shortcuts && Array.isArray(m.shortcuts) && m.shortcuts.some((alias: string) => alias.toLowerCase() === normalized)))
        );

        if (method) {
            logger.info(`[PvM] ✅ Exact method match: "${method.name}" in service "${service.name}"`);
            return {
                service,
                method,
                showAllMethods: false
            };
        }
    }

    // 4. Partial service name/slug/shortcut match → show ALL methods
    const partialServiceMatch = pvmServices.find((s: any) =>
        s.name.toLowerCase().includes(normalized) ||
        s.slug?.toLowerCase().includes(normalized) ||
        (s.shortcuts && Array.isArray(s.shortcuts) && s.shortcuts.some((alias: string) => alias.toLowerCase().includes(normalized)))
    );

    if (partialServiceMatch) {
        logger.info(`[PvM] ✅ Partial service match: "${partialServiceMatch.name}"`);
        return {
            service: partialServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

    // 5. Partial groupName match → show ALL methods in that group
    for (const service of pvmServices) {
        if (!service.pricingMethods) continue;

        const methodsInGroup = service.pricingMethods.filter((m: any) =>
            m.pricingUnit === 'PER_KILL' &&
            m.groupName &&
            m.groupName.trim().toLowerCase().includes(normalized)
        );

        if (methodsInGroup.length > 0) {
            logger.info(`[PvM] ✅ Partial groupName match: "${methodsInGroup[0].groupName}" in service "${service.name}" (${methodsInGroup.length} methods)`);
            return {
                service,
                method: null,
                showAllMethods: true,
                groupName: methodsInGroup[0].groupName
            };
        }
    }

    // 6. Partial method name/shortcut match → show ONLY this method
    for (const service of pvmServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_KILL' &&
            (m.name.toLowerCase().includes(normalized) ||
            (m.shortcuts && Array.isArray(m.shortcuts) && m.shortcuts.some((alias: string) => alias.toLowerCase().includes(normalized))))
        );

        if (method) {
            logger.info(`[PvM] ✅ Partial method match: "${method.name}" in service "${service.name}"`);
            return {
                service,
                method,
                showAllMethods: false
            };
        }
    }

    logger.warn(`[PvM] ❌ No match found for: "${searchTerm}"`);
    return null;
}

// Helper function to process a single boss calculation
async function processSingleBossCalculation(
    message: Message,
    apiService: ApiService,
    serviceName: string,
    killCount: number,
    services: any[]
): Promise<{ success: boolean; embed?: EmbedBuilder; error?: string }> {
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

    let normalizedServiceName = serviceName.toLowerCase().trim();
    if (bossAliases[normalizedServiceName]) {
        normalizedServiceName = bossAliases[normalizedServiceName];
    }

    // Use helper function to find PvM service/methods
    const searchResult = findPvmItem(services, normalizedServiceName);

    if (!searchResult) {
        return { success: false, error: `Service "${serviceName}" not found` };
    }

    const { service: foundService, method: specificMethod, showAllMethods, groupName: groupNameFilter } = searchResult;

    // Get full service data
    const service = await apiService.getServiceWithPricing(foundService.id);

    if (!service) {
        return { success: false, error: `Service "${serviceName}" not found` };
    }

    try {

        if (!service.pricingMethods || service.pricingMethods.length === 0) {
            return { success: false, error: `No pricing methods found for "${serviceName}"` };
        }

        let allMethods = service.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_KILL');

        // Filter by groupName if matched by group
        if (groupNameFilter) {
            const normalizedFilter = groupNameFilter.trim().toLowerCase();
            allMethods = allMethods.filter((m: any) => {
                const normalizedGroup = m.groupName ? m.groupName.trim().toLowerCase() : '';
                return normalizedGroup === normalizedFilter;
            });
        }

        // If specific method was matched (not showAllMethods), filter to only that method
        if (!showAllMethods && specificMethod) {
            allMethods = allMethods.filter((m: any) => m.name === specificMethod.name);
        }

        if (allMethods.length === 0) {
            return { success: false, error: `No PER_KILL pricing found for "${serviceName}"` };
        }

        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            return { success: false, error: 'No payment methods available' };
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔥 Bossing Calculator`)
            .setColor(0xfca311)
            .setTimestamp();

        const serviceModifiers = service.serviceModifiers || [];
        const discountModifiers = serviceModifiers.filter((m: any) =>
            m.active && m.modifierType === 'PERCENTAGE' && Number(m.value) < 0
        );
        const serviceDiscountPercent = discountModifiers.reduce((sum: number, mod: any) =>
            sum + Math.abs(Number(mod.value)), 0
        );

        // Get user ID for loyalty discount calculation
        const userId = await getUserByDiscordId(message.author.id);

        // Calculate loyalty discount by making a test calculation with the first method
        const defaultPaymentMethod = paymentMethods[0];
        const serviceModifierIds: string[] = [];
        let loyaltyDiscountPercent = 0;
        let loyaltyTierEmoji = '';

        if (userId && allMethods.length > 0) {
            try {
                const testResult = await pricingService.calculatePrice({
                    methodId: allMethods[0].id,
                    paymentMethodId: defaultPaymentMethod.id,
                    quantity: killCount,
                    serviceModifierIds,
                    userId,
                });

                if (testResult.loyaltyDiscount) {
                    loyaltyDiscountPercent = testResult.loyaltyDiscount.discountPercent;
                    loyaltyTierEmoji = testResult.loyaltyDiscount.tierEmoji;
                }
            } catch (err) {
                logger.warn('[PvM] Failed to calculate loyalty discount for top table:', err);
            }
        }

        // Total discount = service discount + loyalty discount
        const totalDiscountPercent = serviceDiscountPercent + loyaltyDiscountPercent;

        // Use specific method name if matched, otherwise use groupName or service name
        const displayName = specificMethod?.name || groupNameFilter || service.name;

        let tableText = "```ansi\n";
        tableText += `\u001b[0;37mMonster:                   Amount  Discount\u001b[0m\n`;
        tableText += `\u001b[0;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n`;

        const monsterName = displayName.substring(0, 25).padEnd(25);
        const discountDisplay = totalDiscountPercent > 0
            ? `\u001b[0;32m${totalDiscountPercent.toFixed(1)}% ${loyaltyTierEmoji}\u001b[0m`
            : `\u001b[0;37mNone\u001b[0m`;

        tableText += `\u001b[0;36m${monsterName}\u001b[0m  \u001b[0;36m${killCount.toString().padStart(6)}\u001b[0m  ${discountDisplay}\n`;
        tableText += "```";

        embed.setDescription(tableText);

        const tierResults: Array<{
            tier: string;
            notes: string;
            pricePerKill: number;
            basePrice: number;
            modifiers: Array<{ name: string; value: number; type: string }>;
            finalPrice: number;
            loyaltyDiscount?: {
                tierName: string;
                tierEmoji: string;
                discountPercent: number;
                discountAmount: number;
                originalPrice: number;
            };
        }> = [];

        for (const method of allMethods) {
            try {
                const result = await pricingService.calculatePrice({
                    methodId: method.id,
                    paymentMethodId: defaultPaymentMethod.id,
                    quantity: killCount,
                    serviceModifierIds,
                    userId,
                });

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
                    loyaltyDiscount: result.loyaltyDiscount,
                });
            } catch (err) {
                logger.warn(`[PvM] Failed to calculate for ${method.name}:`, err);
            }
        }

        for (const tier of tierResults) {
            let tierSection = "";

            tierSection += `\`\`\`fix\n${tier.tier}\n\`\`\``;

            tierSection += `**${tier.notes}** • \`$${tier.pricePerKill.toFixed(2)}/kc\`\n`;
            if (tier.modifiers.length > 0 || tier.loyaltyDiscount) {

                tierSection += `\`\`\`diff\n`;
                tierSection += `  Base Price           $${tier.basePrice.toFixed(2)}\n`;

                for (const mod of tier.modifiers) {
                    const symbol = mod.value < 0 ? '-' : '+';
                    const absValue = Math.abs(mod.value);
                    const displayValue = mod.type === 'PERCENTAGE' ? `${absValue.toFixed(0)}%` : `$${absValue.toFixed(2)}`;
                    tierSection += `${symbol} ${mod.name.substring(0, 18).padEnd(18)} ${displayValue}\n`;
                }

                if (tier.loyaltyDiscount) {
                    tierSection += `- ${tier.loyaltyDiscount.tierEmoji} ${tier.loyaltyDiscount.tierName} Loyalty    -$${tier.loyaltyDiscount.discountAmount.toFixed(2)}\n`;
                }

                tierSection += `\n= Total              $${tier.finalPrice.toFixed(2)}\n`;
                tierSection += `\`\`\``;
            } else {

                tierSection += `\`\`\`ansi\n\u001b[1;32m💰 Price: $${tier.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;
            }

            embed.addFields({
                name: "\u200B",
                value: tierSection,
                inline: false,
            });
        }

        embed.setFooter({
            text: `Morita Gaming Services`,
        });

        return { success: true, embed };
    } catch (apiError) {
        logger.error('[PriceCalculator] API error:', apiError);
        return { success: false, error: apiError instanceof Error ? apiError.message : String(apiError) };
    }
}

async function handleBossingCommand(message: Message, apiService: ApiService) {
    if (message.author.bot) {
        return;
    }

    const prefix = discordConfig.prefix;
    const rawInput = message.content.slice(prefix.length + 2).trim();

    // Split by comma to support multiple services: !p nex 50, chambers 100
    const segments = rawInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (segments.length === 0) {
        await sendValidationError(
            message,
            "!p <boss-name> <kill-count>\nExample: !p cox 120 or !p nex 50, chambers 100",
            "Missing boss name or kill count"
        );
        return;
    }

    // Parse each segment into boss name and kill count
    const requests: Array<{ serviceName: string; killCount: number }> = [];

    for (const segment of segments) {
        const args = segment.split(/\s+/);

        if (args.length < 2) {
            await sendValidationError(
                message,
                "!p <boss-name> <kill-count>\nExample: !p cox 120 or !p nex 50, chambers 100",
                `Invalid format: "${segment}" - needs boss name and kill count`
            );
            return;
        }

        const killCountStr = args[args.length - 1];
        const killCount = parseInt(killCountStr);

        if (isNaN(killCount) || killCount < 1) {
            await sendInvalidParameterError(
                message,
                "Kill Count",
                killCountStr,
                `Must be a valid number greater than 0 (in "${segment}")`
            );
            return;
        }

        if (killCount > 10000) {
            await sendInvalidParameterError(
                message,
                "Kill Count",
                killCount,
                "Must be between 1 and 10,000"
            );
            return;
        }

        const serviceName = args.slice(0, -1).join(" ");
        requests.push({ serviceName, killCount });
    }

    // Show thinking message
    const thinkingMsg = await message.reply(`🔢 Calculating ${requests.length > 1 ? `${requests.length} prices` : 'price'}...`);

    // Fetch all services once (shared across all calculations)
    const services = await apiService.getAllServicesWithPricing();

    // Process each request and send separate messages
    let isFirstMessage = true;
    const errors: string[] = [];

    for (const request of requests) {
        const result = await processSingleBossCalculation(
            message,
            apiService,
            request.serviceName,
            request.killCount,
            services
        );

        if (result.success && result.embed) {
            if (isFirstMessage) {
                // Edit the thinking message with the first result
                await thinkingMsg.edit({
                    content: "",
                    embeds: [result.embed.toJSON() as any],
                });
                isFirstMessage = false;
            } else {
                // Send additional results as new messages
                await message.channel.send({
                    embeds: [result.embed.toJSON() as any],
                });
            }
            logger.info(`[PriceCalculator] Result sent for ${request.serviceName} (${request.killCount} kills) to ${message.author.tag}`);
        } else {
            errors.push(result.error || `Failed to calculate for "${request.serviceName}"`);
        }
    }

    // If all requests failed, show error
    if (isFirstMessage && errors.length > 0) {
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(message, errors.join('\n'));
    } else if (errors.length > 0) {
        // Some succeeded, some failed - notify about failures
        await message.channel.send({
            content: `⚠️ Some calculations failed:\n${errors.map(e => `• ${e}`).join('\n')}`,
        });
    }
}

function findMinigameItem(services: any[], searchTerm: string): {
    service: any;
    method: any | null;
    showAllMethods: boolean;
    groupName?: string;
} | null {
    const normalized = searchTerm.toLowerCase().trim();

    logger.info(`[Minigames] 🔍 Searching for: "${searchTerm}"`);

    const minigameServices = services.filter((s: any) => {
        const hasPerItemPricing = s.pricingMethods?.some((m: any) => m.pricingUnit === 'PER_ITEM');
        return hasPerItemPricing;
    });

    logger.info(`[Minigames] 📋 Found ${minigameServices.length} PER_ITEM services to search`);

    minigameServices.slice(0, 5).forEach((s: any) => {
        logger.info(`[Minigames]   - "${s.name}" (${s.pricingMethods?.filter((m: any) => m.pricingUnit === 'PER_ITEM').length} methods)`);
    });

    for (const service of minigameServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            (m.name.toLowerCase() === normalized || m.slug?.toLowerCase() === normalized ||
            (m.shortcuts && Array.isArray(m.shortcuts) && m.shortcuts.some((alias: string) => alias.toLowerCase() === normalized)))
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

    const exactServiceMatch = minigameServices.find((s: any) =>
        s.name.toLowerCase() === normalized ||
        s.slug.toLowerCase() === normalized ||
        (s.shortcuts && Array.isArray(s.shortcuts) && s.shortcuts.some((alias: string) => alias.toLowerCase() === normalized))
    );

    if (exactServiceMatch) {
        logger.info(`[Minigames] ✅ Exact service match: "${exactServiceMatch.name}"`);
        return {
            service: exactServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

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

    for (const service of minigameServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            (m.name.toLowerCase().includes(normalized) ||
            (m.shortcuts && Array.isArray(m.shortcuts) && m.shortcuts.some((alias: string) => alias.toLowerCase().includes(normalized))))
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

    const partialServiceMatch = minigameServices.find((s: any) =>
        s.name.toLowerCase().includes(normalized) ||
        s.slug.toLowerCase().includes(normalized) ||
        (s.shortcuts && Array.isArray(s.shortcuts) && s.shortcuts.some((alias: string) => alias.toLowerCase().includes(normalized)))
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

async function handleBatchMinigameQuote(
    message: Message,
    apiService: ApiService,
    items: Array<{ name: string; quantity: number }>
) {
    logger.info(`[Minigames] Batch quote: ${items.length} items by ${message.author.tag}`);
    const thinkingMsg = await message.reply("🎮 Calculating batch Minigame quote...");

    try {
        const services = await apiService.getAllServicesWithPricing();
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

        const userId = await getUserByDiscordId(message.author.id);

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

            // Modifiers disabled for calculator commands
            const serviceModifierIds: string[] = [];

            let method = specificMethod;
            if (!method) {

                const allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');
                let cheapestMethod = allMethods[0];
                let cheapestPrice = Infinity;

                for (const m of allMethods) {
                    const result = await pricingService.calculatePrice({
                        methodId: m.id,
                        paymentMethodId: defaultPaymentMethod.id,
                        quantity: item.quantity,
                        serviceModifierIds,
                        userId,
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
                userId,
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

        const embed = new EmbedBuilder()
            .setTitle(`🎮 Minigame Batch Quote`)
            .setColor(0xfca311)
            .setTimestamp();

        let itemsList = `\`\`\`yml\n`;
        for (let i = 0; i < calculations.length; i++) {
            const calc = calculations[i];
            itemsList += `${i + 1}. ${calc.method.name}\n`;
            itemsList += `   Quantity:    ${calc.quantity.toLocaleString()} items\n`;
            if (calc.result.loyaltyDiscount) {
                itemsList += `   Base:        $${calc.result.loyaltyDiscount.originalPrice.toFixed(2)}\n`;
                itemsList += `   ${calc.result.loyaltyDiscount.tierEmoji} Discount:  -$${calc.result.loyaltyDiscount.discountAmount.toFixed(2)}\n`;
            }
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

    const items: Array<{ name: string; quantity: number }> = [];

    if (input.includes(',')) {
        
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

    if (items.length > 1) {
        await handleBatchMinigameQuote(message, apiService, items);
        return;
    }

    const gameName = items[0].name;
    const quantity = items[0].quantity;

    logger.info(`[Minigames] Command: !m ${gameName} ${quantity} by ${message.author.tag}`);

    const thinkingMsg = await message.reply("🎮 Calculating Minigame service price...");

    const services = await apiService.getAllServicesWithPricing();

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

        const fullService = await apiService.getServiceWithPricing(service.id);


        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }
        const defaultPaymentMethod = paymentMethods[0];

        // Modifiers disabled for calculator commands
        const serviceModifierIds: string[] = [];

        logger.info(`[Minigames] Modifiers disabled for calculator commands`);

        if (!fullService.pricingMethods || fullService.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        if (showAllMethods) {
            logger.info('[Minigames] 📋 Showing all methods for service');

            let allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');

            if (groupName) {
                allMethods = allMethods.filter((m: any) => m.groupName === groupName);
                logger.info(`[Minigames] 🎯 Filtered to ${allMethods.length} methods with groupName "${groupName}"`);
            }

            if (allMethods.length === 0) {
                throw new Error('No PER_ITEM pricing methods found for this service');
            }

            const userId = await getUserByDiscordId(message.author.id);

            const methodResults = [];
            for (const method of allMethods) {
                const result = await pricingService.calculatePrice({
                    methodId: method.id,
                    paymentMethodId: defaultPaymentMethod.id,
                    quantity: quantity,
                    serviceModifierIds,
                    userId,
                });

                methodResults.push({
                    method,
                    result,
                });
            }

            methodResults.sort((a, b) => a.result.finalPrice - b.result.finalPrice);

            const embed = new EmbedBuilder()
                .setTitle(`${service.emoji || '🎮'} ${service.name}`)
                .setColor(0xfca311)
                .setTimestamp();

            // Get loyalty discount from cheapest method for top table
            const cheapest = methodResults[0];
            const loyaltyDiscountPercent = cheapest.result.loyaltyDiscount?.discountPercent || 0;
            const loyaltyTierEmoji = cheapest.result.loyaltyDiscount?.tierEmoji || '';

            // Build styled ANSI table like !p and !s
            let tableValue = `\`\`\`ansi\n`;
            tableValue += `\u001b[0;37mGame:                      Amount    Discount\u001b[0m\n`;
            tableValue += `\u001b[0;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n`;

            const gameName = service.name.substring(0, 25).padEnd(25);
            const amountStr = quantity.toString().padStart(8);
            const discountDisplay = loyaltyDiscountPercent > 0
                ? `\u001b[0;32m${loyaltyDiscountPercent.toFixed(1)}% ${loyaltyTierEmoji}\u001b[0m`
                : `\u001b[0;37m0.0%\u001b[0m`;

            tableValue += `\u001b[0;36m${gameName}\u001b[0m  \u001b[0;36m${amountStr}\u001b[0m  ${discountDisplay}\n`;
            tableValue += `\`\`\``;

            embed.addFields({
                name: "🎮 Game Info",
                value: tableValue,
                inline: false,
            });

            const priceLines: string[] = [];
            for (let i = 0; i < methodResults.length; i++) {
                const { method, result } = methodResults[i];
                const indicator = i === 0 ? "✅" : "◻️";
                priceLines.push(`${indicator} **${method.name}**`);

                // Show loyalty discount if present (original → final with emoji and %)
                let priceText = `$${result.finalPrice.toFixed(2)}`;
                if (result.loyaltyDiscount) {
                    const originalPrice = result.loyaltyDiscount.originalPrice.toFixed(2);
                    priceText = `$${originalPrice} → $${result.finalPrice.toFixed(2)} (${result.loyaltyDiscount.tierEmoji} ${result.loyaltyDiscount.discountPercent}%)`;
                }

                priceLines.push(`  ► ${priceText}`);
                priceLines.push('');
            }
            priceLines.pop(); 

            embed.addFields({
                name: "💵 Pricing Options",
                value: priceLines.join('\n'),
                inline: false,
            });

            const appliedModifiers = cheapest.result.modifiers.filter((m: any) => m.applied);
            const cheapestBaseCost = cheapest.result.breakdown?.subtotal ?? (cheapest.method.basePrice * quantity);

            let breakdown = `\`\`\`yml\n`;
            breakdown += `Method:         ${cheapest.method.name}\n`;
            breakdown += `─────────────────────────────────────────\n`;
            breakdown += `Quantity:       ${quantity.toLocaleString()} items\n`;
            breakdown += `Rate:           $${cheapest.method.basePrice.toFixed(6)}/item\n`;
            breakdown += `─────────────────────────────────────────\n`;
            breakdown += `Base Cost:      $${cheapestBaseCost.toFixed(2)}\n`;

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

            if (cheapest.result.loyaltyDiscount) {
                breakdown += `${cheapest.result.loyaltyDiscount.tierEmoji} ${cheapest.result.loyaltyDiscount.tierName} Loyalty:`.padEnd(20) + `-$${cheapest.result.loyaltyDiscount.discountAmount.toFixed(2)}\n`;
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
        
        else {
            logger.info(`[Minigames] 🎯 Showing specific method: ${specificMethod.name}`);

            const userId = await getUserByDiscordId(message.author.id);

            const method = specificMethod;

            const result = await pricingService.calculatePrice({
                methodId: method.id,
                paymentMethodId: defaultPaymentMethod.id,
                quantity: quantity,
                serviceModifierIds,
                userId,
            });

            const embed = new EmbedBuilder()
                .setTitle(`${service.emoji || '🎮'} ${service.name}`)
                .setColor(0xfca311)
                .setTimestamp();

            // Get loyalty discount for top table
            const loyaltyDiscountPercent = result.loyaltyDiscount?.discountPercent || 0;
            const loyaltyTierEmoji = result.loyaltyDiscount?.tierEmoji || '';

            // Build styled ANSI table like !p and !s
            let tableValue = `\`\`\`ansi\n`;
            tableValue += `\u001b[0;37mGame:                      Amount    Discount\u001b[0m\n`;
            tableValue += `\u001b[0;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n`;

            const gameName = service.name.substring(0, 25).padEnd(25);
            const amountStr = quantity.toString().padStart(8);
            const discountDisplay = loyaltyDiscountPercent > 0
                ? `\u001b[0;32m${loyaltyDiscountPercent.toFixed(1)}% ${loyaltyTierEmoji}\u001b[0m`
                : `\u001b[0;37m0.0%\u001b[0m`;

            tableValue += `\u001b[0;36m${gameName}\u001b[0m  \u001b[0;36m${amountStr}\u001b[0m  ${discountDisplay}\n`;
            tableValue += `\`\`\``;

            embed.addFields({
                name: "🎮 Game Info",
                value: tableValue,
                inline: false,
            });

            const baseCost = result.breakdown?.subtotal ?? (method.basePrice * quantity);

            let priceCalc = `\`\`\`yml\n`;
            priceCalc += `Method:         ${method.name}\n`;
            priceCalc += `─────────────────────────────────────────\n`;
            priceCalc += `Quantity:       ${quantity.toLocaleString()} items\n`;
            priceCalc += `Rate:           $${method.basePrice.toFixed(6)}/item\n`;
            priceCalc += `─────────────────────────────────────────\n`;
            priceCalc += `Base Cost:      $${baseCost.toFixed(2)}\n`;

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

            if (result.loyaltyDiscount) {
                priceCalc += `${result.loyaltyDiscount.tierEmoji} ${result.loyaltyDiscount.tierName} Loyalty:`.padEnd(20) + `-$${result.loyaltyDiscount.discountAmount.toFixed(2)}\n`;
                priceCalc += `─────────────────────────────────────────\n`;
            }

            priceCalc += `\`\`\``;

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

function findIronmanItem(services: any[], searchTerm: string): any | null {
    const normalized = searchTerm.toLowerCase().trim();

    const ironmanServices = services.filter((s: any) =>
        s.category?.slug === 'ironman-gathering' ||
        s.category?.name?.toLowerCase().includes('ironman')
    );

    logger.info(`[Ironman] Searching for: "${normalized}" in ${ironmanServices.length} Ironman services`);

    // 1. Exact service name/slug/shortcut match → show ALL methods
    const exactServiceMatch = ironmanServices.find((s: any) =>
        s.name.toLowerCase() === normalized ||
        s.slug?.toLowerCase() === normalized ||
        (s.shortcuts && Array.isArray(s.shortcuts) && s.shortcuts.some((alias: string) => alias.toLowerCase() === normalized))
    );

    if (exactServiceMatch) {
        logger.info(`[Ironman] ✅ Exact service match: "${exactServiceMatch.name}"`);
        return {
            service: exactServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

    // 2. Exact groupName match → show ALL methods in group
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

    // 3. Exact method name/shortcut match → show ONLY this method
    for (const service of ironmanServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            (m.name.toLowerCase() === normalized ||
            (m.shortcuts && Array.isArray(m.shortcuts) && m.shortcuts.some((alias: string) => alias.toLowerCase() === normalized)))
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

    // 4. Partial service name/slug/shortcut match → show ALL methods
    const partialServiceMatch = ironmanServices.find((s: any) =>
        s.name.toLowerCase().includes(normalized) ||
        s.slug?.toLowerCase().includes(normalized) ||
        (s.shortcuts && Array.isArray(s.shortcuts) && s.shortcuts.some((alias: string) => alias.toLowerCase().includes(normalized)))
    );

    if (partialServiceMatch) {
        logger.info(`[Ironman] ✅ Partial service match: "${partialServiceMatch.name}"`);
        return {
            service: partialServiceMatch,
            method: null,
            showAllMethods: true
        };
    }

    // 5. Partial groupName match → show ALL methods in group
    for (const service of ironmanServices) {
        if (!service.pricingMethods) continue;

        const methodsInGroup = service.pricingMethods.filter((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            m.groupName &&
            m.groupName.toLowerCase().includes(normalized)
        );

        if (methodsInGroup.length > 0) {
            logger.info(`[Ironman] ✅ Partial groupName match: "${methodsInGroup[0].groupName}" in service "${service.name}" (${methodsInGroup.length} methods)`);
            return {
                service,
                method: null,
                showAllMethods: true,
                groupName: methodsInGroup[0].groupName
            };
        }
    }

    // 6. Partial method name/shortcut match → show ONLY this method
    for (const service of ironmanServices) {
        if (!service.pricingMethods) continue;

        const method = service.pricingMethods.find((m: any) =>
            m.pricingUnit === 'PER_ITEM' &&
            (m.name.toLowerCase().includes(normalized) ||
            (m.shortcuts && Array.isArray(m.shortcuts) && m.shortcuts.some((alias: string) => alias.toLowerCase().includes(normalized))))
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

    logger.warn(`[Ironman] ❌ No match found for: "${searchTerm}"`);
    return null;
}

async function handleBatchIronmanQuote(
    message: Message,
    apiService: ApiService,
    items: Array<{ name: string; quantity: number }>
) {
    logger.info(`[Ironman] Batch quote: ${items.length} items by ${message.author.tag}`);

    const thinkingMsg = await message.reply("🔗 Calculating batch Ironman quote...");

    try {
        const services = await apiService.getAllServicesWithPricing();
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

        const userId = await getUserByDiscordId(message.author.id);

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

            const fullService = await apiService.getServiceWithPricing(service.id);

            // Modifiers disabled for calculator commands
            const serviceModifierIds: string[] = [];

            let method = specificMethod;
            if (!method) {

                const allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');
                if (allMethods.length === 0) continue;

                let cheapestMethod = allMethods[0];
                let cheapestPrice = Infinity;

                for (const m of allMethods) {
                    const result = await pricingService.calculatePrice({
                        methodId: m.id,
                        paymentMethodId: defaultPaymentMethod.id,
                        quantity: item.quantity,
                        serviceModifierIds,
                        userId,
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
                userId,
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

        const embed = new EmbedBuilder()
            .setTitle(`🔗 Ironman Batch Quote`)
            .setColor(0xfca311)
            .setTimestamp();

        let itemsList = `\`\`\`yml\n`;
        for (let i = 0; i < calculations.length; i++) {
            const calc = calculations[i];
            itemsList += `${i + 1}. ${calc.method.name}\n`;
            itemsList += `   Quantity:    ${calc.quantity.toLocaleString()} items\n`;
            if (calc.result.loyaltyDiscount) {
                itemsList += `   Base:        $${calc.result.loyaltyDiscount.originalPrice.toFixed(2)}\n`;
                itemsList += `   ${calc.result.loyaltyDiscount.tierEmoji} Discount:  -$${calc.result.loyaltyDiscount.discountAmount.toFixed(2)}\n`;
            }
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

    const items: Array<{ name: string; quantity: number }> = [];

    if (input.includes(',')) {
        
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

    if (items.length > 1) {
        await handleBatchIronmanQuote(message, apiService, items);
        return;
    }

    const serviceName = items[0].name;
    const quantity = items[0].quantity;

    logger.info(`[Ironman] Command: !i ${serviceName} ${quantity} by ${message.author.tag}`);

    const thinkingMsg = await message.reply("🔗 Calculating Ironman service price...");

    const services = await apiService.getAllServicesWithPricing();

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

        const fullService = await apiService.getServiceWithPricing(service.id);


        const paymentMethods = await apiService.getPaymentMethods();
        if (!paymentMethods || paymentMethods.length === 0) {
            throw new Error('No payment methods available');
        }
        const defaultPaymentMethod = paymentMethods[0];

        // Modifiers disabled for calculator commands
        const serviceModifierIds: string[] = [];

        logger.info(`[Ironman] Modifiers disabled for calculator commands`);

        if (!fullService.pricingMethods || fullService.pricingMethods.length === 0) {
            throw new Error('No pricing methods found for this service');
        }

        if (showAllMethods) {
            logger.info('[Ironman] 📋 Showing all methods for service');

            let allMethods = fullService.pricingMethods.filter((m: any) => m.pricingUnit === 'PER_ITEM');

            if (groupName) {
                allMethods = allMethods.filter((m: any) => m.groupName === groupName);
                logger.info(`[Ironman] 🎯 Filtered to ${allMethods.length} methods with groupName "${groupName}"`);
            }

            if (allMethods.length === 0) {
                throw new Error('NO PER_ITEM pricing methods found for this service');
            }

            const userId = await getUserByDiscordId(message.author.id);

            const methodResults = [];
            for (const method of allMethods) {
                const result = await pricingService.calculatePrice({
                    methodId: method.id,
                    paymentMethodId: defaultPaymentMethod.id,
                    quantity: quantity,
                    serviceModifierIds,
                    userId,
                });

                methodResults.push({
                    method,
                    result,
                });
            }

            methodResults.sort((a, b) => a.result.finalPrice - b.result.finalPrice);

            const embed = new EmbedBuilder()
                .setTitle(`${service.emoji || '🔗'} ${service.name}`)
                .setColor(0xfca311)
                .setTimestamp();

            // Get loyalty discount from cheapest method for top table
            const cheapest = methodResults[0];
            const loyaltyDiscountPercent = cheapest.result.loyaltyDiscount?.discountPercent || 0;
            const loyaltyTierEmoji = cheapest.result.loyaltyDiscount?.tierEmoji || '';

            // Build styled ANSI table like !p and !s
            let tableValue = `\`\`\`ansi\n`;
            tableValue += `\u001b[0;37mItem:                      Amount    Discount\u001b[0m\n`;
            tableValue += `\u001b[0;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n`;

            const itemName = service.name.substring(0, 25).padEnd(25);
            const amountStr = quantity.toString().padStart(8);
            const discountDisplay = loyaltyDiscountPercent > 0
                ? `\u001b[0;32m${loyaltyDiscountPercent.toFixed(1)}% ${loyaltyTierEmoji}\u001b[0m`
                : `\u001b[0;37m0.0%\u001b[0m`;

            tableValue += `\u001b[0;36m${itemName}\u001b[0m  \u001b[0;36m${amountStr}\u001b[0m  ${discountDisplay}\n`;
            tableValue += `\`\`\``;

            embed.addFields({
                name: "🔗 Ironman Gathering",
                value: tableValue,
                inline: false,
            });

            const priceLines: string[] = [];

            for (let i = 0; i < methodResults.length; i++) {
                const { method, result } = methodResults[i];
                const indicator = i === 0 ? "✅" : "◻️";
                const rate = method.basePrice.toFixed(6);

                logger.info(`[Ironman] 💰 ${method.name}: $${result.finalPrice.toFixed(2)} (${rate}/item)`);

                priceLines.push(`${indicator} **${method.name}**`);

                // Show loyalty discount if present (original → final with emoji and %)
                let priceText = `$${result.finalPrice.toFixed(2)}`;
                if (result.loyaltyDiscount) {
                    const originalPrice = result.loyaltyDiscount.originalPrice.toFixed(2);
                    priceText = `$${originalPrice} → $${result.finalPrice.toFixed(2)} (${result.loyaltyDiscount.tierEmoji} ${result.loyaltyDiscount.discountPercent}%)`;
                }

                priceLines.push(`  ► ${priceText} • Rate: \`$${rate}/item\``);
                priceLines.push('');
            }

            if (priceLines.length > 0) {
                priceLines.pop();
            }

            embed.addFields({
                name: "💵 Pricing Options",
                value: priceLines.join('\n'),
                inline: false,
            });

            const cheapestBaseCost = cheapest.result.breakdown?.subtotal ?? (cheapest.method.basePrice * quantity);

            let breakdown = `\`\`\`yml\n`;
            breakdown += `Service:        ${service.name}\n`;
            breakdown += `─────────────────────────────────────────\n`;
            breakdown += `Quantity:       ${quantity} items\n`;
            breakdown += `Method:         ${cheapest.method.name}\n`;
            breakdown += `Rate:           $${cheapest.method.basePrice.toFixed(6)}/item\n`;
            breakdown += `─────────────────────────────────────────\n`;
            breakdown += `Base Cost:      $${cheapestBaseCost.toFixed(2)}\n`;

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

            if (cheapest.result.loyaltyDiscount) {
                breakdown += `${cheapest.result.loyaltyDiscount.tierEmoji} ${cheapest.result.loyaltyDiscount.tierName}:`.padEnd(16) + `-$${cheapest.result.loyaltyDiscount.discountAmount.toFixed(2)}\n`;
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
        
        else {
            logger.info(`[Ironman] 🎯 Showing specific method: ${specificMethod.name}`);

            const userId = await getUserByDiscordId(message.author.id);

            const method = specificMethod;

            const result = await pricingService.calculatePrice({
                methodId: method.id,
                paymentMethodId: defaultPaymentMethod.id,
                quantity: quantity,
                serviceModifierIds,
                userId,
            });

            const embed = new EmbedBuilder()
                .setTitle(`${service.emoji || '🔗'} ${service.name}`)
                .setColor(0xfca311)
                .setTimestamp();

            // Get loyalty discount for top table
            const loyaltyDiscountPercent = result.loyaltyDiscount?.discountPercent || 0;
            const loyaltyTierEmoji = result.loyaltyDiscount?.tierEmoji || '';

            // Build styled ANSI table like !p and !s
            let tableValue = `\`\`\`ansi\n`;
            tableValue += `\u001b[0;37mItem:                      Amount    Discount\u001b[0m\n`;
            tableValue += `\u001b[0;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\u001b[0m\n`;

            const itemName = service.name.substring(0, 25).padEnd(25);
            const amountStr = quantity.toString().padStart(8);
            const discountDisplay = loyaltyDiscountPercent > 0
                ? `\u001b[0;32m${loyaltyDiscountPercent.toFixed(1)}% ${loyaltyTierEmoji}\u001b[0m`
                : `\u001b[0;37m0.0%\u001b[0m`;

            tableValue += `\u001b[0;36m${itemName}\u001b[0m  \u001b[0;36m${amountStr}\u001b[0m  ${discountDisplay}\n`;
            tableValue += `\`\`\``;

            embed.addFields({
                name: "🔗 Ironman Gathering",
                value: tableValue,
                inline: false,
            });

            const baseCost = result.breakdown?.subtotal ?? (method.basePrice * quantity);

            let priceCalc = `\`\`\`yml\n`;
            priceCalc += `Method:         ${method.name}\n`;
            priceCalc += `─────────────────────────────────────────\n`;
            priceCalc += `Quantity:       ${quantity.toLocaleString()} items\n`;
            priceCalc += `Rate:           $${method.basePrice.toFixed(6)}/item\n`;
            priceCalc += `─────────────────────────────────────────\n`;
            priceCalc += `Base Cost:      $${baseCost.toFixed(2)}\n`;

            const appliedModifiers = result.modifiers.filter((m: any) => m.applied);
            if (appliedModifiers.length > 0) {
                for (const mod of appliedModifiers) {
                    const modValue = mod.type === 'PERCENTAGE'
                        ? `${mod.value}%`
                        : (mod.value < 0 ? `-$${Math.abs(mod.value).toFixed(2)}` : `+$${mod.value.toFixed(2)}`);

                    const icon = Number(mod.value) > 0 ? '⚠️  ' : Number(mod.value) < 0 ? '✅ ' : '';
                    const displayName = `${icon}${mod.name}`;
                    priceCalc += `${displayName}:`.padEnd(16) + `${modValue}\n`;
                }
                priceCalc += `─────────────────────────────────────────\n`;
            }

            if (result.loyaltyDiscount) {
                priceCalc += `${result.loyaltyDiscount.tierEmoji} ${result.loyaltyDiscount.tierName}:`.padEnd(16) + `-$${result.loyaltyDiscount.discountAmount.toFixed(2)}\n`;
                priceCalc += `─────────────────────────────────────────\n`;
            }

            priceCalc += `\`\`\``;

            priceCalc += `\n\`\`\`ansi\n\u001b[1;32m💎 TOTAL PRICE: $${result.finalPrice.toFixed(2)}\u001b[0m\n\`\`\``;

            embed.addFields({
                name: "💰 Price Calculation",
                value: priceCalc,
                inline: false,
            });

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

    const isBatchRequest = input.includes(',');

    logger.info(`[Quote] Command: !q ${input} by ${message.author.tag} (batch: ${isBatchRequest})`);

    const thinkingMsg = await message.reply(
        isBatchRequest ? "💰 Fetching quotes..." : "💰 Fetching quote..."
    );

    try {
        const userId = await getUserByDiscordId(message.author.id);
        logger.info(`[Quote] 💰 Calculating prices for user ${message.author.tag} (userId: ${userId || 'undefined'})`);

        const services = await apiService.getAllServicesWithPricing();
        const paymentMethods = await apiService.getPaymentMethods();
        const defaultPaymentMethod = paymentMethods[0];

        if (isBatchRequest) {

            const itemNames = input.split(',').map(s => s.trim().toLowerCase());
            const foundMethods: Array<{ name: string; price: number; displayOrder: number; groupName?: string; loyaltyDiscount?: any }> = [];
            const notFound: string[] = [];

            for (const itemName of itemNames) {
                const result = await findQuoteMatch(services, itemName, userId, defaultPaymentMethod.id);
                if (result && result.methods.length > 0) {

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

            const batchResult = {
                title: `Batch Quote (${foundMethods.length} items)`,
                description: 'Multiple quests/services',
                emoji: '📋',
                methods: foundMethods,
                notFound,
            };

            await sendQuoteEmbed(thinkingMsg, batchResult, userId);
            logger.info(`[Quote] ✅ Batch quote sent: ${foundMethods.length} found, ${notFound.length} not found`);

        } else {

            const result = await findQuoteMatch(services, input.toLowerCase(), userId, defaultPaymentMethod.id);

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

            await sendQuoteEmbed(thinkingMsg, result, userId);
            logger.info(`[Quote] ✅ Quote sent for "${result.title}" (${result.methods.length} methods) to ${message.author.tag}`);
        }

    } catch (error) {
        logger.error('[Quote] Error:', error);
        await deleteThinkingMessage(thinkingMsg);
        await sendCalculationError(message, "Quote calculation failed. Please try again.");
    }
}

async function findQuoteMatch(services: any[], searchName: string, userId?: number, paymentMethodId?: string): Promise<{
    title: string;
    description: string;
    emoji: string;
    methods: Array<{ name: string; price: number; displayOrder: number; groupName?: string; originalPrice?: number; loyaltyDiscount?: any }>;
} | null> {
    const normalized = normalizeQuestName(searchName);

    const fixedServices = services.filter((s: any) =>
        s.pricingMethods?.some((m: any) => m.pricingUnit === 'FIXED')
    );

    // Helper to check shortcuts
    const matchesShortcuts = (shortcuts: any, searchVal: string, exact: boolean) => {
        if (!shortcuts || !Array.isArray(shortcuts)) return false;
        return shortcuts.some((alias: string) =>
            exact
                ? normalizeQuestName(alias) === searchVal
                : normalizeQuestName(alias).includes(searchVal)
        );
    };

    // Helper to calculate prices with loyalty discount
    const calculateMethodPrices = async (methodsData: any[]) => {
        const methods = [];
        for (const m of methodsData) {
            if (userId && paymentMethodId) {
                try {
                    const result = await pricingService.calculatePrice({
                        methodId: m.id,
                        paymentMethodId,
                        quantity: 1,
                        serviceModifierIds: [],
                        userId,
                    });
                    methods.push({
                        name: m.name,
                        price: result.finalPrice,
                        originalPrice: result.basePrice,
                        displayOrder: m.displayOrder ?? 999,
                        groupName: m.groupName || null,
                        loyaltyDiscount: result.loyaltyDiscount,
                    });
                } catch (error) {
                    logger.warn(`[Quote] Failed to calculate price for ${m.name}, using base price`);
                    methods.push({
                        name: m.name,
                        price: Number(m.basePrice),
                        displayOrder: m.displayOrder ?? 999,
                        groupName: m.groupName || null,
                    });
                }
            } else {
                methods.push({
                    name: m.name,
                    price: Number(m.basePrice),
                    displayOrder: m.displayOrder ?? 999,
                    groupName: m.groupName || null,
                });
            }
        }
        return methods.sort((a: any, b: any) => a.displayOrder - b.displayOrder);
    };

    // 1. Exact service name/slug/shortcut match → show ALL methods
    for (const service of fixedServices) {
        if (normalizeQuestName(service.name) === normalized ||
            normalizeQuestName(service.slug) === normalized ||
            matchesShortcuts(service.shortcuts, normalized, true)) {

            const fixedMethodsData = service.pricingMethods.filter((m: any) => m.pricingUnit === 'FIXED');
            const fixedMethods = await calculateMethodPrices(fixedMethodsData);

            logger.info(`[Quote] ✅ Exact service match: "${service.name}" (${fixedMethods.length} methods)`);

            return {
                title: service.name,
                description: service.description || 'Fixed price service',
                emoji: service.emoji || '⭐',
                methods: fixedMethods,
            };
        }
    }

    // 2. Exact groupName match → show ALL methods in group
    for (const service of fixedServices) {
        const methodsInGroup = service.pricingMethods?.filter((m: any) =>
            m.pricingUnit === 'FIXED' &&
            m.groupName &&
            normalizeQuestName(m.groupName) === normalized
        );

        if (methodsInGroup && methodsInGroup.length > 0) {
            logger.info(`[Quote] ✅ Exact group match: "${methodsInGroup[0].groupName}" (${methodsInGroup.length} methods)`);

            const methods = await calculateMethodPrices(methodsInGroup);

            return {
                title: methodsInGroup[0].groupName,
                description: service.description || 'Fixed price group',
                emoji: service.emoji || '⭐',
                methods,
            };
        }
    }

    // 3. Exact method name/shortcut match → show ONLY this method
    for (const service of fixedServices) {
        const methodMatch = service.pricingMethods?.find((m: any) =>
            m.pricingUnit === 'FIXED' &&
            (normalizeQuestName(m.name) === normalized ||
            matchesShortcuts(m.shortcuts, normalized, true))
        );

        if (methodMatch) {
            logger.info(`[Quote] ✅ Exact method match: "${methodMatch.name}" in "${service.name}"`);

            const methods = await calculateMethodPrices([methodMatch]);

            return {
                title: methodMatch.name,
                description: service.description || 'Fixed price quest',
                emoji: service.emoji || '⭐',
                methods,
            };
        }
    }

    // 4. Partial service name/slug/shortcut match → show ALL methods
    const partialServiceMatches = fixedServices.filter((s: any) =>
        normalizeQuestName(s.name).includes(normalized) ||
        normalizeQuestName(s.slug || '').includes(normalized) ||
        matchesShortcuts(s.shortcuts, normalized, false)
    );

    if (partialServiceMatches.length > 0) {
        const bestMatch = partialServiceMatches.reduce((shortest, curr) =>
            curr.name.length < shortest.name.length ? curr : shortest
        );

        const fixedMethodsData = bestMatch.pricingMethods.filter((m: any) => m.pricingUnit === 'FIXED');
        const fixedMethods = await calculateMethodPrices(fixedMethodsData);

        logger.info(`[Quote] ✅ Partial service match: "${bestMatch.name}" (${fixedMethods.length} methods)`);

        return {
            title: bestMatch.name,
            description: bestMatch.description || 'Fixed price service',
            emoji: bestMatch.emoji || '⭐',
            methods: fixedMethods,
        };
    }

    // 5. Partial groupName match → show ALL methods in group
    for (const service of fixedServices) {
        const methodsInGroup = service.pricingMethods?.filter((m: any) =>
            m.pricingUnit === 'FIXED' &&
            m.groupName &&
            normalizeQuestName(m.groupName).includes(normalized)
        );

        if (methodsInGroup && methodsInGroup.length > 0) {
            logger.info(`[Quote] ✅ Partial group match: "${methodsInGroup[0].groupName}" (${methodsInGroup.length} methods)`);

            const methods = await calculateMethodPrices(methodsInGroup);

            return {
                title: methodsInGroup[0].groupName,
                description: service.description || 'Fixed price group',
                emoji: service.emoji || '⭐',
                methods,
            };
        }
    }

    // 6. Partial method name/shortcut match → show ONLY this method
    for (const service of fixedServices) {
        const methodMatch = service.pricingMethods?.find((m: any) =>
            m.pricingUnit === 'FIXED' &&
            (normalizeQuestName(m.name).includes(normalized) ||
            matchesShortcuts(m.shortcuts, normalized, false))
        );

        if (methodMatch) {
            logger.info(`[Quote] ✅ Partial method match: "${methodMatch.name}"`);

            const methods = await calculateMethodPrices([methodMatch]);

            return {
                title: methodMatch.name,
                description: service.description || 'Fixed price quest',
                emoji: service.emoji || '⭐',
                methods,
            };
        }
    }

    logger.warn(`[Quote] ❌ No match found for: "${searchName}"`);
    return null;
}

async function sendQuoteEmbed(
    thinkingMsg: Message,
    result: {
        title: string;
        description: string;
        emoji: string;
        methods: Array<{ name: string; price: number; displayOrder: number; groupName?: string; originalPrice?: number; loyaltyDiscount?: any }>;
        notFound?: string[];
    },
    userId?: number
) {
    const embed = new EmbedBuilder()
        .setTitle(`${result.emoji} ${result.title}`)
        .setColor(0xfca311)
        .setTimestamp();

    // Get loyalty discount from first method (all should have same discount %)
    const loyaltyDiscountPercent = result.methods[0]?.loyaltyDiscount?.discountPercent || 0;
    const loyaltyTierEmoji = result.methods[0]?.loyaltyDiscount?.tierEmoji || '';

    // If user has loyalty discount, show it in top section
    if (loyaltyDiscountPercent > 0) {
        let discountInfo = `\`\`\`ansi\n`;
        discountInfo += `\u001b[0;32mLoyalty Discount: ${loyaltyDiscountPercent.toFixed(1)}% ${loyaltyTierEmoji}\u001b[0m\n`;
        discountInfo += `\`\`\``;

        embed.addFields({
            name: "🎁 Your Discount",
            value: discountInfo,
            inline: false,
        });
    }

    const priceLines: string[] = [];
    let totalPrice = 0;

    const sortedMethods = [...result.methods].sort((a, b) => a.displayOrder - b.displayOrder);

    for (const method of sortedMethods) {
        priceLines.push(`**${method.name}**`);

        // Show loyalty discount if present
        if (method.loyaltyDiscount && method.originalPrice) {
            priceLines.push(`  ► $${method.originalPrice.toFixed(2)} → $${method.price.toFixed(2)} (${method.loyaltyDiscount.tierEmoji} ${method.loyaltyDiscount.discountPercent}%)`);
        } else {
            priceLines.push(`  ► $${method.price.toFixed(2)}`);
        }
        priceLines.push('');
        totalPrice += method.price;
    }

    if (priceLines.length > 0 && priceLines[priceLines.length - 1] === '') {
        priceLines.pop();
    }

    embed.addFields({
        name: "💵 Pricing",
        value: priceLines.join('\n') || 'No pricing available',
        inline: false,
    });

    if (result.methods.length > 1) {
        embed.addFields({
            name: "💎 Grand Total",
            value: `\`\`\`ansi\n\u001b[1;32m$${totalPrice.toFixed(2)}\u001b[0m\n\`\`\``,
            inline: false,
        });
    }

    const notFoundContent = result.notFound && result.notFound.length > 0
        ? `⚠️ Not found: ${result.notFound.join(', ')}`
        : "";

    await thinkingMsg.edit({
        content: notFoundContent,
        embeds: [embed.toJSON() as any],
    });
}

function normalizeQuestName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/\bi\b/g, '1')
        .replace(/\bii\b/g, '2')
        .replace(/\biii\b/g, '3')
        .replace(/\biv\b/g, '4')
        .replace(/\bv\b/g, '5')
        .replace(/[^a-z0-9\s']/g, '') // Remove special chars BUT keep apostrophes
        .replace(/\s+/g, ' ')       // Normalize spaces
        .replace(/'+/g, "'");
}

// Wallet commands (!w, !t) have been moved to slash commands /w and /t
// This allows ephemeral messages that only the user can see

// =====================================
// DAILY REWARD COMMAND
// =====================================

/**
 * Handle !daily command - Claim daily reward
 */
async function handleDailyRewardCommand(message: Message) {
    try {
        const discordId = message.author.id;

        // First, get the config to check if enabled and get display settings
        let config: any;
        try {
            const configResponse = await discordApiClient.get("/daily-reward/public-config");
            config = configResponse.data?.data || configResponse.data;
        } catch (err) {
            logger.error("[DailyReward] Failed to fetch config:", err);
            await message.reply({
                content: "❌ Daily rewards are not available at the moment. Please try again later.",
            });
            return;
        }

        if (!config.isEnabled) {
            await message.reply({
                content: "❌ Daily rewards are currently disabled.",
            });
            return;
        }

        // Check claim status first
        let status: any;
        try {
            const statusResponse = await discordApiClient.get(`/daily-reward/status/${discordId}`);
            status = statusResponse.data?.data || statusResponse.data;
        } catch (err) {
            logger.error("[DailyReward] Failed to fetch status:", err);
        }

        // If can't claim, show cooldown message
        if (status && !status.canClaim && status.remainingSeconds) {
            const hours = Math.floor(status.remainingSeconds / 3600);
            const minutes = Math.floor((status.remainingSeconds % 3600) / 60);
            const seconds = status.remainingSeconds % 60;

            let timeString = "";
            if (hours > 0) timeString += `${hours}h `;
            if (minutes > 0) timeString += `${minutes}m `;
            timeString += `${seconds}s`;

            const cooldownEmbed = new EmbedBuilder()
                .setTitle("⏰ Not Yet!")
                .setDescription(`It's not been ${config.cooldownHours} hours yet!\n\nTime remaining: **${timeString.trim()}**`)
                .setColor(0xffa500)
                .setTimestamp()
                .setFooter({ text: "MORITA Gaming" });

            await message.reply({
                embeds: [cooldownEmbed.toJSON() as any],
            });
            return;
        }

        // Attempt to claim
        let claimResult: any;
        try {
            const claimResponse = await discordApiClient.post("/daily-reward/claim", {
                discordId,
            });
            claimResult = claimResponse.data?.data || claimResponse.data;
        } catch (err: any) {
            logger.error("[DailyReward] Failed to claim:", err);

            // Check if it's a "not found" error (user not registered)
            if (err.response?.status === 404 || err.message?.includes("not found")) {
                await message.reply({
                    content: "❌ You need to complete onboarding first before claiming daily rewards!",
                });
            } else {
                await message.reply({
                    content: "❌ Failed to claim daily reward. Please try again later.",
                });
            }
            return;
        }

        if (!claimResult.success) {
            // Handle error (already claimed, etc.)
            if (claimResult.error?.includes("already claimed") || claimResult.nextClaimAt) {
                const nextClaim = claimResult.nextClaimAt ? new Date(claimResult.nextClaimAt) : null;
                const timeLeft = nextClaim ? Math.ceil((nextClaim.getTime() - Date.now()) / 1000) : 0;

                const hours = Math.floor(timeLeft / 3600);
                const minutes = Math.floor((timeLeft % 3600) / 60);
                const seconds = timeLeft % 60;

                let timeString = "";
                if (hours > 0) timeString += `${hours}h `;
                if (minutes > 0) timeString += `${minutes}m `;
                timeString += `${seconds}s`;

                const cooldownEmbed = new EmbedBuilder()
                    .setTitle("⏰ Not Yet!")
                    .setDescription(`It's not been ${config.cooldownHours} hours yet!\n\nTime remaining: **${timeString.trim()}**`)
                    .setColor(0xffa500)
                    .setTimestamp()
                    .setFooter({ text: "MORITA Gaming" });

                await message.reply({
                    embeds: [cooldownEmbed.toJSON() as any],
                });
            } else {
                await message.reply({
                    content: `❌ ${claimResult.error || "Failed to claim daily reward."}`,
                });
            }
            return;
        }

        // Success! Build the reward embed
        const amount = claimResult.amount || 0;
        const currencyName = config.currencyName || "$";

        const successEmbed = new EmbedBuilder()
            .setTitle(`🎁 Daily Reward Claimed!`)
            .setDescription(`Use it on your next order!`)
            .setColor(0x2ecc71)
            .addFields({
                name: "Reward",
                value: `\`\`\`${currencyName}${amount.toLocaleString()}\`\`\``,
                inline: true,
            })
            .setTimestamp()
            .setFooter({ text: "MORITA Gaming • Come back in 24 hours!" });

        // Add thumbnail if configured
        if (config.thumbnailUrl) {
            successEmbed.setThumbnail(config.thumbnailUrl);
        }

        // Add GIF image directly to the main embed
        if (config.gifUrl) {
            successEmbed.setImage(config.gifUrl);
        }

        // Build message options
        const messageOptions: any = {
            content: `<@${message.author.id}>`,
            embeds: [successEmbed.toJSON() as any],
        };

        await message.reply(messageOptions);

        logger.info(`[DailyReward] User ${message.author.tag} claimed ${currencyName}${amount}`);
    } catch (error) {
        logger.error("[DailyReward] Error handling daily command:", error);
        await message.reply({
            content: "❌ An error occurred while processing your daily reward. Please try again later.",
        });
    }
}
