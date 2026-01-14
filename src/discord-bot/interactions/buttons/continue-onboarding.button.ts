import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { onboardingConfig } from "../../config/onboarding.config";
import { discordConfig } from "../../config/discord.config";
import axios from "axios";
import logger from "../../../common/loggers";
import { getRedisService } from "../../../common/services/redis.service";

const redis = getRedisService();
const ONBOARDING_ANSWERS_PREFIX = "onboarding:answers:";

export default {
    customId: /^continue_onboarding_\d+$/,

    async execute(interaction: ButtonInteraction) {
        try {
            const discordId = interaction.user.id;

            const batchNumber = parseInt(interaction.customId.split("_")[2]);

            logger.info(`[Onboarding] ${interaction.user.username} continuing onboarding (batch ${batchNumber})`);

            const questionsResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/questions/active`);
            const allQuestions = questionsResponse.data.data;

            const cacheKey = `${ONBOARDING_ANSWERS_PREFIX}${discordId}`;
            const userAnswers = await redis.get<any[]>(cacheKey) || [];
            const answeredCount = userAnswers.length;

            const remainingQuestions = allQuestions.slice(answeredCount);

            if (remainingQuestions.length === 0) {
                await interaction.reply({
                    content: "✅ You have already completed all questions! Please contact an administrator.",
                    ephemeral: true
                });
                return;
            }

            const nextBatch = remainingQuestions.slice(0, onboardingConfig.maxQuestionsPerModal);

            const modal = new ModalBuilder()
                .setCustomId(`${onboardingConfig.questionnaireModalPrefix}${batchNumber}`)
                .setTitle(`Registration (${answeredCount + 1}-${answeredCount + nextBatch.length}/${allQuestions.length})`);

            nextBatch.forEach((q: any) => {
                const input = new TextInputBuilder()
                    .setCustomId(`question_${q.id}`)
                    .setLabel(q.question.substring(0, 45)) 
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

            logger.info(`[Onboarding] Showed batch ${batchNumber} to ${interaction.user.username} (${nextBatch.length} questions)`);

        } catch (error) {
            logger.error("[Onboarding] Error in continue-onboarding button:", error);

            const errorMessage = error instanceof Error ? error.message : "Unknown error";

            await interaction.reply({
                content:
                    `❌ **Failed to Continue Registration**\n\n` +
                    `Error: \`${errorMessage}\`\n\n` +
                    `Please try again or contact support for assistance.`,
                ephemeral: true
            }).catch(() => {});
        }
    }
};
