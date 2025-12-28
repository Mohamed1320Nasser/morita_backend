import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { onboardingConfig } from "../../config/onboarding.config";
import { discordConfig } from "../../config/discord.config";
import axios from "axios";
import logger from "../../../common/loggers";

export default {
    customId: "accept_tos",

    async execute(interaction: ButtonInteraction) {
        try {
            const discordId = interaction.user.id;
            const username = interaction.user.username;

            // 1. Check if already accepted
            const sessionResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/sessions/${discordId}`);
            const session = sessionResponse.data.data;

            if (session?.tosAccepted) {
                return await interaction.reply({
                    content: "✅ You have already accepted the Terms of Service!",
                    ephemeral: true
                });
            }

            // 2. Get active TOS
            const tosResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/tos/active`);
            const activeTos = tosResponse.data.data;

            if (!activeTos) {
                return await interaction.reply({
                    content: "❌ No active Terms of Service found. Please contact an administrator.",
                    ephemeral: true
                });
            }

            // 3. Record TOS acceptance
            await axios.post(`${discordConfig.apiBaseUrl}/onboarding/tos/accept`, {
                discordId,
                discordUsername: username,
                tosId: activeTos.id,
                ipAddress: null
            });

            // 4. Fetch active questions
            const questionsResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/questions/active`);
            const questions = questionsResponse.data.data;

            if (!questions || questions.length === 0) {
                return await interaction.reply({
                    content: "❌ No onboarding questions found. Please contact an administrator.",
                    ephemeral: true
                });
            }

            // 5. Show questionnaire modal (first batch - max 5 questions)
            const firstBatch = questions.slice(0, onboardingConfig.maxQuestionsPerModal);

            const modal = new ModalBuilder()
                .setCustomId(`${onboardingConfig.questionnaireModalPrefix}0`)
                .setTitle("Customer Registration");

            firstBatch.forEach((q: any) => {
                const input = new TextInputBuilder()
                    .setCustomId(`question_${q.id}`)
                    .setLabel(q.question.substring(0, 45)) // Discord label max 45 chars
                    .setStyle(q.fieldType === "TEXTAREA" ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setRequired(q.required);

                if (q.placeholder) {
                    input.setPlaceholder(q.placeholder.substring(0, 100));
                }

                if (q.minLength) {
                    input.setMinLength(q.minLength);
                }

                if (q.maxLength) {
                    input.setMaxLength(q.maxLength);
                }

                const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
                modal.addComponents(row);
            });

            await interaction.showModal(modal as any);

            logger.info(`${username} accepted TOS and opened questionnaire`);

        } catch (error) {
            logger.error("Error in accept-tos button:", error);
            await interaction.reply({
                content: "❌ An error occurred. Please try again later or contact support.",
                ephemeral: true
            });
        }
    }
};
