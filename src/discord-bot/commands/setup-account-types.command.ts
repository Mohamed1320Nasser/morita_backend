import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

export const data = new SlashCommandBuilder()
    .setName("setup-account-types")
    .setDescription("Initialize default account types (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        await discordApiClient.post("/account-data/types/init");

        const embed = new EmbedBuilder()
            .setTitle("✅ Account Types Initialized")
            .setDescription("Default account types have been created:")
            .addFields([
                { name: "1. Normal Legacy", value: "Username, Password, Bank PIN, Bank Value", inline: false },
                { name: "2. Jagex Launcher", value: "Username, Password, Bank PIN, Bank Value, In-Game Name, Backup Codes", inline: false },
            ])
            .setColor(0x57f287)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed.toJSON() as any] });
    } catch (error: any) {
        logger.error("[SetupAccountTypes] Error:", error);

        if (error?.response?.status === 400 || error.message?.includes("already exist")) {
            await interaction.editReply({ content: "⚠️ Account types already initialized." });
        } else {
            const content = `❌ Error: ${error?.response?.data?.message || error.message || "Unknown error"}`;
            await interaction.editReply({ content });
        }
    }
}
