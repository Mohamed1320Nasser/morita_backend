import { Client, Guild, PermissionFlagsBits } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import { unwrapApiData } from "../utils/apiResponse.util";
import logger from "../../common/loggers";

export interface PersonalInvite {
    inviteUrl: string;
    inviteCode: string;
    created: boolean;
}

/**
 * Returns a member's personal referral invite, creating one if needed. The
 * bot creates the invite, so Discord lists the bot as its inviter; the
 * code -> member mapping stored in the backend is what attributes joins to
 * the right referrer.
 *
 * Used by /referral and by the dashboard (admin gets a link for a user).
 * Throws "User not found" (from the backend) when the member never registered.
 */
export async function getOrCreatePersonalInvite(
    client: Client,
    guild: Guild,
    discordId: string,
    label: string = discordId
): Promise<PersonalInvite> {
    // 1. Existing mapping, if the invite still exists in Discord
    const existing = unwrapApiData<any>(
        await discordApiClient.post("/referral/invite/get-or-create", { discordId, guildId: guild.id })
    );

    if (existing?.inviteCode) {
        const liveInvites = await guild.invites.fetch();
        if (liveInvites.has(existing.inviteCode)) {
            return {
                inviteUrl: existing.inviteUrl || `https://discord.gg/${existing.inviteCode}`,
                inviteCode: existing.inviteCode,
                created: false,
            };
        }
        // Deleted or expired in Discord: retire it and hand out a new one
        await discordApiClient.post("/referral/invite/deactivate", { inviteCode: existing.inviteCode });
    }

    // 2. Create a new one
    const channel =
        guild.channels.cache.find(ch => ch.isTextBased() && (ch.name === "general" || ch.name === "welcome")) ||
        guild.channels.cache.find(ch => ch.isTextBased());

    if (!channel || !("createInvite" in channel)) {
        throw new Error("No suitable channel found for invites");
    }

    const botMember = await guild.members.fetch(client.user!.id);
    if (!botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
        throw new Error("Bot missing CREATE_INSTANT_INVITE permission");
    }

    const discordInvite = await channel.createInvite({
        maxAge: 0,
        maxUses: 0,
        unique: true,
        reason: `Personal referral invite for ${label}`,
    });

    // Snapshot it at 0 uses so the first join through it is detected
    client.inviteCache?.addInvite(guild.id, discordInvite);

    await discordApiClient.post("/referral/invite/create", {
        inviteCode: discordInvite.code,
        inviteUrl: discordInvite.url,
        discordId,
        channelId: discordInvite.channelId,
        uses: discordInvite.uses || 0,
    });

    logger.info(`[PersonalInvite] ✅ Created personal invite ${discordInvite.code} for ${label}`);
    return { inviteUrl: discordInvite.url, inviteCode: discordInvite.code, created: true };
}

/**
 * A permanent invite for a marketing campaign (KPI plan, Feature 9). Joins
 * through it are reported to the backend by guildMemberAdd.
 */
export async function createCampaignInvite(client: Client, guild: Guild, name: string) {
    const channel =
        guild.channels.cache.find(ch => ch.isTextBased() && (ch.name === "general" || ch.name === "welcome")) ||
        guild.channels.cache.find(ch => ch.isTextBased());

    if (!channel || !("createInvite" in channel)) {
        throw new Error("No suitable channel found for invites");
    }

    const botMember = await guild.members.fetch(client.user!.id);
    if (!botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
        throw new Error("Bot missing CREATE_INSTANT_INVITE permission");
    }

    const discordInvite = await channel.createInvite({
        maxAge: 0,
        maxUses: 0,
        unique: true,
        reason: `Campaign invite: ${name}`.slice(0, 500),
    });

    // Snapshot it at 0 uses so the first join through it is detected
    client.inviteCache?.addInvite(guild.id, discordInvite);

    logger.info(`[CampaignInvite] ✅ Created ${discordInvite.code} for campaign "${name}"`);
    return { inviteUrl: discordInvite.url, inviteCode: discordInvite.code };
}

