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
            const member = interaction.member as any;

            const hasCustomerRole = member?.roles?.cache?.has(onboardingConfig.customerRoleId);

            if (hasCustomerRole) {
                return await interaction.reply({
                    content: "✅ You have already completed registration and have the Customer role!",
                    ephemeral: true
                });
            }

            let existingSession = null;
            try {
                const sessionResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/sessions/${discordId}`);
                existingSession = sessionResponse.data.data;

                if (existingSession?.completedAt) {
                    return await interaction.reply({
                        content: "✅ You have already accepted the Terms of Service and completed registration!\n\nIf you don't have access to channels, please contact an administrator.",
                        ephemeral: true
                    });
                }

                if (existingSession?.tosAccepted && !existingSession?.completedAt) {
                    logger.info(`[Onboarding] ${username} re-attempting registration after previous partial completion`);
                }
            } catch (sessionError) {
                
                logger.debug(`[Onboarding] No existing session for ${username}`);
            }

            const tosResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/tos/active`);
            const activeTos = tosResponse.data.data;

            if (!activeTos) {
                return await interaction.reply({
                    content: "❌ No active Terms of Service found. Please contact an administrator.",
                    ephemeral: true
                });
            }

            const questionsResponse = await axios.get(`${discordConfig.apiBaseUrl}/onboarding/questions/active`);
            const questions = questionsResponse.data.data;

            if (!questions || questions.length === 0) {
                logger.info(`[Onboarding] No questions configured, completing onboarding directly for ${username}`);

                await interaction.deferReply({ ephemeral: true });

                try {
                    
                    await axios.post(`${discordConfig.apiBaseUrl}/onboarding/tos/accept`, {
                        discordId,
                        discordUsername: username,
                        tosId: activeTos.id,
                        ipAddress: null
                    });
                    logger.info(`[Onboarding] TOS accepted by ${username}`);

                    const { OnboardingManagerService } = await import("../../services/onboardingManager.service");
                    const onboardingManager = new OnboardingManagerService(interaction.client);

                    const defaultUserData = {
                        fullname: interaction.user.displayName || interaction.user.username,
                        email: `${discordId}@temp.discord`,
                        phone: null
                    };

                    await onboardingManager.completeOnboarding(member, defaultUserData);

                    return await interaction.editReply({
                        content:
                            `✅ **Welcome!**\n\n` +
                            `Your account has been created successfully.\n\n` +
                            `✅ Customer role assigned\n` +
                            `✅ Access granted to all channels\n\n` +
                            `Enjoy our services!`
                    });
                } catch (error: any) {
                    logger.error(`[Onboarding] Failed to complete direct onboarding:`, error);
                    return await interaction.editReply({
                        content:
                            `❌ **Registration Failed**\n\n` +
                            `An error occurred: ${error.message}\n\n` +
                            `Please try clicking "Accept Terms" again or contact an administrator.`
                    });
                }
            }

            if (!existingSession?.tosAccepted) {
                try {
                    await axios.post(`${discordConfig.apiBaseUrl}/onboarding/tos/accept`, {
                        discordId,
                        discordUsername: username,
                        tosId: activeTos.id,
                        ipAddress: null
                    });
                    logger.info(`[Onboarding] TOS accepted by ${username}`);
                } catch (tosError: any) {
                    
                    if (tosError.response?.status === 409 || tosError.response?.status === 500) {
                        logger.warn(`[Onboarding] TOS already accepted by ${username}, continuing...`);
                    } else {
                        logger.error(`[Onboarding] Failed to record TOS acceptance: ${tosError.message}`);
                        return await interaction.reply({
                            content:
                                `❌ **Failed to Record Acceptance**\n\n` +
                                `Could not save your TOS acceptance. This may be a temporary issue.\n\n` +
                                `Please try clicking "Accept Terms" again.`,
                            ephemeral: true
                        });
                    }
                }
            } else {
                logger.info(`[Onboarding] TOS already accepted for ${username}, skipping acceptance recording`);
            }

            const firstBatch = questions.slice(0, onboardingConfig.maxQuestionsPerModal);

            const modal = new ModalBuilder()
                .setCustomId(`${onboardingConfig.questionnaireModalPrefix}0`)
                .setTitle("Customer Registration");

            firstBatch.forEach((q: any) => {
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

            logger.info(`[Onboarding] ${username} accepted TOS and opened questionnaire (${firstBatch.length} questions)`);

        } catch (error: any) {
            logger.error("[Onboarding] Error in accept-tos button:", error);

            const errorMsg = error.message || "Unknown error";
            const errorContent =
                `❌ **An Error Occurred**\n\n` +
                `Error: \`${errorMsg}\`\n\n` +
                `Please try again or contact an administrator.`;

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: errorContent });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorContent, ephemeral: true });
                }
            } catch (replyError) {
                logger.error("[Onboarding] Could not send error reply:", replyError);
            }
        }
    }
};
