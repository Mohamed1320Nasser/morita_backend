import {
    StringSelectMenuInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import { discordApiClient } from "../../clients/DiscordApiClient";
import logger from "../../../common/loggers";

export async function handleAccountTypeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        const orderId = interaction.customId.replace("account_type_select_", "");
        const selectedType = interaction.values[0];

        const typeRes: any = await discordApiClient.get(`/account-data/types/${selectedType}`);
        const template = typeRes.data || typeRes;

        if (!template || !template.questions || template.questions.length === 0) {
            await interaction.reply({ content: "❌ No questions configured for this account type.", ephemeral: true });
            return;
        }

        const questions = template.questions.slice(0, 5);

        const modal = new ModalBuilder()
            .setCustomId(`account_data_modal_${orderId}_${selectedType}`)
            .setTitle(`${template.name} - Account Data`);

        for (const question of questions) {
            const input = new TextInputBuilder()
                .setCustomId(question.fieldName)
                .setLabel(question.label + (question.isRequired ? " *" : ""))
                .setStyle(question.fieldName.includes("codes") || question.fieldName.includes("pin")
                    ? TextInputStyle.Paragraph
                    : TextInputStyle.Short)
                .setRequired(question.isRequired)
                .setMaxLength(500);

            if (question.placeholder) {
                input.setPlaceholder(question.placeholder);
            }

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        }

        await interaction.showModal(modal as any);
    } catch (error: any) {
        logger.error("[AccountTypeSelect] Error:", error);
        if (!interaction.replied) {
            await interaction.reply({ content: "❌ An error occurred.", ephemeral: true });
        }
    }
}
