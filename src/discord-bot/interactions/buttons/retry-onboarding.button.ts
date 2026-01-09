import { ButtonInteraction, GuildMember, EmbedBuilder } from "discord.js";
import { discordConfig } from "../../config/discord.config";
import { OnboardingManagerService } from "../../services/onboardingManager.service";
import axios from "axios";
import logger from "../../../common/loggers";
import { getRedisService } from "../../../common/services/redis.service";

const redis = getRedisService();
const ONBOARDING_ANSWERS_PREFIX = "onboarding:answers:";

export default {
    customId: "retry_onboarding",

    async execute(interaction: ButtonInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const discordId = interaction.user.id;
            const member = interaction.member as GuildMember;

            logger.info(`[Onboarding] ${interaction.user.username} retrying onboarding completion`);

            // Get user's answers from Redis
            const cacheKey = `${ONBOARDING_ANSWERS_PREFIX}${discordId}`;
            const userAnswers = await redis.get<any[]>(cacheKey);

            if (!userAnswers || userAnswers.length === 0) {
                await interaction.editReply({
                    content:
                        `❌ **No Saved Answers Found**\n\n` +
                        `Your registration session has expired or answers were not saved.\n\n` +
                        `Please start the registration process again by clicking "Accept Terms" in #terms-of-service.`
                });
                return;
            }

            // Get all active questions to extract user data
            const questionsResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/questions/active`);
            const allQuestions = questionsResponse.data.data;

            // Extract user data from answers
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

            // Submit all answers to backend first (in case this step failed before)
            try {
                await axios.post(`${discordConfig.apiBaseUrl}/onboarding/answers`, {
                    discordId,
                    answers: userAnswers
                });
                logger.info(`[Onboarding] Retry - Answers submitted for ${interaction.user.username}`);
            } catch (apiError: any) {
                logger.warn("[Onboarding] Retry - Failed to submit answers:", apiError.message);
                // Continue anyway - might be duplicate submission
            }

            // Complete onboarding (create user, assign role)
            const onboardingManager = new OnboardingManagerService(interaction.client);

            try {
                await onboardingManager.completeOnboarding(member, userData);
            } catch (completionError: any) {
                logger.error("[Onboarding] Retry - Failed to complete onboarding:", completionError.message);

                await interaction.editReply({
                    content:
                        `❌ **Registration Still Failed**\n\n` +
                        `Error: \`${completionError.message}\`\n\n` +
                        `This may be due to:\n` +
                        `• Backend API is unavailable\n` +
                        `• Database connection issue\n` +
                        `• Role permissions error\n\n` +
                        `Please contact an administrator for manual assistance.\n\n` +
                        `**Your Information:**\n` +
                        `• Discord ID: \`${discordId}\`\n` +
                        `• Name: ${userData.fullname}\n` +
                        `• Email: ${userData.email}`
                });
                return;
            }

            // Clear Redis cache after successful completion
            await redis.delete(cacheKey);

            // Send success message
            const successEmbed = new EmbedBuilder()
                .setTitle("✅ Registration Successful!")
                .setDescription(
                    `Your registration has been completed successfully!\n\n` +
                    `✅ **Customer role assigned**\n` +
                    `✅ **Account created**\n` +
                    `✅ **Profile updated**\n\n` +
                    `Welcome to our community! You now have access to all customer channels.`
                )
                .setColor(0x00FF00)
                .setFooter({ text: `Registered as: ${userData.fullname}` })
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed as any]
            });

            logger.info(`[Onboarding] ✅ ${interaction.user.username} completed onboarding successfully (via retry)`);

        } catch (error) {
            logger.error("[Onboarding] Error in retry-onboarding button:", error);

            const errorMessage = error instanceof Error ? error.message : "Unknown error";

            const replyContent = {
                content:
                    `❌ **Critical Error**\n\n` +
                    `Failed to retry registration: \`${errorMessage}\`\n\n` +
                    `Please contact an administrator with your Discord ID: \`${interaction.user.id}\``
            };

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ ...replyContent, ephemeral: true }).catch(() => {});
            } else {
                await interaction.editReply(replyContent).catch(() => {});
            }
        }
    }
};
