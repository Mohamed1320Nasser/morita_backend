import { ButtonInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";

/**
 * Error types that indicate an interaction is no longer valid
 */
const INTERACTION_EXPIRED_ERRORS = [
    "unknown interaction",
    "interaction has already been acknowledged",
    "already been acknowledged",
    "unknown message",
];

/**
 * Check if an error indicates the interaction expired
 */
function isInteractionExpiredError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return INTERACTION_EXPIRED_ERRORS.some(err => message.includes(err));
}

export async function handleCalculatePrice(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Get service ID from button custom ID (format: 'calculate_price_<id>')
        const serviceId = interaction.customId.replace("calculate_price_", "");

        if (!serviceId) {
            // Try to reply, but handle expired interactions
            try {
                await interaction.reply({
                    content: "Invalid service selection. Please try again.",
                    ephemeral: true,
                });
            } catch (replyError) {
                if (isInteractionExpiredError(replyError)) {
                    logger.debug("[CalculatePrice] Interaction expired during invalid service reply");
                    return;
                }
                throw replyError;
            }
            return;
        }

        // Fetch service to get the name
        const service =
            await interaction.client.apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await interaction.reply({
                content: "Service not found. Please try again.",
                ephemeral: true,
            });
            return;
        }

        // Determine which calculator command to use based on pricing type
        const pricingMethod = service.pricingMethods?.[0];
        let commandExample = '';
        let commandType = '';

        if (!pricingMethod) {
            await interaction.reply({
                content:
                    `❌ **Calculator Not Available**\n\n` +
                    `This service does not have pricing information.\n\n` +
                    `Please contact support for pricing details.`,
                ephemeral: true,
            });
            return;
        }

        // Determine command type based on pricing unit
        switch (pricingMethod.pricingUnit) {
            case 'PER_LEVEL':
                commandType = 'Skills Calculator';
                commandExample = `!s ${service.name.toLowerCase()} 70-99`;
                break;
            case 'PER_KILL':
                commandType = 'PvM/Bossing Calculator';
                commandExample = `!p ${service.name.toLowerCase()} 100`;
                break;
            case 'PER_ITEM':
                // Check if it's Ironman category
                if (service.category?.slug?.includes('ironman')) {
                    commandType = 'Ironman Calculator';
                    commandExample = `!i ${service.name.toLowerCase()} 1000`;
                } else {
                    commandType = 'Minigames Calculator';
                    commandExample = `!m ${service.name.toLowerCase()} 100`;
                }
                break;
            case 'FIXED':
                commandType = 'Quest Quote';
                commandExample = `!q ${service.name.toLowerCase()}`;
                break;
            default:
                commandType = 'Price Calculator';
                commandExample = `!s ${service.name.toLowerCase()} 70-99`;
        }

        // Build beautiful calculator redirect embed with clean design
        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Discord Blurple - professional look
            .setTitle(`💰 ${service.emoji || '⭐'} ${service.name} Price Calculator`)
            .setDescription(
                `> **Get instant pricing** for **${service.name}**!\n` +
                `> Use our calculator channel for accurate quotes.\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .addFields(
                {
                    name: '📍 **Calculator Channel**',
                    value: discordConfig.calculatorChannelId
                        ? `**▸** Head to <#${discordConfig.calculatorChannelId}>\n**▸** Type your command below\n**▸** Get instant price quote!`
                        : '**▸** Use the calculator commands below\n**▸** Get instant price quotes!',
                    inline: false,
                },
                {
                    name: '\u200B', // Spacer
                    value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    inline: false,
                },
                {
                    name: `🎯 **Your Command** • ${commandType}`,
                    value:
                        `\`\`\`ansi\n` +
                        `\u001b[1;36m${commandExample}\u001b[0m\n` +
                        `\`\`\`\n` +
                        `**Copy this command** and paste it in the calculator channel!`,
                    inline: false,
                },
                {
                    name: '\u200B', // Spacer
                    value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    inline: false,
                },
                {
                    name: '📋 **All Calculator Commands**',
                    value:
                        '```ansi\n' +
                        '\u001b[1;33m!s\u001b[0m <skill> <start>-<end>  │ Skills (per level)\n' +
                        '\u001b[1;33m!p\u001b[0m <boss> <kills>         │ PvM/Bossing (per kill)\n' +
                        '\u001b[1;33m!m\u001b[0m <game> <count>         │ Minigames (per item)\n' +
                        '\u001b[1;33m!i\u001b[0m <item> <quantity>      │ Ironman (per item)\n' +
                        '\u001b[1;33m!q\u001b[0m <quest name>           │ Quests (fixed price)\n' +
                        '```',
                    inline: false,
                },
                {
                    name: '✨ **Quick Examples**',
                    value:
                        '```diff\n' +
                        '+ !s agility 70-99        → Agility training 70-99\n' +
                        '+ !p cox 120              → 120 CoX raid kills\n' +
                        '+ !m barrows 100          → 100 Barrows runs\n' +
                        '+ !i amethyst 1000        → 1000 Amethyst ore\n' +
                        '+ !q cook\'s assistant     → Quest completion\n' +
                        '```',
                    inline: false,
                },
                {
                    name: '\u200B', // Spacer
                    value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    inline: false,
                },
                {
                    name: '💡 **Pro Tips**',
                    value:
                        '**›** Commands are **case-insensitive**\n' +
                        '**›** Results appear **instantly**\n' +
                        '**›** Prices include all **modifiers & upcharges**\n' +
                        '**›** Need help? Ask in the calculator channel!',
                    inline: false,
                }
            )
            .setFooter({
                text: 'Morita Gaming Services • Instant Price Calculations • Today at ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                iconURL: 'https://cdn.discordapp.com/avatars/1431962373719326781/542747abb0a2222bc5d5b66346d01665.webp',
            })
            .setTimestamp();

        // Send ephemeral reply with calculator instructions
        // Wrap in try/catch to handle expired interactions
        try {
            await interaction.reply({
                embeds: [embed.toJSON() as any],
                ephemeral: true,
            });

            logger.info(
                `Calculator redirect sent for ${service.name} to ${interaction.user.tag} (command: ${commandExample})`
            );
        } catch (replyError) {
            if (isInteractionExpiredError(replyError)) {
                logger.debug(
                    `[CalculatePrice] Interaction expired (likely bot restart). User: ${interaction.user.tag}`
                );
                return;
            }
            throw replyError;
        }
    } catch (error) {
        logger.error("Error handling calculate price button:", error);

        // If interaction not replied yet, reply with error
        // Wrap in try/catch to handle expired interactions
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: "Failed to show calculator instructions. Please try again.",
                    ephemeral: true,
                });
            } catch (errorReplyError) {
                if (isInteractionExpiredError(errorReplyError)) {
                    logger.debug("[CalculatePrice] Interaction expired during error reply");
                    return;
                }
                // Log but don't throw - we're already in error handling
                logger.error("[CalculatePrice] Failed to send error reply:", errorReplyError);
            }
        }
    }
}
