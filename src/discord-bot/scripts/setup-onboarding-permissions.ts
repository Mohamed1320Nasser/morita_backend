import { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } from "discord.js";
import { discordConfig } from "../config/discord.config";
import { onboardingConfig } from "../config/onboarding.config";
import logger from "../../common/loggers";

const CHANNELS_TO_EXCLUDE_FROM_CUSTOMER = [
    onboardingConfig.tosChannelId, 
    
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

        logger.info("Logging in to Discord...");
        await client.login(discordConfig.token);

        await new Promise<void>((resolve) => {
            client.once("ready", () => {
                logger.info(`✅ Logged in as ${client.user?.tag}`);
                resolve();
            });
        });

        if (!client.user) {
            throw new Error("Client user is not available");
        }

        const guild = await client.guilds.fetch(discordConfig.guildId);
        logger.info(`✅ Found guild: ${guild.name}`);

        await guild.roles.fetch();

        const everyoneRole = guild.roles.everyone;
        logger.info(`✅ Found @everyone role (ID: ${everyoneRole.id})`);

        if (!onboardingConfig.customerRoleId) {
            throw new Error("DISCORD_CUSTOMER_ROLE_ID not configured in environment variables");
        }

        const customerRole = await guild.roles.fetch(onboardingConfig.customerRoleId);
        if (!customerRole) {
            throw new Error(`Customer role not found with ID: ${onboardingConfig.customerRoleId}`);
        }
        logger.info(`✅ Found Customer role: ${customerRole.name} (ID: ${customerRole.id})`);

        const botMember = await guild.members.fetch(client.user.id);
        const botRole = botMember.roles.highest;
        logger.info(`✅ Bot role: ${botRole.name} (ID: ${botRole.id})`);

        const channels = await guild.channels.fetch();
        logger.info(`✅ Found ${channels.size} channels`);

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

        for (const [channelId, channel] of channels) {
            
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

setupOnboardingPermissions();
