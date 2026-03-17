import { Client, GatewayIntentBits, Invite } from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

/**
 * Script to fetch and display all Discord invites in the server
 * This helps you see all current invites, their usage, and who created them
 *
 * Usage:
 *   npx ts-node src/discord-bot/scripts/fetch-discord-invites.ts
 */
async function fetchDiscordInvites() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildInvites,
        ],
    });

    try {
        logger.info("=== Fetching Discord Invites ===\n");

        logger.info("Logging in to Discord...");
        await client.login(discordConfig.token);

        await new Promise<void>((resolve) => {
            client.once("ready", () => {
                logger.info(`✅ Logged in as ${client.user?.tag}\n`);
                resolve();
            });
        });

        if (!client.user) {
            throw new Error("Client user is not available");
        }

        const guild = await client.guilds.fetch(discordConfig.guildId);
        logger.info(`✅ Found guild: ${guild.name}`);
        logger.info(`   Guild ID: ${guild.id}\n`);

        // Fetch all invites
        logger.info("Fetching all invites...");
        const invites = await guild.invites.fetch();
        logger.info(`✅ Found ${invites.size} invite(s)\n`);

        if (invites.size === 0) {
            logger.info("❌ No invites found in this server.");
            logger.info("   Create an invite in Discord first, then run this script again.\n");
        } else {
            logger.info("=== Invite Details ===\n");

            // Sort invites by creation date (newest first)
            const sortedInvites = Array.from(invites.values()).sort((a, b) => {
                const dateA = a.createdAt?.getTime() || 0;
                const dateB = b.createdAt?.getTime() || 0;
                return dateB - dateA;
            });

            sortedInvites.forEach((invite: Invite, index: number) => {
                logger.info(`--- Invite #${index + 1} ---`);
                logger.info(`Code:        ${invite.code}`);
                logger.info(`URL:         ${invite.url}`);
                logger.info(`Channel:     #${invite.channel?.name || 'Unknown'} (${invite.channelId})`);
                logger.info(`Inviter:     ${invite.inviter?.tag || 'Unknown'} (${invite.inviter?.id || 'N/A'})`);
                logger.info(`Uses:        ${invite.uses || 0}${invite.maxUses ? ` / ${invite.maxUses}` : ' (unlimited)'}`);
                logger.info(`Max Age:     ${invite.maxAge === 0 ? 'Never expires' : `${invite.maxAge} seconds`}`);
                logger.info(`Temporary:   ${invite.temporary ? 'Yes' : 'No'}`);
                logger.info(`Created:     ${invite.createdAt?.toISOString() || 'Unknown'}`);
                logger.info(`Expires:     ${invite.expiresAt?.toISOString() || 'Never'}`);
                logger.info("");
            });

            // Summary statistics
            logger.info("=== Summary ===");
            logger.info(`Total Invites:        ${invites.size}`);
            logger.info(`Total Uses:           ${sortedInvites.reduce((sum, inv) => sum + (inv.uses || 0), 0)}`);
            logger.info(`Never Expire:         ${sortedInvites.filter(inv => inv.maxAge === 0).length}`);
            logger.info(`Unlimited Uses:       ${sortedInvites.filter(inv => !inv.maxUses || inv.maxUses === 0).length}`);
            logger.info(`Temporary Membership: ${sortedInvites.filter(inv => inv.temporary).length}`);
            logger.info("");

            // Group by inviter
            const byInviter = new Map<string, Invite[]>();
            sortedInvites.forEach(invite => {
                const inviterTag = invite.inviter?.tag || 'Unknown';
                if (!byInviter.has(inviterTag)) {
                    byInviter.set(inviterTag, []);
                }
                byInviter.get(inviterTag)!.push(invite);
            });

            logger.info("=== By Inviter ===");
            Array.from(byInviter.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .forEach(([inviter, invitesList]) => {
                    const totalUses = invitesList.reduce((sum, inv) => sum + (inv.uses || 0), 0);
                    logger.info(`${inviter}: ${invitesList.length} invite(s), ${totalUses} total use(s)`);
                });
            logger.info("");
        }

        logger.info("=== Script Complete ===\n");

    } catch (error: any) {
        logger.error("❌ Script failed:", error.message);
        logger.error(error.stack);
        process.exit(1);
    } finally {
        await client.destroy();
        process.exit(0);
    }
}

fetchDiscordInvites();
