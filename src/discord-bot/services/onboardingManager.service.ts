import { Client, GuildMember } from "discord.js";
import { onboardingConfig } from "../config/onboarding.config";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { botHttp } from "../clients/botHttp";
import { unwrapApiData } from "../utils/apiResponse.util";
import { notifyReferralPayout, ReferralPayout } from "./referralNotifier.service";

const PLACEHOLDER_EMAIL_SUFFIXES = ["@temp.discord", "@discord.morita.local"];

function hasPlaceholderEmail(email?: string | null): boolean {
    return !email || PLACEHOLDER_EMAIL_SUFFIXES.some(suffix => email.endsWith(suffix));
}

export class OnboardingManagerService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async handleNewMember(member: GuildMember) {
        try {
            // ⚠️ IMPORTANT: We do NOT create the session here anymore
            // The TOS button will create it when the user actually engages
            // This eliminates all race conditions

            if (onboardingConfig.sendWelcomeDM) {
                try {
                    await member.send({
                        content: `👋 Welcome to **${member.guild.name}**!\n\n` +
                            `Please head to the **#terms-of-service** channel to get started.`
                    });
                } catch (error) {
                    logger.warn(`[Onboarding] Could not send DM to ${member.user.username}`, error);
                }
            }

            logger.info(`[Onboarding] New member ${member.user.username} (${member.id}) welcomed, waiting for TOS acceptance`);
        } catch (error: any) {
            logger.error(`[Onboarding] Failed to handle new member ${member.user.username}:`, error.message);
        }
    }

    async completeOnboarding(member: GuildMember, userData: any) {
        try {

            try {
                const existingUserResponse = await botHttp.get(`${discordConfig.apiBaseUrl}/discord/users/discord/${member.id}`);
                const existingUser = existingUserResponse.data.data;

                // Accepting the ToS (or opening a ticket) already creates a placeholder
                // account, so only a real email means "registered". Placeholder accounts
                // must go through /onboarding/register, which links their referral.
                if (existingUser && !hasPlaceholderEmail(existingUser.email)) {
                    logger.warn(`[Onboarding] User ${member.user.username} (${member.id}) already registered, skipping duplicate registration`);

                    const customerRole = member.guild.roles.cache.get(onboardingConfig.customerRoleId);
                    if (customerRole && !member.roles.cache.has(onboardingConfig.customerRoleId)) {
                        try {
                            await member.roles.add(customerRole);
                            logger.info(`[Onboarding] Assigned customer role to existing user ${member.user.username}`);
                        } catch (roleError: any) {
                            logger.error(`[Onboarding] Failed to assign role to existing user: ${roleError.message}`);
                            throw new Error(`Missing Permissions: Bot role must be above Customer role in Server Settings → Roles`);
                        }
                    }

                    await botHttp.post(`${discordConfig.apiBaseUrl}/onboarding/sessions/${member.id}/complete`).catch(() => {});

                    return existingUser;
                }
            } catch (checkError: any) {
                // 404 is expected for new users - not an error
                if (checkError.response?.status === 404) {
                    logger.info(`[Onboarding] User ${member.user.username} (${member.id}) is new, proceeding with registration`);
                } else if (checkError.response?.status !== 404) {
                    logger.warn(`[Onboarding] Error checking existing user:`, checkError.message);
                }
            }

            const response = await botHttp.post(`${discordConfig.apiBaseUrl}/onboarding/register`, {
                discordId: member.id,
                discordUsername: member.user.username,
                discordDisplayName: member.user.displayName || member.user.username,
                fullname: userData.fullname,
                email: userData.email,
                phone: userData.phone
            });

            const user = response.data;
            logger.info(`[Onboarding] User registered in database: ${member.user.username}`);

            const customerRole = member.guild.roles.cache.get(onboardingConfig.customerRoleId);
            if (!customerRole) {
                logger.error(`[Onboarding] Customer role not found! Role ID: ${onboardingConfig.customerRoleId}`);
                throw new Error("Customer role not configured in server");
            }

            try {
                await member.roles.add(customerRole);
                logger.info(`[Onboarding] Customer role assigned to ${member.user.username}`);
            } catch (roleError: any) {
                logger.error(`[Onboarding] Failed to assign customer role: ${roleError.message}`);
                throw new Error(`Missing Permissions: Bot role must be above Customer role in Server Settings → Roles`);
            }

            await botHttp.post(`${discordConfig.apiBaseUrl}/onboarding/sessions/${member.id}/complete`);

            // Usually HELD here (minimum days in server); the pending-reward cron pays it later.
            try {
                const rewardResponse = await botHttp.post(`${discordConfig.apiBaseUrl}/referral/reward`, {
                    referredDiscordId: member.id
                });
                const outcome = unwrapApiData<any>(rewardResponse.data);

                if (outcome?.status === "PAID") {
                    logger.info(`[Onboarding] Referral reward paid: ${outcome.amount}`);
                    await notifyReferralPayout(this.client, outcome as ReferralPayout);
                } else if (outcome?.status === "HELD") {
                    logger.info(`[Onboarding] Referral reward held: ${outcome.reason}`);
                }
            } catch (refError: any) {
                logger.error(`[Onboarding] Referral reward check failed:`, refError?.response?.data?.msg || refError.message);
            }

            if (onboardingConfig.generalChannelId) {
                const generalChannel = member.guild.channels.cache.get(onboardingConfig.generalChannelId);
                if (generalChannel && generalChannel.isTextBased()) {
                    await (generalChannel as any).send(
                        `🎉 Welcome ${member} to our community! Feel free to explore our services.`
                    );
                }
            }

            logger.info(`[Onboarding] ✅ Onboarding completed for ${member.user.username}`);

            return user;
        } catch (error: any) {
            logger.error(`[Onboarding] Failed to complete onboarding:`, error.message);
            throw error;
        }
    }
}
