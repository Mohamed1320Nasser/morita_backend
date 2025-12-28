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
            // Create onboarding session in database
            await axios.post(`${discordConfig.apiBaseUrl}/onboarding/sessions`, {
                discordId: member.id,
                discordUsername: member.user.username
            });

            // Send welcome DM if enabled
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
            // 1. Register user in database
            const response = await axios.post(`${discordConfig.apiBaseUrl}/onboarding/register`, {
                discordId: member.id,
                discordUsername: member.user.username,
                discordDisplayName: member.user.displayName || member.user.username,
                fullname: userData.fullname,
                email: userData.email,
                phone: userData.phone
            });

            const user = response.data;

            // 2. Assign customer role
            const customerRole = member.guild.roles.cache.get(onboardingConfig.customerRoleId);
            if (customerRole) {
                await member.roles.add(customerRole);
            } else {
                logger.error("Customer role not found!");
            }

            // 3. Update session as completed
            await axios.post(`${discordConfig.apiBaseUrl}/onboarding/sessions/${member.id}/complete`);

            // 4. Send welcome message to general channel
            const generalChannel = member.guild.channels.cache.get(onboardingConfig.generalChannelId);
            if (generalChannel && generalChannel.isTextBased()) {
                await (generalChannel as any).send(
                    `🎉 Welcome ${member} to our community! Feel free to explore our services.`
                );
            }

            logger.info(`Onboarding completed for ${member.user.username}`);

            return user;
        } catch (error) {
            logger.error("Failed to complete onboarding:", error);
            throw error;
        }
    }
}
