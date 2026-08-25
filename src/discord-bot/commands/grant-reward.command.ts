import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";
import { discordConfig } from "../config/discord.config";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("grant-reward")
        .setDescription("Grant a reward to a customer by hand (Support/Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Customer receiving the reward")
                .setRequired(true)
        )
        .addNumberOption(option =>
            option
                .setName("amount")
                .setDescription("Amount to grant (USD)")
                .setRequired(true)
                .setMinValue(0.01)
                .setMaxValue(500)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Why this reward is being granted")
                .setRequired(false)
                .setMaxLength(200)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const member = interaction.member;
            const isSupport =
                member && "roles" in member && (member.roles as any).cache?.has(discordConfig.supportRoleId);
            const isAdmin =
                member && "roles" in member && (member.roles as any).cache?.has(discordConfig.adminRoleId);

            if (!isSupport && !isAdmin) {
                await interaction.editReply({
                    content: "❌ Only support staff and admins can grant rewards.",
                });
                return;
            }

            const target = interaction.options.getUser("user", true);
            const amount = interaction.options.getNumber("amount", true);
            const reason = interaction.options.getString("reason") || undefined;

            if (target.bot) {
                await interaction.editReply({ content: "❌ Rewards cannot be granted to bots." });
                return;
            }

            if (target.id === interaction.user.id) {
                await interaction.editReply({
                    content: "❌ You cannot grant a reward to yourself.",
                });
                return;
            }

            if (Number(amount.toFixed(2)) !== amount) {
                await interaction.editReply({
                    content: "❌ Amount cannot have more than two decimal places.",
                });
                return;
            }

            const response = await discordApiClient.post("/order-reward/grant", {
                discordId: target.id,
                amount,
                reason,
                grantedByDiscordId: interaction.user.id,
            });

            const result = response.data?.data || response.data;

            if (!result?.success) {
                await interaction.editReply({
                    content: `❌ **Could not grant reward**\n\n${result?.message || "Please try again."}`,
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle("✅ Reward Granted")
                .setColor(0xfca311)
                .addFields(
                    { name: "Customer", value: `<@${target.id}>`, inline: true },
                    { name: "Amount", value: `$${result.rewardAmount.toFixed(2)}`, inline: true },
                    { name: "New Balance", value: `$${Number(result.newBalance).toFixed(2)}`, inline: true }
                )
                .setFooter({ text: `Granted by ${interaction.user.username}` })
                .setTimestamp();

            if (reason) {
                embed.addFields({ name: "Reason", value: reason, inline: false });
            }

            await interaction.editReply({ embeds: [embed.toJSON() as any] });

            // Tell the customer their balance changed. A failed DM (closed DMs)
            // must not make the grant look unsuccessful, since the money moved.
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle("🎁 You received a reward!")
                    .setDescription(
                        `**$${result.rewardAmount.toFixed(2)}** has been added to your wallet.` +
                            (reason ? `\n\n**Reason:** ${reason}` : "")
                    )
                    .setColor(0xfca311)
                    .setFooter({ text: "Use /w to see your balance" })
                    .setTimestamp();

                await target.send({ embeds: [dmEmbed.toJSON() as any] });
            } catch {
                await interaction.followUp({
                    content: "⚠️ Reward granted, but I could not DM the customer (their DMs may be closed).",
                    ephemeral: true,
                });
            }

            logger.info(
                `[GrantReward] ${interaction.user.tag} granted $${amount} to ${target.tag}` +
                    `${reason ? ` (${reason})` : ""}`
            );
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                error?.response?.data?.data?.message ||
                error?.message ||
                "Unexpected error";

            logger.error("[GrantReward] Failed:", error?.response?.data || error);

            await interaction.editReply({
                content: `❌ **Could not grant reward**\n\n${message}`,
            });
        }
    },
};
