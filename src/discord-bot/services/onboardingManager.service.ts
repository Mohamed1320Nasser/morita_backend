import { Client, GuildMember } from "discord.js";
import { onboardingConfig } from "../config/onboarding.config";
import { discordConfig } from "../config/discord.config";
import axios from "axios";
import logger from "../../common/loggers";

export class OnboardingManagerService {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async handleNewMember(member: GuildMember) {
        try {
            
            await axios.post(`${discordConfig.apiBaseUrl}/onboarding/sessions`, {
                discordId: member.id,
                discordUsername: member.user.username
            });

            if (onboardingConfig.sendWelcomeDM) {
                try {
                    await member.send({
                        content: `👋 Welcome to **${member.guild.name}**!\n\n` +
                            `Please head to the **#terms-of-service** channel to get started.`
                    });
                } catch (error) {
                    logger.warn(`Could not send DM to ${member.user.username}`, error);
                }
            }

            logger.info(`New member joined: ${member.user.username} (${member.id})`);
        } catch (error) {
            logger.error("Failed to handle new member:", error);
        }
    }

    async completeOnboarding(member: GuildMember, userData: any) {
        try {
            
            try {
                const existingUserResponse = await axios.get(`${discordConfig.apiBaseUrl}/users/discord/${member.id}`);
                const existingUser = existingUserResponse.data.data;

                if (existingUser) {
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

                    await axios.post(`${discordConfig.apiBaseUrl}/onboarding/sessions/${member.id}/complete`).catch(() => {});

                    return existingUser;
                }
            } catch (checkError: any) {
                
                if (checkError.response?.status !== 404) {
                    logger.warn(`[Onboarding] Error checking existing user:`, checkError.message);
                }
            }

            const response = await axios.post(`${discordConfig.apiBaseUrl}/onboarding/register`, {
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

            await axios.post(`${discordConfig.apiBaseUrl}/onboarding/sessions/${member.id}/complete`);

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
