import { config } from "dotenv";

config();

export const onboardingConfig = {
    // Channel IDs
    tosChannelId: process.env.DISCORD_TOS_CHANNEL_ID || "",
    generalChannelId: process.env.DISCORD_GENERAL_CHANNEL_ID || "",

    // Role IDs
    customerRoleId: process.env.DISCORD_CUSTOMER_ROLE_ID || "",

    // Onboarding settings
    maxQuestionsPerModal: 5,  // Discord limitation
    sessionExpiryHours: 24,   // Auto-expire incomplete sessions

    // DM settings
    sendWelcomeDM: true,
    welcomeDMMessage: "👋 Welcome! Please visit #terms-of-service to get started.",

    // Button IDs
    acceptTosButtonId: "accept_tos",

    // Modal IDs
    questionnaireModalPrefix: "onboarding_questionnaire_",
};
