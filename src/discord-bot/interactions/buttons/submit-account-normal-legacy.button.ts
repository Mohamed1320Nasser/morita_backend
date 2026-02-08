import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import { discordApiClient } from "../../clients/DiscordApiClient";
import logger from "../../../common/loggers";

export async function handleSubmitAccountNormalLegacy(interaction: ButtonInteraction): Promise<void> {
    try {
        const orderId = interaction.customId.replace("submit_account_normal_legacy_", "");

        const canSubmitRes: any = await discordApiClient.get(
            `/account-data/order/${orderId}/can-submit?discordId=${interaction.user.id}`
        );
        const canSubmit = canSubmitRes.data || canSubmitRes;

        if (!canSubmit.canSubmit) {
            await interaction.reply({ content: `❌ ${canSubmit.reason}`, ephemeral: true });
            return;
        }

        // Show modal for Normal Legacy account type
        const modal = new ModalBuilder()
            .setCustomId(`account_data_modal_normal_legacy_${orderId}`)
            .setTitle("📦 Normal Legacy Account");

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
            .setLabel("Bank PIN")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10)
            .setPlaceholder("e.g., 1234");

        const bankValueInput = new TextInputBuilder()
            .setCustomId("bank_value")
            .setLabel("Bank Value")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(50)
            .setPlaceholder("e.g., 100M GP");

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(bankPinInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(bankValueInput)
        );

        await interaction.showModal(modal as any);

        logger.info(`[SubmitAccountNormalLegacy] Showing modal for order ${orderId} to ${interaction.user.id}`);
    } catch (error: any) {
        logger.error("[SubmitAccountNormalLegacy] Error:", error);
        await interaction.reply({ content: "❌ An error occurred.", ephemeral: true });
    }
}
