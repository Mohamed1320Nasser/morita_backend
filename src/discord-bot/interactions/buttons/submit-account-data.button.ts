import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import { discordApiClient } from "../../clients/DiscordApiClient";
import logger from "../../../common/loggers";

export async function handleSubmitAccountData(interaction: ButtonInteraction): Promise<void> {
    try {
        const orderId = interaction.customId.replace("submit_account_data_", "");

        const canSubmitRes: any = await discordApiClient.get(
            `/account-data/order/${orderId}/can-submit?discordId=${interaction.user.id}`
        );
        const canSubmit = canSubmitRes.data || canSubmitRes;

        if (!canSubmit.canSubmit) {
            await interaction.reply({ content: `❌ ${canSubmit.reason}`, ephemeral: true });
            return;
        }

        // Show modal directly without account type selection
        const modal = new ModalBuilder()
            .setCustomId(`account_data_modal_${orderId}`)
            .setTitle("🔐 Submit Account Data");

        // Universal fields for all account types
        const usernameInput = new TextInputBuilder()
            .setCustomId("username")
            .setLabel("Username / Email *")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setPlaceholder("Your account username or email");

        const passwordInput = new TextInputBuilder()
            .setCustomId("password")
            .setLabel("Password *")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
            .setPlaceholder("Your account password");

        const bankPinInput = new TextInputBuilder()
            .setCustomId("bank_pin")
            .setLabel("Bank PIN (if applicable)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10)
            .setPlaceholder("e.g., 1234");

        const authCodesInput = new TextInputBuilder()
            .setCustomId("auth_codes")
            .setLabel("Authenticator / Backup Codes (if any)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
            .setPlaceholder("Enter authenticator code or backup codes");

        const additionalInfoInput = new TextInputBuilder()
            .setCustomId("additional_info")
            .setLabel("Additional Information (optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
            .setPlaceholder("Any other info the worker might need");

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(bankPinInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(authCodesInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(additionalInfoInput)
        );

        await interaction.showModal(modal as any);

        logger.info(`[SubmitAccountData] Showing modal for order ${orderId} to ${interaction.user.id}`);
    } catch (error: any) {
        logger.error("[SubmitAccountData] Error:", error);
        await interaction.reply({ content: "❌ An error occurred.", ephemeral: true });
    }
}
