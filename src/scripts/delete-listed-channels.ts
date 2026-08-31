import "reflect-metadata";
import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import * as fs from "fs";
import { discordConfig } from "../discord-bot/config/discord.config";

const file = process.argv[2];
const APPLY = process.argv.includes("--apply");

async function main() {
    if (!file || !fs.existsSync(file)) {
        console.error("Usage: delete-listed-channels.ts <file> [--apply]");
        process.exitCode = 1;
        return;
    }

    const entries = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter(line => line && !line.startsWith("#"))
        .map(line => {
            const [id, name] = line.split("\t");
            return { id: id?.trim(), name: name?.trim() || "" };
        })
        .filter(entry => /^\d+$/.test(entry.id || ""));

    console.log(`${entries.length} channels listed in ${file}`);

    if (!APPLY) {
        entries.slice(0, 10).forEach(e => console.log(`  ${e.id}  ${e.name}`));
        if (entries.length > 10) console.log(`  ... and ${entries.length - 10} more`);
        console.log("\nDry run. Re-run with --apply to delete these channels.");
        return;
    }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(discordConfig.token);
    await new Promise<void>(resolve => client.once("ready", () => resolve()));

    let deleted = 0;
    let failed = 0;

    for (const entry of entries) {
        try {
            const channel = await client.channels.fetch(entry.id);
            if (channel) {
                await (channel as TextChannel).delete("Client data reset");
                deleted++;
            }
        } catch (error: any) {
            failed++;
            console.error(`  failed ${entry.id} ${entry.name}: ${error?.message || error}`);
        }

        await new Promise(resolve => setTimeout(resolve, 1200));
    }

    console.log(`\nDeleted ${deleted}, failed ${failed}`);
    await client.destroy();
}

main().catch(error => {
    console.error(error?.message || error);
    process.exitCode = 1;
});
