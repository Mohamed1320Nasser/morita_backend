import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    TextChannel,
} from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

export const data = new SlashCommandBuilder()
    .setName("request-account-data")
    .setDescription("Request customer to submit account data for an order (Support)")
    .addStringOption((option) =>
        option
            .setName("order-number")
            .setDescription("Order number (e.g., 123)")
            .setRequired(true)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderNumber = interaction.options.getString("order-number", true);
        logger.info(`[RequestAccountData] Requesting account data for order #${orderNumber}`);

        // Get order details
        const orderRes: any = await discordApiClient.get(`/discord/orders/number/${orderNumber}`);
        const order = orderRes.data || orderRes;
        logger.info(`[RequestAccountData] Order response:`, JSON.stringify(order ? { id: order.id, orderNumber: order.orderNumber } : null));

        if (!order) {
            await interaction.editReply({ content: `❌ Order #${orderNumber} not found.` });
            return;
        }

        // Check if user is support or admin for this order
        const isSupport = order.support?.discordId === interaction.user.id;
        const isAdmin = interaction.memberPermissions?.has("Administrator");
        logger.info(`[RequestAccountData] Auth check - isSupport: ${isSupport}, isAdmin: ${isAdmin}`);

        if (!isSupport && !isAdmin) {
            await interaction.editReply({ content: "❌ Only the assigned support or admins can request account data." });
            return;
        }

        // Check if account types are configured
        const typesRes: any = await discordApiClient.get("/account-data/types");
        const accountTypes = typesRes.data || typesRes;
        logger.info(`[RequestAccountData] Account types count: ${accountTypes?.length || 0}`);

        if (!accountTypes || accountTypes.length === 0) {
            await interaction.editReply({
                content: "❌ No account types configured. Run `/setup-account-types` first."
            });
            return;
        }

        // Check if account data already submitted and delete it to allow resubmission
        try {
            const accountDataRes: any = await discordApiClient.get(`/account-data/order/${order.id}`);
            logger.info(`[RequestAccountData] Account data response raw:`, JSON.stringify(accountDataRes));
            const existingData = accountDataRes.data ?? accountDataRes;
            logger.info(`[RequestAccountData] Existing data:`, JSON.stringify(existingData));

            if (existingData && existingData.id) {
                // Delete existing data to allow resubmission
                logger.info(`[RequestAccountData] Account data already exists with id: ${existingData.id} - deleting to allow resubmission`);
                try {
                    await discordApiClient.delete(`/account-data/${existingData.id}`);
                    logger.info(`[RequestAccountData] Successfully deleted existing account data, customer can now resubmit`);
                } catch (deleteErr: any) {
                    logger.error(`[RequestAccountData] Error deleting existing data:`, deleteErr.message);
                    await interaction.editReply({
                        content: `❌ Failed to delete existing account data: ${deleteErr?.response?.data?.message || deleteErr.message}`
                    });
                    return;
                }
            }
        } catch (err: any) {
            logger.info(`[RequestAccountData] Error checking existing data: status=${err?.response?.status}, message=${err.message}`);
            // 404 means no data exists, which is fine
            if (err?.response?.status !== 404) {
                logger.warn("[RequestAccountData] Error checking existing data:", err.message);
            }
        }

        logger.info(`[RequestAccountData] Sending button for order ${order.id}`);

        // Send the button to the current channel
        const channel = interaction.channel as TextChannel;

        const embed = new EmbedBuilder()
            .setTitle("🔐 Account Data Required")
            .setDescription(
                `<@${order.customer.discordId}>, please submit your account credentials for **Order #${order.orderNumber}**.\n\n` +
                "**Your data is encrypted and can only be viewed once by the worker/support.**\n\n" +
                "**Please select your account type:**"
            )
            .setColor(0x5865f2)
            .setFooter({ text: `Order #${order.orderNumber}` })
            .setTimestamp();

        // Two buttons - one for each account type
        const normalLegacyButton = new ButtonBuilder()
            .setCustomId(`submit_account_normal_legacy_${order.id}`)
            .setLabel("📦 Normal Legacy")
            .setStyle(ButtonStyle.Primary);

        const jagexLauncherButton = new ButtonBuilder()
            .setCustomId(`submit_account_jagex_launcher_${order.id}`)
            .setLabel("🚀 Jagex Launcher")
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(normalLegacyButton, jagexLauncherButton);

        await channel.send({
            content: `<@${order.customer.discordId}>`,
            embeds: [embed.toJSON() as any],
            components: [row.toJSON() as any],
        });

        await interaction.editReply({ content: `✅ Account data request sent for Order #${orderNumber}.` });

        logger.info(`[RequestAccountData] Support ${interaction.user.id} requested account data for Order #${orderNumber}`);
    } catch (error: any) {
        logger.error("[RequestAccountData] Error:", error);
        const content = `❌ Error: ${error?.response?.data?.message || error.message || "Unknown error"}`;
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content });
        } else {
            await interaction.reply({ content, ephemeral: true });
        }
    }
}
