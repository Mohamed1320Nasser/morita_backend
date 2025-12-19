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

        // Build calculator redirect embed
        const embed = new EmbedBuilder()
            .setTitle(`💰 ${service.emoji || '⭐'} ${service.name} Price Calculator`)
            .setDescription(
                `To calculate the price for **${service.name}**, please use our calculator channel!`
            )
            .setColor(0xfca311) // Orange color
            .addFields(
                {
                    name: '📍 Calculator Channel',
                    value: discordConfig.calculatorChannelId
                        ? `Head over to <#${discordConfig.calculatorChannelId}> to get instant pricing!`
                        : 'Please use the calculator commands in the designated channel.',
                    inline: false,
                },
                {
                    name: `🧮 ${commandType}`,
                    value: `\`\`\`\n${commandExample}\n\`\`\``,
                    inline: false,
                },
                {
                    name: '📋 All Calculator Commands',
                    value:
                        '**Skills (PER_LEVEL):** `!s <skill> <start>-<end>`\n' +
                        '**PvM/Bossing (PER_KILL):** `!p <boss> <kills>`\n' +
                        '**Minigames (PER_ITEM):** `!m <game> <count>`\n' +
                        '**Ironman (PER_ITEM):** `!i <item> <quantity>`\n' +
                        '**Quests (FIXED):** `!q <quest name>`',
                    inline: false,
                },
                {
                    name: '✨ Examples',
                    value:
                        '• `!s agility 70-99` - Calculate Agility 70-99\n' +
                        '• `!p cox 120` - Calculate 120 CoX kills\n' +
                        '• `!m barrows 100` - Calculate 100 Barrows runs\n' +
                        '• `!i amethyst 1000` - Calculate 1000 Amethyst\n' +
                        '• `!q cook\'s assistant` - Get quest price',
                    inline: false,
                }
            )
            .setFooter({
                text: 'Morita Gaming Services • Instant Price Calculations',
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
