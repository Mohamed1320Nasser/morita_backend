import { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } from "discord.js";
import { discordConfig } from "../config/discord.config";
import { onboardingConfig } from "../config/onboarding.config";
import logger from "../../common/loggers";

/**
 * This script automatically configures Discord channel permissions for the onboarding flow.
 *
 * What it does:
 * 1. Finds @everyone role and Customer role
 * 2. Sets up #TERMS-OF-SERVICES channel permissions
 * 3. Configures all other channels to be hidden from @everyone, visible to Customer role
 *
 * Run this script with: npm run setup:permissions
 */

const CHANNELS_TO_EXCLUDE_FROM_CUSTOMER = [
    onboardingConfig.tosChannelId, // TOS channel - only visible to new members
    // Add other admin/staff-only channels here if needed
];

async function setupOnboardingPermissions() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
        ],
    });

    try {
        logger.info("=== Starting Discord Onboarding Permissions Setup ===");

        // Login to Discord
        logger.info("Logging in to Discord...");
        await client.login(discordConfig.token);

        // Wait for client to be ready
        await new Promise<void>((resolve) => {
            client.once("ready", () => {
                logger.info(`✅ Logged in as ${client.user?.tag}`);
                resolve();
            });
        });

        if (!client.user) {
            throw new Error("Client user is not available");
        }

        // Get the guild
        const guild = await client.guilds.fetch(discordConfig.guildId);
        logger.info(`✅ Found guild: ${guild.name}`);

        // Fetch all roles
        await guild.roles.fetch();

        // Get @everyone role (always exists, ID = guild.id)
        const everyoneRole = guild.roles.everyone;
        logger.info(`✅ Found @everyone role (ID: ${everyoneRole.id})`);

        // Get Customer role
        if (!onboardingConfig.customerRoleId) {
            throw new Error("DISCORD_CUSTOMER_ROLE_ID not configured in environment variables");
        }

        const customerRole = await guild.roles.fetch(onboardingConfig.customerRoleId);
        if (!customerRole) {
            throw new Error(`Customer role not found with ID: ${onboardingConfig.customerRoleId}`);
        }
        logger.info(`✅ Found Customer role: ${customerRole.name} (ID: ${customerRole.id})`);

        // Get Bot role (current bot's highest role)
        const botMember = await guild.members.fetch(client.user.id);
        const botRole = botMember.roles.highest;
        logger.info(`✅ Bot role: ${botRole.name} (ID: ${botRole.id})`);

        // Fetch all channels
        const channels = await guild.channels.fetch();
        logger.info(`✅ Found ${channels.size} channels`);

        // Get TOS channel
        if (!onboardingConfig.tosChannelId) {
            throw new Error("DISCORD_TOS_CHANNEL_ID not configured in environment variables");
        }

        const tosChannel = channels.get(onboardingConfig.tosChannelId);
        if (!tosChannel) {
            throw new Error(`TOS channel not found with ID: ${onboardingConfig.tosChannelId}`);
        }
        logger.info(`✅ Found TOS channel: ${tosChannel.name}`);

        logger.info("\n--- Configuring Channel Permissions ---\n");

        let updatedChannels = 0;

        // Configure each channel
        for (const [channelId, channel] of channels) {
            // Skip non-text channels (categories, voice, etc.) for now
            if (
                !channel ||
                channel.type === ChannelType.GuildCategory ||
                channel.type === ChannelType.GuildVoice ||
                channel.type === ChannelType.GuildStageVoice
            ) {
                continue;
            }

            const isTosChannel = channelId === onboardingConfig.tosChannelId;

            try {
                logger.info(`Configuring: #${channel.name}`);

                if (isTosChannel) {
                    // TOS Channel: @everyone can view (read-only), Customer cannot view
                    await channel.permissionOverwrites.set([
                        {
                            id: everyoneRole.id,
                            allow: [PermissionFlagsBits.ViewChannel],
                            deny: [
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.SendMessagesInThreads,
                                PermissionFlagsBits.CreatePublicThreads,
                                PermissionFlagsBits.CreatePrivateThreads,
                                PermissionFlagsBits.AddReactions,
                            ],
                        },
                        {
                            id: customerRole.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: botRole.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ManageMessages,
                                PermissionFlagsBits.EmbedLinks,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.ReadMessageHistory,
                            ],
                        },
                    ]);

                    logger.info(`  ✅ #${channel.name}: @everyone can view (read-only), Customer hidden`);
                } else {
                    // All other channels: @everyone cannot view, Customer can view
                    await channel.permissionOverwrites.set([
                        {
                            id: everyoneRole.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: customerRole.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AddReactions,
                            ],
                        },
                        {
                            id: botRole.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ManageMessages,
                                PermissionFlagsBits.EmbedLinks,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.ReadMessageHistory,
                            ],
                        },
                    ]);

                    logger.info(`  ✅ #${channel.name}: @everyone hidden, Customer can view`);
                }

                updatedChannels++;
            } catch (error: any) {
                logger.error(`  ❌ Failed to configure #${channel.name}: ${error.message}`);
            }
        }

        logger.info(`\n✅ Successfully configured ${updatedChannels} channels`);

        logger.info("\n=== Onboarding Permissions Setup Complete ===");
        logger.info("\nNew Member Experience:");
        logger.info("1. New member joins → Can ONLY see #TERMS-OF-SERVICES");
        logger.info("2. Accepts TOS → Completes questionnaire");
        logger.info("3. Gets Customer role → All channels appear");
        logger.info("\nTest with a new account to verify!\n");

    } catch (error: any) {
        logger.error("❌ Setup failed:", error.message);
        logger.error(error.stack);
        process.exit(1);
    } finally {
        await client.destroy();
        process.exit(0);
    }
}

// Run the script
setupOnboardingPermissions();
