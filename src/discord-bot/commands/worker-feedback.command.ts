import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";
import { discordConfig } from "../config/discord.config";
import { discordApiClient } from "../clients/DiscordApiClient";
import { extractErrorMessage } from "../utils/error-message.util";
import logger from "../../common/loggers";

const TYPE_LOOK: Record<string, { label: string; emoji: string; colour: number }> = {
    PRAISE: { label: "Praise", emoji: "🌟", colour: 0x57f287 },
    WARNING: { label: "Warning", emoji: "⚠️", colour: 0xed4245 },
    NOTE: { label: "Note", emoji: "📝", colour: 0x5865f2 },
};

export default {
    data: new SlashCommandBuilder()
        .setName("worker-feedback")
        .setDescription("Record feedback on a worker (Support/Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option =>
            option
                .setName("worker")
                .setDescription("The worker this feedback is about")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("What kind of feedback")
                .setRequired(true)
                .addChoices(
                    { name: "🌟 Praise", value: "PRAISE" },
                    { name: "⚠️ Warning", value: "WARNING" },
                    { name: "📝 Note", value: "NOTE" }
                )
        )
        .addStringOption(option =>
            option
                .setName("comment")
                .setDescription("What happened")
                .setRequired(true)
                .setMaxLength(500)
        )
        .addIntegerOption(option =>
            option
                .setName("rating")
                .setDescription("Optional score out of 5")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(5)
        )
        .addStringOption(option =>
            option
                .setName("order")
                .setDescription("Order ID this concerns (optional)")
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const member = interaction.member;
            const isSupport =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.supportRoleId);
            const isAdmin =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.adminRoleId);

            if (!isSupport && !isAdmin) {
                await interaction.editReply({
                    content: "❌ Only support staff and admins can record worker feedback.",
                });
                return;
            }

            const worker = interaction.options.getUser("worker", true);
            const type = interaction.options.getString("type", true);
            const comment = interaction.options.getString("comment", true);
            const rating = interaction.options.getInteger("rating");
            const orderId = interaction.options.getString("order");

            if (worker.bot) {
                await interaction.editReply({
                    content: "❌ Feedback cannot be recorded against a bot.",
                });
                return;
            }

            await discordApiClient.post("/worker-feedback/discord", {
                workerDiscordId: worker.id,
                authorDiscordId: interaction.user.id,
                type,
                comment,
                rating: rating ?? undefined,
                orderId: orderId || undefined,
            });

            const look = TYPE_LOOK[type] || TYPE_LOOK.NOTE;

            const embed = new EmbedBuilder()
                .setTitle(`${look.emoji} ${look.label} recorded`)
                .setDescription(
                    `Feedback saved for <@${worker.id}>.\n\n` +
                    `> ${comment}` +
                    (rating ? `\n\n⭐ **Rating:** ${rating}/5` : "")
                )
                .setColor(look.colour)
                .setFooter({ text: "Visible to admins in Worker Performance" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed.toJSON() as any] });

            logger.info(
                `[WorkerFeedback] ${type} recorded for ${worker.tag} by ${interaction.user.tag}`
            );
        } catch (error: any) {
            logger.error("[WorkerFeedback] Error:", error);
            await interaction.editReply({
                content: `❌ Failed: ${extractErrorMessage(error)}`,
            });
        }
    },
};
