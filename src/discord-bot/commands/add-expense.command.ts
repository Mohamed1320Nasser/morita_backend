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

const CATEGORY_LABELS: Record<string, string> = {
    SERVER_HOSTING: "🖥️ Server Hosting",
    PAYMENT_FEES: "💳 Payment Fees",
    MARKETING: "📣 Marketing",
    SOFTWARE_LICENSES: "🔑 Software Licenses",
    DISCORD_BOT: "🤖 Discord Bot",
    MODERATION: "🛡️ Moderation",
    REFUNDS: "↩️ Refunds",
    CHARGEBACKS: "⚠️ Chargebacks",
    WITHDRAWAL_FEES: "🏦 Withdrawal Fees",
    OTHER: "📦 Other",
};

export default {
    data: new SlashCommandBuilder()
        .setName("add-expense")
        .setDescription("[ADMIN] Record an operational expense paid outside an order")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addNumberOption((option) =>
            option
                .setName("amount")
                .setDescription("Amount spent in USD")
                .setRequired(true)
                .setMinValue(0.01)
        )
        .addStringOption((option) =>
            option
                .setName("category")
                .setDescription("What kind of expense")
                .setRequired(true)
                .addChoices(
                    ...Object.entries(CATEGORY_LABELS).map(([value, name]) => ({
                        name,
                        value,
                    }))
                )
        )
        .addStringOption((option) =>
            option
                .setName("description")
                .setDescription("What was this for")
                .setRequired(true)
                .setMaxLength(500)
        )
        .addStringOption((option) =>
            option
                .setName("date")
                .setDescription("Date of the expense as YYYY-MM-DD (default: today)")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("reference")
                .setDescription("Invoice or receipt number (optional)")
                .setRequired(false)
                .setMaxLength(100)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const member = interaction.member;
            const isAdmin =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.adminRoleId);

            if (!isAdmin) {
                await interaction.editReply({
                    content: "❌ Only admins can record expenses - this changes reported profit.",
                });
                return;
            }

            const amount = interaction.options.getNumber("amount", true);
            const category = interaction.options.getString("category", true);
            const description = interaction.options.getString("description", true);
            const dateInput = interaction.options.getString("date");
            const reference = interaction.options.getString("reference");

            // Round to cents - the column is Decimal(18,2) and would otherwise
            // silently truncate whatever extra precision was typed.
            const rounded = Math.round(amount * 100) / 100;

            if (rounded <= 0) {
                await interaction.editReply({ content: "❌ Amount must be greater than zero." });
                return;
            }

            let expenseDate = new Date();
            if (dateInput) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
                    await interaction.editReply({
                        content: "❌ Date must be in YYYY-MM-DD format (for example 2026-08-24).",
                    });
                    return;
                }

                const parsed = new Date(`${dateInput.trim()}T00:00:00.000Z`);
                if (isNaN(parsed.getTime())) {
                    await interaction.editReply({ content: "❌ That date is not valid." });
                    return;
                }
                expenseDate = parsed;
            }

            await discordApiClient.post("/discord/expenses", {
                category,
                amount: rounded,
                description,
                date: expenseDate.toISOString(),
                reference: reference || undefined,
                createdByDiscordId: interaction.user.id,
            });

            const embed = new EmbedBuilder()
                .setTitle("💸 Expense Recorded")
                .setDescription("This expense now counts against net profit in the KPI dashboard.")
                .addFields([
                    { name: "💰 Amount", value: `$${rounded.toFixed(2)} USD`, inline: true },
                    {
                        name: "🗂️ Category",
                        value: CATEGORY_LABELS[category] || category,
                        inline: true,
                    },
                    {
                        name: "📅 Date",
                        value: expenseDate.toISOString().substring(0, 10),
                        inline: true,
                    },
                    { name: "📝 Description", value: description, inline: false },
                    ...(reference
                        ? [{ name: "🧾 Reference", value: reference, inline: false }]
                        : []),
                ])
                .setColor(0xed4245)
                .setFooter({ text: `Recorded by ${interaction.user.username}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed.toJSON() as any] });

            logger.info(
                `[AddExpense] ${category} $${rounded.toFixed(2)} recorded by ${interaction.user.tag}`
            );
        } catch (error: any) {
            logger.error("[AddExpense] Error:", error);
            await interaction.editReply({
                content: `❌ Failed to record expense: ${extractErrorMessage(error)}`,
            });
        }
    },
};
