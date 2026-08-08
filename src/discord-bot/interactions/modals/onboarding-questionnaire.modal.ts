import { ModalSubmitInteraction, GuildMember, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { onboardingConfig } from "../../config/onboarding.config";
import { discordConfig } from "../../config/discord.config";
import { OnboardingManagerService } from "../../services/onboardingManager.service";
import logger from "../../../common/loggers";
import { getRedisService } from "../../../common/services/redis.service";
import { botHttp } from "../../clients/botHttp";

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

            const questionsResponse = await botHttp.get(`${discordConfig.apiBaseUrl}/onboarding/questions/active`);
            const allQuestions = questionsResponse.data.data;

            const batchAnswers: any[] = [];
            const validationErrors: string[] = [];

            interaction.fields.fields.forEach((field, key) => {
                const questionId = key.replace("question_", "");
                const answer = field.value.trim();
                const question = allQuestions.find((q: any) => q.id === questionId);
                const label = question?.question || "This field";

                if (question?.required && answer.length === 0) {
                    validationErrors.push(`• **${label}** — this field is required.`);
                    return;
                }

                if (answer.length > 0 && question?.fieldKey === "EMAIL") {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(answer)) {
                        validationErrors.push(
                            `• **${label}** — "${answer}" is not a valid email address (example: user@example.com).`
                        );
                        return;
                    }
                }

                if (answer.length > 0 && question?.fieldKey === "PHONE") {
                    const digits = answer.replace(/[^0-9]/g, "");
                    if (digits.length < 7 || digits.length > 15) {
                        validationErrors.push(
                            `• **${label}** — "${answer}" is not a valid phone number.`
                        );
                        return;
                    }
                }

                batchAnswers.push({ questionId, answer });
            });

            if (validationErrors.length > 0) {
                const retryButton = new ButtonBuilder()
                    .setCustomId(`continue_onboarding_${batchNumber}`)
                    .setLabel("Try Again")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("🔄");

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(retryButton);

                logger.info(
                    `[Onboarding] ${interaction.user.username} submitted ${validationErrors.length} invalid answer(s) in batch ${batchNumber}`
                );

                await interaction.editReply({
                    content:
                        `⚠️ **Please correct the following:**\n\n` +
                        validationErrors.join("\n") +
                        `\n\nYour other answers were **not** saved for this step. ` +
                        `Click **Try Again** to re-enter this page.`,
                    components: [row as any]
                });
                return;
            }

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

            const answerForKey = (key: string): string | null => {
                const match = userAnswers.find(a => {
                    const q = allQuestions.find((q: any) => q.id === a.questionId);
                    return q?.fieldKey === key;
                });
                const value = match?.answer?.trim();
                return value && value.length > 0 ? value : null;
            };

            const userData = {
                fullname:
                    answerForKey("FULLNAME") ||
                    interaction.user.displayName ||
                    interaction.user.username,
                email: answerForKey("EMAIL") || `${discordId}@temp.discord`,
                phone: answerForKey("PHONE")
            };

            try {
                await botHttp.post(`${discordConfig.apiBaseUrl}/onboarding/answers`, {
                    discordId,
                    answers: userAnswers
                });
            } catch (apiError: any) {
                // Non-fatal: registration can still proceed, but the admin loses
                // the questionnaire record, so make it loud in the logs.
                logger.error(
                    `[Onboarding] Failed to persist answers for ${interaction.user.username} (${discordId}):`,
                    apiError?.response?.data?.msg || apiError.message
                );
            }

            const onboardingManager = new OnboardingManagerService(interaction.client);

            try {
                await onboardingManager.completeOnboarding(member, userData);
            } catch (completionError: any) {
                logger.error("[Onboarding] Failed to complete onboarding:", completionError.message);

                const apiMessage =
                    completionError?.response?.data?.msg ||
                    completionError?.response?.data?.message ||
                    completionError?.message ||
                    "Unknown error";

                const isEmailConflict = String(apiMessage)
                    .toLowerCase()
                    .includes("already registered to another account");

                if (isEmailConflict) {
                    // Drop the cached answers so the retry re-asks every question,
                    // letting the user supply a different email.
                    await redis.delete(cacheKey);

                    const restartButton = new ButtonBuilder()
                        .setCustomId(`continue_onboarding_0`)
                        .setLabel("Enter a Different Email")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("✏️");

                    await interaction.editReply({
                        content:
                            `⚠️ **Email Already In Use**\n\n` +
                            `${apiMessage}\n\n` +
                            `Click below to fill in the form again with a different email address.`,
                        components: [
                            new ActionRowBuilder<ButtonBuilder>().addComponents(restartButton) as any
                        ]
                    });
                    return;
                }

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
                        `${apiMessage}\n\n` +
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
