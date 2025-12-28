import { ModalSubmitInteraction, GuildMember, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { onboardingConfig } from "../../config/onboarding.config";
import { discordConfig } from "../../config/discord.config";
import { OnboardingManagerService } from "../../services/onboardingManager.service";
import axios from "axios";
import logger from "../../../common/loggers";

// Store user answers temporarily (in production, use Redis or database)
const userAnswersCache = new Map<string, any[]>();

export default {
    customId: /^onboarding_questionnaire_\d+$/,

    async execute(interaction: ModalSubmitInteraction) {
        try {
            const discordId = interaction.user.id;
            const member = interaction.member as GuildMember;

            // Extract batch number from modal ID
            const batchNumber = parseInt(interaction.customId.split("_")[2]);

            // Get all active questions
            const questionsResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/questions/active`);
            const allQuestions = questionsResponse.data.data;

            // Extract answers from this batch
            const batchAnswers: any[] = [];
            interaction.fields.fields.forEach((field, key) => {
                const questionId = key.replace("question_", "");
                batchAnswers.push({
                    questionId,
                    answer: field.value
                });
            });

            // Get or initialize user's answers from cache
            let userAnswers = userAnswersCache.get(discordId) || [];
            userAnswers = [...userAnswers, ...batchAnswers];
            userAnswersCache.set(discordId, userAnswers);

            // Calculate remaining questions
            const answeredCount = userAnswers.length;
            const totalQuestions = allQuestions.length;
            const remainingQuestions = allQuestions.slice(answeredCount);

            // Check if more questions remain
            if (remainingQuestions.length > 0) {
                // Note: Cannot show modal from modal submit interaction
                // This would need a button-based approach instead
                await interaction.reply({
                    content: `✅ Answers saved! You have ${remainingQuestions.length} more questions remaining.\n\nPlease contact an admin to continue the onboarding process.`,
                    ephemeral: true
                });
                return;
            }

            // All questions answered - complete onboarding
            await interaction.deferReply({ ephemeral: true });

            // Submit all answers to backend
            await axios.post(`${discordConfig.apiBaseUrl}/onboarding/answers`, {
                discordId,
                answers: userAnswers
            });

            // Extract user data from answers
            const userData = {
                fullname: userAnswers.find(a => {
                    const q = allQuestions.find((q: any) => q.id === a.questionId);
                    return q?.question.toLowerCase().includes("name");
                })?.answer || interaction.user.username,

                email: userAnswers.find(a => {
                    const q = allQuestions.find((q: any) => q.id === a.questionId);
                    return q?.question.toLowerCase().includes("email");
                })?.answer || `${discordId}@temp.discord`,

                phone: userAnswers.find(a => {
                    const q = allQuestions.find((q: any) => q.id === a.questionId);
                    return q?.question.toLowerCase().includes("phone");
                })?.answer || null
            };

            // Complete onboarding (create user, assign role)
            const onboardingManager = new OnboardingManagerService(interaction.client);
            await onboardingManager.completeOnboarding(member, userData);

            // Clear cache
            userAnswersCache.delete(discordId);

            // Send success message
            const successEmbed = new EmbedBuilder()
                .setTitle("✅ Welcome Aboard!")
                .setDescription(
                    `Thank you for completing registration!\n\n` +
                    `✅ Customer role assigned\n` +
                    `✅ Account created\n\n` +
                    `You now have access to all customer channels. Enjoy!`
                )
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed as any]
            });

            logger.info(`${interaction.user.username} completed onboarding`);

        } catch (error) {
            logger.error("Error in onboarding questionnaire modal:", error);

            const errorMessage = error instanceof Error ? error.message : "Unknown error";

            await interaction.reply({
                content: `❌ An error occurred during registration: ${errorMessage}\n\nPlease contact support for assistance.`,
                ephemeral: true
            }).catch(() => {
                interaction.editReply({
                    content: `❌ An error occurred during registration: ${errorMessage}\n\nPlease contact support for assistance.`
                });
            });
        }
    }
};
