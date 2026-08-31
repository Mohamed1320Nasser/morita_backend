import "reflect-metadata";
import { Client, GatewayIntentBits, ChannelType, CategoryChannel } from "discord.js";
import * as fs from "fs";
import { discordConfig } from "../discord-bot/config/discord.config";

const OUT = "ticket-channels.txt";

async function main() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(discordConfig.token);
    await new Promise<void>(resolve => client.once("ready", () => resolve()));

    const guild = await client.guilds.fetch(discordConfig.guildId);
    const channels = await guild.channels.fetch();

    const categories: Array<[string, string]> = [
        ["Orders", discordConfig.ordersCategoryId],
        ["Tickets", discordConfig.ticketCategoryId],
        ["Closed tickets", discordConfig.closedTicketsCategoryId],
    ];

    const lines: string[] = [];
    let total = 0;

    for (const [label, categoryId] of categories) {
        if (!categoryId) {
            lines.push(`# ${label}: not configured, skipped`);
            continue;
        }

        const parent = channels.find(c => c?.id === categoryId) as CategoryChannel | undefined;
        const children = channels.filter(
            c => c?.parentId === categoryId && c.type === ChannelType.GuildText
        );

        lines.push(`\n# ${label} (${parent?.name || categoryId}) - ${children.size} channels`);
        for (const channel of children.values()) {
            if (!channel) continue;
            lines.push(`${channel.id}\t${channel.name}`);
            total++;
        }
    }

    const header = [
        `# Ticket and order channels in ${guild.name}`,
        `# Generated ${new Date().toISOString()}`,
        `# ${total} channels listed`,
        "#",
        "# Review this list, then delete with:",
        `#   npx ts-node --files src/scripts/delete-listed-channels.ts ${OUT} --apply`,
    ].join("\n");

    fs.writeFileSync(OUT, header + lines.join("\n") + "\n");
    console.log(`${total} channels written to ${OUT}`);

    await client.destroy();
}

main().catch(error => {
    console.error(error?.message || error);
    process.exitCode = 1;
});
