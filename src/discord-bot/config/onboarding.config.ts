import { config } from "dotenv";

config();

export const onboardingConfig = {
    
    tosChannelId: process.env.DISCORD_TOS_CHANNEL_ID || "",
    generalChannelId: process.env.DISCORD_GENERAL_CHANNEL_ID || "",

    customerRoleId: process.env.DISCORD_CUSTOMER_ROLE_ID || "",

    maxQuestionsPerModal: 5,  
    sessionExpiryHours: 24,   

    sendWelcomeDM: true,
    welcomeDMMessage: "👋 Welcome! Please visit #terms-of-service to get started.",

    acceptTosButtonId: "accept_tos",

    questionnaireModalPrefix: "onboarding_questionnaire_",
};
