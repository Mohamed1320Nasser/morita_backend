import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { onboardingConfig } from "../../config/onboarding.config";
import { discordConfig } from "../../config/discord.config";
import logger from "../../../common/loggers";
import { botHttp } from "../../clients/botHttp";
import { buildQuestionLabel, buildQuestionPlaceholder } from "../../utils/questionInput";

export default {
    customId: "accept_tos",

    async execute(interaction: ButtonInteraction) {
        try {
            const discordId = interaction.user.id;
            const username = interaction.user.username;
            const member = interaction.member as any;

            // NOTE: Do NOT defer here. This handler may end with showModal(),
            // and Discord rejects showModal() on an already-acknowledged
            // interaction. Paths that do not open a modal reply explicitly.

            // Record KPI activity (idempotent - won't duplicate if already recorded)
            botHttp
                .post(`${discordConfig.apiBaseUrl}/kpi/member-activity`, {
                    discordId,
                    username,
                    displayName: interaction.user.displayName || username,
                    eventType: 'JOIN',
                    timestamp: new Date().toISOString()
                })
                .catch(kpiError => {
                    // Non-critical, don't block onboarding
                    logger.debug(`[Onboarding] KPI recording failed (non-critical):`, kpiError.message);
                });

            const hasCustomerRole = member?.roles?.cache?.has(onboardingConfig.customerRoleId);

            if (hasCustomerRole) {
                return await interaction.reply({
                    content: "✅ You have already completed registration and have the Customer role!",
                    ephemeral: true
                });
            }

            // STEP 1: Ensure session exists (create or fetch)
            // This is now the ONLY place sessions are created - eliminates race conditions
            let existingSession = null;
            try {
                // Try to create session (upsert will update if exists)
                const sessionResponse = await botHttp.post(`${discordConfig.apiBaseUrl}/onboarding/sessions`, {
                    discordId,
                    discordUsername: username
                });
                existingSession = sessionResponse.data.data;
                logger.info(`[Onboarding] Session ready for ${username}`);
            } catch (sessionError: any) {
                logger.error(`[Onboarding] Failed to create/fetch session for ${username}:`, sessionError.message);
                return await interaction.reply({
                    ephemeral: true,
                    content: "❌ Failed to initialize your session. Please try again or contact an administrator."
                });
            }

            // STEP 2: Already completed onboarding previously.
            // They reach here without the Customer role, which means they left the
            // server and rejoined (Discord strips roles on leave). Their answers and
            // User record still exist, so restore access instead of re-asking.
            if (existingSession?.completedAt) {
                let registeredUser = null;
                try {
                    const userResponse = await botHttp.get(
                        `${discordConfig.apiBaseUrl}/discord/users/discord/${discordId}`
                    );
                    registeredUser = userResponse.data?.data || null;
                } catch (lookupError: any) {
                    if (lookupError.response?.status !== 404) {
                        logger.warn(
                            `[Onboarding] Could not verify existing user ${username}:`,
                            lookupError.message
                        );
                    }
                }

                if (!registeredUser) {
                    // Session says complete but no user record exists - the previous
                    // run failed partway. Let them go through registration again.
                    logger.warn(
                        `[Onboarding] ${username} has a completed session but no user record, re-running registration`
                    );
                } else {
                    const customerRole = interaction.guild?.roles.cache.get(
                        onboardingConfig.customerRoleId
                    );

                    if (!customerRole) {
                        logger.error(
                            `[Onboarding] Customer role ${onboardingConfig.customerRoleId} not found while restoring ${username}`
                        );
                        return await interaction.reply({
                            ephemeral: true,
                            content:
                                "❌ **Could not restore your access**\n\n" +
                                "The Customer role is not configured correctly. Please contact an administrator."
                        });
                    }

                    try {
                        await member.roles.add(customerRole);
                        logger.info(
                            `[Onboarding] Restored Customer role for returning member ${username} (${discordId})`
                        );

                        return await interaction.reply({
                            ephemeral: true,
                            content:
                                `👋 **Welcome back, ${interaction.user.displayName || username}!**\n\n` +
                                `We still have your registration on file, so there's no need to fill in the form again.\n\n` +
                                `✅ Customer role restored\n` +
                                `✅ Access granted to all channels\n\n` +
                                `Enjoy our services!`
                        });
                    } catch (roleError: any) {
                        logger.error(
                            `[Onboarding] Failed to restore role for ${username}:`,
                            roleError.message
                        );
                        return await interaction.reply({
                            ephemeral: true,
                            content:
                                "❌ **Could not restore your access**\n\n" +
                                "You are registered, but we could not re-assign your Customer role. " +
                                "Please contact an administrator."
                        });
                    }
                }
            }

            if (existingSession?.tosAccepted && !existingSession?.completedAt) {
                logger.info(`[Onboarding] ${username} re-attempting registration after previous partial completion`);
            }

            const tosResponse = await botHttp.get(`${discordConfig.apiBaseUrl}/onboarding/tos/active`);
            const activeTos = tosResponse.data.data;

            if (!activeTos) {
                return await interaction.reply({
                    ephemeral: true,
                    content: "❌ No active Terms of Service found. Please contact an administrator."
                });
            }

            const questionsResponse = await botHttp.get(`${discordConfig.apiBaseUrl}/onboarding/questions/active`);
            const questions = questionsResponse.data.data;

            if (!questions || questions.length === 0) {
                logger.info(`[Onboarding] No questions configured, completing onboarding directly for ${username}`);

                try {
                    await botHttp.post(`${discordConfig.apiBaseUrl}/onboarding/tos/accept`, {
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

                    return await interaction.reply({
                        ephemeral: true,
                        content:
                            `✅ **Welcome!**\n\n` +
                            `Your account has been created successfully.\n\n` +
                            `✅ Customer role assigned\n` +
                            `✅ Access granted to all channels\n\n` +
                            `Enjoy our services!`
                    });
                } catch (error: any) {
                    logger.error(`[Onboarding] Failed to complete direct onboarding:`, error.message);
                    return await interaction.reply({
                        ephemeral: true,
                        content:
                            `❌ **Registration Failed**\n\n` +
                            `An error occurred: ${error.message}\n\n` +
                            `Please try clicking "Accept Terms" again or contact an administrator.`
                    });
                }
            }

            if (!existingSession?.tosAccepted) {
                try {
                    await botHttp.post(`${discordConfig.apiBaseUrl}/onboarding/tos/accept`, {
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
                    .setLabel(buildQuestionLabel(q.question))
                    .setStyle(q.fieldType === "TEXTAREA" ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setRequired(q.required);

                const placeholder = buildQuestionPlaceholder(q.question, q.placeholder);
                if (placeholder) {
                    input.setPlaceholder(placeholder);
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
                if (!interaction.isRepliable()) {
                    return;
                }

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorContent, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorContent, ephemeral: true });
                }
            } catch (replyError) {
                logger.error("[Onboarding] Could not send error reply:", replyError);
            }
        }
    }
};
