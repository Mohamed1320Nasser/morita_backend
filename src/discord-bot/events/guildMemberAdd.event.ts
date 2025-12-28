import { Events, GuildMember } from "discord.js";
import { OnboardingManagerService } from "../services/onboardingManager.service";
import logger from "../../common/loggers";

export default {
    name: Events.GuildMemberAdd,
    once: false,

    async execute(member: GuildMember) {
        try {
            logger.info(`New member joined: ${member.user.tag}`);

            const onboardingManager = new OnboardingManagerService(member.client);
            await onboardingManager.handleNewMember(member);
        } catch (error) {
            logger.error("Error in guildMemberAdd event:", error);
        }
    }
};
