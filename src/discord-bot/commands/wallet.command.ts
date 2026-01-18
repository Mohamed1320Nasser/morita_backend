import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    User,
} from "discord.js";
import { Command } from "../types/discord.types";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { discordConfig } from "../config/discord.config";
import { createBalanceEmbed, createTransactionsEmbed } from "../utils/wallet-embeds.util";

export default {
    data: new SlashCommandBuilder()
        .setName("wallet")
        .setDescription("[Admin/Support] View any user's wallet balance and transactions")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("Target user to check wallet")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("action")
                .setDescription("What to view")
                .setRequired(false)
                .addChoices(
                    { name: "Balance", value: "balance" },
                    { name: "Transactions", value: "transactions" }
                )
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Check admin/support permission first
            if (!hasAdminPermission(interaction)) {
                await interaction.editReply({
                    content: "❌ **Permission Denied**\n\nThis command is only available for Support and Admin.\n\nUse `!w` to check your own wallet balance.\nUse `!t` to view your transaction history.",
                });
                return;
            }

            const action = (interaction.options.get("action")?.value as string) || "balance";

            const specifiedUser = interaction.options.get("user")?.user as User | undefined;

            if (!specifiedUser) {
                await interaction.editReply({
                    content: "❌ Please specify a user to check their wallet.",
                });
                return;
            }

            const targetUserInfo = { user: specifiedUser, discordId: specifiedUser.id };
            const isCheckingOtherUser = true;

            const discordId = targetUserInfo.discordId;

            if (action === "balance") {
                const response: any = await discordApiClient.get(
                    `/discord/wallets/balance/${discordId}`
                );

                const responseData = response.data || response;
                const data = responseData.data || responseData;

                const embed = createBalanceEmbed(data, {
                    isAdminView: isCheckingOtherUser,
                    targetUser: targetUserInfo.user,
                    targetDiscordId: targetUserInfo.discordId,
                });

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
            } else if (action === "transactions") {
                const response: any = await discordApiClient.get(
                    `/discord/wallets/transactions/${discordId}`,
                    { params: { limit: 10 } }
                );

                const responseData = response.data || response;
                const data = responseData.data || responseData;
                const transactions = data.list || [];

                const embed = createTransactionsEmbed(transactions, {
                    isAdminView: isCheckingOtherUser,
                    targetUser: targetUserInfo.user,
                    targetDiscordId: targetUserInfo.discordId,
                });

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
            }

            logger.info(`Wallet ${action} viewed by ${interaction.user.tag}${isCheckingOtherUser ? ` for user ${discordId}` : ''}`);
        } catch (error) {
            logger.error("Error executing wallet command:", error);

            const embed = new EmbedBuilder()
                .setTitle("❌ Error")
                .setDescription("Failed to fetch wallet information. Please try again later.")
                .setColor(0xed4245)
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
            } else {
                await interaction.reply({
                    embeds: [embed.toJSON() as any],
                    ephemeral: true,
                });
            }
        }
    },
} as Command;

function hasAdminPermission(interaction: CommandInteraction): boolean {
    const member = interaction.member;
    if (!member || !("roles" in member)) return false;

    const roles = (member.roles as any).cache;
    const isSupport = roles?.has(discordConfig.supportRoleId);
    const isAdmin = roles?.has(discordConfig.adminRoleId);

    return isSupport || isAdmin;
}
