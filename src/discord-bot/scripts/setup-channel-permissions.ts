import { Client, GatewayIntentBits, PermissionsBitField, ChannelType } from "discord.js";
import logger from "../../common/loggers";
import dotenv from "dotenv";

dotenv.config();

const PERMISSION_TEMPLATES = {
    
    PUBLIC_CUSTOMER: {
        "@everyone": {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true,
        },
        CUSTOMER: {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
            AddReactions: true,
        },
    },

    PUBLIC_READONLY: {
        "@everyone": {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true,
        },
    },

    CUSTOMER_ONLY: {
        "@everyone": {
            ViewChannel: false,
        },
        CUSTOMER: {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
            AddReactions: true,
        },
        WORKER: {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
            AddReactions: true,
        },
    },

    WORKER_ONLY: {
        "@everyone": {
            ViewChannel: false,
        },
        WORKER: {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
            AddReactions: true,
        },
    },

    STAFF_ONLY: {
        "@everyone": {
            ViewChannel: false,
        },
        SUPPORT: {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
            AddReactions: true,
            ManageMessages: true,
        },
        ADMIN: {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true,
            AddReactions: true,
            ManageMessages: true,
            ManageChannels: true,
        },
    },
};

interface ChannelConfig {
    envKey: string;
    name: string;
    template: keyof typeof PERMISSION_TEMPLATES;
    description: string;
}

const CHANNEL_CONFIGS: ChannelConfig[] = [
    {
        envKey: "DISCORD_TOS_CHANNEL_ID",
        name: "terms-of-service",
        template: "PUBLIC_READONLY",
        description: "Everyone can see TOS, no one can chat",
    },
    {
        envKey: "DISCORD_GENERAL_CHANNEL_ID",
        name: "general",
        template: "PUBLIC_CUSTOMER",
        description: "Everyone can see, Customers+ can chat",
    },
    {
        envKey: "DISCORD_ANNOUNCEMENTS_CHANNEL_ID",
        name: "announcements",
        template: "PUBLIC_READONLY",
        description: "Everyone can see announcements, no one can chat",
    },
    {
        envKey: "DISCORD_PRICING_CHANNEL_ID",
        name: "pricing",
        template: "CUSTOMER_ONLY",
        description: "Customers + Workers can see and interact",
    },
    {
        envKey: "DISCORD_CALCULATOR_CHANNEL_ID",
        name: "calculator",
        template: "CUSTOMER_ONLY",
        description: "Customers + Workers can see and interact",
    },
    {
        envKey: "DISCORD_JOB_CLAIMING_CHANNEL_ID",
        name: "job-claiming",
        template: "WORKER_ONLY",
        description: "Only Workers can see and claim jobs",
    },
    {
        envKey: "DISCORD_COMPLETED_ORDERS_CHANNEL_ID",
        name: "completed-orders",
        template: "STAFF_ONLY",
        description: "Only Support/Admin can see completed orders",
    },
    {
        envKey: "DISCORD_REVIEWS_CHANNEL_ID",
        name: "reviews",
        template: "STAFF_ONLY",
        description: "Only Support/Admin can see reviews",
    },
    {
        envKey: "DISCORD_LOGS_CHANNEL_ID",
        name: "logs",
        template: "STAFF_ONLY",
        description: "Only Support/Admin can see logs",
    },
    {
        envKey: "DISCORD_ISSUES_CHANNEL_ID",
        name: "report-issues",
        template: "STAFF_ONLY",
        description: "Only Support/Admin can see reported issues",
    },
];

function getPermissionFlag(permName: string): bigint {
    const permMap: { [key: string]: bigint } = {
        ViewChannel: PermissionsBitField.Flags.ViewChannel,
        SendMessages: PermissionsBitField.Flags.SendMessages,
        ReadMessageHistory: PermissionsBitField.Flags.ReadMessageHistory,
        AttachFiles: PermissionsBitField.Flags.AttachFiles,
        EmbedLinks: PermissionsBitField.Flags.EmbedLinks,
        AddReactions: PermissionsBitField.Flags.AddReactions,
        ManageMessages: PermissionsBitField.Flags.ManageMessages,
        ManageChannels: PermissionsBitField.Flags.ManageChannels,
    };

    return permMap[permName] || 0n;
}

