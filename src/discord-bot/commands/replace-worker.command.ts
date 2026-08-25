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

export default {
    data: new SlashCommandBuilder()
        .setName("replace-worker")
        .setDescription("[ADMIN] Replace the worker on an order")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) =>
            option
                .setName("order-number")
                .setDescription("The order number to reassign")
                .setRequired(true)
        )
        .addUserOption((option) =>
            option
                .setName("new-worker")
                .setDescription("The worker taking over")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Why the worker is being replaced")
                .setRequired(true)
                .setMaxLength(500)
        )
        .addBooleanOption((option) =>
            option
                .setName("penalize")
                .setDescription("Forfeit the old worker's deposit (default: no, it is returned)")
                .setRequired(false)
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
                    content: "❌ Only admins can replace a worker - this moves deposits between wallets.",
                });
                return;
            }

            const orderNumber = interaction.options.getString("order-number", true).replace("#", "").trim();
            const newWorker = interaction.options.getUser("new-worker", true);
            const reason = interaction.options.getString("reason", true);
            const penalize = interaction.options.getBoolean("penalize") ?? false;

            if (newWorker.bot) {
                await interaction.editReply({ content: "❌ A bot cannot be assigned as a worker." });
                return;
            }

            const lookup = await discordApiClient.get(`/discord/orders/number/${orderNumber}`);
            const order = lookup?.data?.data || lookup?.data;

            if (!order?.id) {
                await interaction.editReply({ content: `❌ Order #${orderNumber} not found.` });
                return;
            }

            const response = await discordApiClient.put(
                `/discord/orders/${order.id}/replace-worker`,
                {
                    newWorkerDiscordId: newWorker.id,
                    replacedByDiscordId: interaction.user.id,
                    reason,
                    penalizeOldWorker: penalize,
                }
            );

            const result = response?.data?.data || response?.data;
            const previousWorker = order.worker?.discordId
                ? `<@${order.worker.discordId}>`
                : order.worker?.fullname || "Previous worker";
            const deposit = parseFloat(order.depositAmount || 0).toFixed(2);

            const embed = new EmbedBuilder()
                .setTitle("🔄 Worker Replaced")
                .setDescription(`Order **#${order.orderNumber}** has been reassigned.`)
                .addFields([
                    { name: "👤 Previous Worker", value: previousWorker, inline: true },
                    { name: "👷 New Worker", value: `<@${newWorker.id}>`, inline: true },
                    {
                        name: "💰 Deposit",
                        value: penalize
                            ? `$${deposit} forfeited`
                            : `$${deposit} returned`,
                        inline: true,
                    },
                    { name: "📝 Reason", value: reason, inline: false },
                ])
                .setColor(penalize ? 0xed4245 : 0x5865f2)
                .setFooter({ text: "The new worker must start the job to continue" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed.toJSON() as any] });

            // Tell the incoming worker directly - they are now on the hook for
            // the deposit and would otherwise only find out from the channel.
            try {
                const dm = new EmbedBuilder()
                    .setTitle("📋 You have been assigned to an order")
                    .setDescription(
                        `You are now the worker on order **#${order.orderNumber}**.\n\n` +
                        `A security deposit of **$${deposit}** has been locked from your wallet.`
                    )
                    .addFields([{ name: "📝 Reason for reassignment", value: reason, inline: false }])
                    .setColor(0xfca311)
                    .setTimestamp();

                await newWorker.send({ embeds: [dm.toJSON() as any] });
            } catch (dmError) {
                logger.warn(`[ReplaceWorker] Could not DM new worker:`, dmError);
            }

            if (order.worker?.discordId) {
                try {
                    const oldWorkerUser = await interaction.client.users.fetch(order.worker.discordId);
                    const dm = new EmbedBuilder()
                        .setTitle("🔄 You have been removed from an order")
                        .setDescription(
                            `You are no longer the worker on order **#${order.orderNumber}**.`
                        )
                        .addFields([
                            {
                                name: "💰 Your Deposit",
                                value: penalize
                                    ? `$${deposit} has been forfeited.`
                                    : `$${deposit} has been returned to your wallet.`,
                                inline: false,
                            },
                            { name: "📝 Reason", value: reason, inline: false },
                        ])
                        .setColor(penalize ? 0xed4245 : 0xfee75c)
                        .setTimestamp();

                    await oldWorkerUser.send({ embeds: [dm.toJSON() as any] });
                } catch (dmError) {
                    logger.warn(`[ReplaceWorker] Could not DM previous worker:`, dmError);
                }
            }

            // A replacement is a performance signal, so record it against the
            // outgoing worker's KPIs the same way manual feedback would.
            if (order.worker?.discordId) {
                try {
                    await discordApiClient.post("/worker-feedback/discord", {
                        workerDiscordId: order.worker.discordId,
                        authorDiscordId: interaction.user.id,
                        type: penalize ? "WARNING" : "NOTE",
                        comment: `Replaced on order #${order.orderNumber}: ${reason}`,
                        orderId: order.id,
                    });
                } catch (feedbackError) {
                    logger.warn(`[ReplaceWorker] Could not record feedback:`, feedbackError);
                }
            }

            logger.info(
                `[ReplaceWorker] Order #${order.orderNumber} reassigned to ${newWorker.tag} by ${interaction.user.tag}`
            );
        } catch (error: any) {
            logger.error("[ReplaceWorker] Error:", error);
            await interaction.editReply({
                content: `❌ Failed to replace worker: ${extractErrorMessage(error)}`,
            });
        }
    },
};
