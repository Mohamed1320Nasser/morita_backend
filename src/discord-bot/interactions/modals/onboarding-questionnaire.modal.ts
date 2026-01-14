import { ModalSubmitInteraction, GuildMember, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { onboardingConfig } from "../../config/onboarding.config";
import { discordConfig } from "../../config/discord.config";
import { OnboardingManagerService } from "../../services/onboardingManager.service";
import axios from "axios";
import logger from "../../../common/loggers";
import { getRedisService } from "../../../common/services/redis.service";

const redis = getRedisService();
const ONBOARDING_ANSWERS_PREFIX = "onboarding:answers:";
const ONBOARDING_ANSWERS_TTL = 24 * 60 * 60; 

export default {
    customId: /^onboarding_questionnaire_\d+$/,

    async execute(interaction: ModalSubmitInteraction) {
        try {
            
            await interaction.deferReply({ ephemeral: true });

            const discordId = interaction.user.id;
            const member = interaction.member as GuildMember;

            const batchNumber = parseInt(interaction.customId.split("_")[2]);

            const questionsResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/questions/active`);
            const allQuestions = questionsResponse.data.data;

            const batchAnswers: any[] = [];
            interaction.fields.fields.forEach((field, key) => {
                const questionId = key.replace("question_", "");
                const answer = field.value.trim();

                const question = allQuestions.find((q: any) => q.id === questionId);
                if (question?.question.toLowerCase().includes("email")) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(answer)) {
                        interaction.reply({
                            content: `❌ **Invalid Email Address**\n\nPlease enter a valid email address for: "${question.question}"\n\nExample: user@example.com`,
                            ephemeral: true
                        });
                        return;
                    }
                }

                batchAnswers.push({
                    questionId,
                    answer
                });
            });

            const cacheKey = `${ONBOARDING_ANSWERS_PREFIX}${discordId}`;
            let userAnswers = await redis.get<any[]>(cacheKey) || [];
            userAnswers = [...userAnswers, ...batchAnswers];

            await redis.set(cacheKey, userAnswers, ONBOARDING_ANSWERS_TTL);

            const answeredCount = userAnswers.length;
            const totalQuestions = allQuestions.length;
            const remainingQuestions = allQuestions.slice(answeredCount);

            logger.info(`[Onboarding] User ${interaction.user.username} answered ${answeredCount}/${totalQuestions} questions`);

            if (remainingQuestions.length > 0) {
                
                const continueButton = new ButtonBuilder()
                    .setCustomId(`continue_onboarding_${batchNumber + 1}`)
                    .setLabel(`Continue Registration (${remainingQuestions.length} questions remaining)`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("▶️");

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(continueButton);

                await interaction.editReply({
                    content:
                        `✅ **Progress Saved!**\n\n` +
                        `📝 Answered: **${answeredCount}** / **${totalQuestions}** questions\n` +
                        `⏳ Remaining: **${remainingQuestions.length}** questions\n\n` +
                        `Click the button below to continue your registration.`,
                    components: [row as any]
                });
                return;
            }

            logger.info(`[Onboarding] ${interaction.user.username} completed all questions, starting registration...`);

            const userData = {
                fullname: userAnswers.find(a => {
                    const q = allQuestions.find((q: any) => q.id === a.questionId);
                    return q?.question.toLowerCase().includes("name");
                })?.answer || interaction.user.displayName || interaction.user.username,

                email: userAnswers.find(a => {
                    const q = allQuestions.find((q: any) => q.id === a.questionId);
                    return q?.question.toLowerCase().includes("email");
                })?.answer || `${discordId}@temp.discord`,

                phone: userAnswers.find(a => {
                    const q = allQuestions.find((q: any) => q.id === a.questionId);
                    return q?.question.toLowerCase().includes("phone");
                })?.answer || null
            };

            try {
                await axios.post(`${discordConfig.apiBaseUrl}/onboarding/answers`, {
                    discordId,
                    answers: userAnswers
                });
            } catch (apiError: any) {
                logger.error("[Onboarding] Failed to submit answers:", apiError.message);
                
            }

            const onboardingManager = new OnboardingManagerService(interaction.client);

            try {
                await onboardingManager.completeOnboarding(member, userData);
            } catch (completionError: any) {
                logger.error("[Onboarding] Failed to complete onboarding:", completionError.message);

                const retryButton = new ButtonBuilder()
                    .setCustomId(`retry_onboarding`)
                    .setLabel("Retry Registration")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji("🔄");

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(retryButton);

                await interaction.editReply({
                    content:
                        `❌ **Registration Failed**\n\n` +
                        `An error occurred while completing your registration:\n` +
                        `\`\`\`${completionError.message}\`\`\`\n\n` +
                        `Your answers have been saved. Click the button below to retry.`,
                    components: [row as any]
                });
                return;
            }

            await redis.delete(cacheKey);

            const successEmbed = new EmbedBuilder()
                .setTitle("✅ Welcome Aboard!")
                .setDescription(
                    `Thank you for completing registration!\n\n` +
                    `✅ **Customer role assigned**\n` +
                    `✅ **Account created**\n` +
                    `✅ **Profile updated**\n\n` +
                    `You now have access to all customer channels. Enjoy our services!`
                )
                .setColor(0x00FF00)
                .setFooter({ text: `Registered as: ${userData.fullname}` })
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed as any]
            });

            logger.info(`[Onboarding] ✅ ${interaction.user.username} completed onboarding successfully`);

        } catch (error) {
            logger.error("[Onboarding] Error in questionnaire modal:", error);

            const errorMessage = error instanceof Error ? error.message : "Unknown error";

            const retryButton = new ButtonBuilder()
                .setCustomId(`retry_onboarding`)
                .setLabel("Retry Registration")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔄");

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(retryButton);

            const replyContent = {
                content:
                    `❌ **An error occurred during registration**\n\n` +
                    `Error: \`${errorMessage}\`\n\n` +
                    `Please try again or contact support for assistance.`,
                components: [row as any]
            };

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(replyContent);
                } else {
                    await interaction.reply({ ...replyContent, ephemeral: true });
                }
            } catch (replyError) {
                logger.error("[Onboarding] Could not send error message:", replyError);
            }
        }
    }
};