function previewPermissions(dryRun: boolean = true) {

    CHANNEL_CONFIGS.forEach((config, index) => {
        const channelId = process.env[config.envKey];
        const template = PERMISSION_TEMPLATES[config.template];

        Object.entries(template).forEach(([roleKey, perms]) => {
            let roleName = roleKey;
            if (roleKey === "CUSTOMER") roleName = "Customer Role";
            if (roleKey === "WORKER") roleName = "Worker Role";
            if (roleKey === "SUPPORT") roleName = "Support Role";
            if (roleKey === "ADMIN") roleName = "Admin Role";

            Object.entries(perms).forEach(([perm, value]) => {
                const icon = value ? "✅" : "❌";
            });
        });
    });

    if (dryRun) {
    } else {
    }
}

async function applyPermissions(client: Client) {
    const guild = client.guilds.cache.first();
    if (!guild) {
        logger.error("[Permissions] No guild found");
        return;
    }

    logger.info(`[Permissions] Configuring permissions for guild: ${guild.name}`);

    const roleMap = {
        CUSTOMER: process.env.DISCORD_CUSTOMER_ROLE_ID,
        WORKER: process.env.DISCORD_WORKERS_ROLE_ID,
        SUPPORT: process.env.DISCORD_SUPPORT_ROLE_ID,
        ADMIN: process.env.DISCORD_ADMIN_ROLE_ID,
    };

    let successCount = 0;
    let errorCount = 0;

    for (const config of CHANNEL_CONFIGS) {
        const channelId = process.env[config.envKey];
        if (!channelId) {
            logger.warn(`[Permissions] Skipping ${config.name} - no channel ID in .env`);
            continue;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            logger.error(`[Permissions] Channel not found: ${config.name} (${channelId})`);
            errorCount++;
            continue;
        }

        if (channel.type !== ChannelType.GuildText) {
            logger.warn(`[Permissions] Skipping ${config.name} - not a text channel`);
            continue;
        }

        try {
            logger.info(`[Permissions] Configuring #${config.name}...`);

            const template = PERMISSION_TEMPLATES[config.template];
            const overwrites: any[] = [];

            for (const [roleKey, permissions] of Object.entries(template)) {
                let targetId: string;

                if (roleKey === "@everyone") {
                    targetId = guild.id;
                } else {
                    const roleId = roleMap[roleKey as keyof typeof roleMap];
                    if (!roleId) {
                        logger.warn(`[Permissions] Role ${roleKey} not set in .env, skipping`);
                        continue;
                    }
                    targetId = roleId;
                }

                const allow: bigint[] = [];
                const deny: bigint[] = [];

                for (const [permName, value] of Object.entries(permissions)) {
                    const flag = getPermissionFlag(permName);
                    if (value) {
                        allow.push(flag);
                    } else {
                        deny.push(flag);
                    }
                }

                overwrites.push({
                    id: targetId,
                    allow: allow,
                    deny: deny,
                });
            }

            await channel.permissionOverwrites.set(overwrites);

            logger.info(`[Permissions] ✅ Successfully configured #${config.name}`);
            successCount++;
        } catch (error: any) {
            logger.error(`[Permissions] ❌ Failed to configure #${config.name}: ${error.message}`);
            errorCount++;
        }
    }

    logger.info(`\n[Permissions] Configuration complete: ${successCount} successful, ${errorCount} failed`);
}

async function main() {
    const args = process.argv.slice(2);
    const applyMode = args.includes("--apply");

    if (!applyMode) {
        
        previewPermissions(true);
        return;
    }

    previewPermissions(false);

    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    client.once("ready", async () => {
        logger.info(`[Permissions] Bot connected as ${client.user?.tag}`);

        try {
            await applyPermissions(client);
        } catch (error) {
            logger.error("[Permissions] Fatal error:", error);
        } finally {
            client.destroy();
            process.exit(0);
        }
    });

    await client.login(process.env.DISCORD_BOT_TOKEN);
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
