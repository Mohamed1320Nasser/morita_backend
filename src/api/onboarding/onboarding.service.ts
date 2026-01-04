import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateTosDto,
    UpdateTosDto,
    AcceptTosDto,
    CreateSessionDto,
    UpdateSessionDto,
    RegisterUserDto
} from "./dtos";
import logger from "../../common/loggers";
import discordClient from "../../discord-bot/index";

@Service()
export default class OnboardingService {
    // ============================================
    // TERMS OF SERVICE METHODS
    // ============================================

    async getActiveTos() {
        return await prisma.termsOfService.findFirst({
            where: { isActive: true },
            orderBy: { version: "desc" }
        });
    }

    async getTosById(id: string) {
        return await prisma.termsOfService.findUnique({
            where: { id },
            include: {
                acceptances: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                fullname: true,
                                email: true,
                                discordUsername: true
                            }
                        }
                    },
                    orderBy: { acceptedAt: "desc" },
                    take: 100
                }
            }
        });
    }

    async getAllTos() {
        return await prisma.termsOfService.findMany({
            orderBy: { version: "desc" },
            include: {
                _count: {
                    select: { acceptances: true }
                }
            }
        });
    }

    async createTos(data: CreateTosDto) {
        // Get the latest version
        const latestTos = await prisma.termsOfService.findFirst({
            orderBy: { version: "desc" }
        });

        const newVersion = latestTos ? latestTos.version + 1 : 1;

        // If isActive is true, deactivate all other TOS
        if (data.isActive) {
            await prisma.termsOfService.updateMany({
                where: { isActive: true },
                data: { isActive: false }
            });
        }

        return await prisma.termsOfService.create({
            data: {
                ...data,
                version: newVersion
            }
        });
    }

    async updateTos(id: string, data: UpdateTosDto) {
        // If isActive is true, deactivate all other TOS
        if (data.isActive) {
            await prisma.termsOfService.updateMany({
                where: {
                    isActive: true,
                    id: { not: id }
                },
                data: { isActive: false }
            });
        }

        return await prisma.termsOfService.update({
            where: { id },
            data
        });
    }

    async recordAcceptance(data: AcceptTosDto) {
        // Find or create user by discordId
        let user = await prisma.user.findUnique({
            where: { discordId: data.discordId }
        });

        // If user doesn't exist, create a temporary one (will be updated later)
        if (!user) {
            user = await prisma.user.create({
                data: {
                    discordId: data.discordId,
                    discordUsername: data.discordUsername,
                    fullname: data.discordUsername,
                    email: `${data.discordId}@temp.discord`, // Temporary email
                    discordRole: "customer",
                    role: "user"
                }
            });
        }

        // Check if already accepted
        const existingAcceptance = await prisma.tosAcceptance.findUnique({
            where: {
                userId_tosId: {
                    userId: user.id,
                    tosId: data.tosId
                }
            }
        });

        if (existingAcceptance) {
            return existingAcceptance;
        }

        // Create acceptance record
        const acceptance = await prisma.tosAcceptance.create({
            data: {
                userId: user.id,
                tosId: data.tosId,
                discordId: data.discordId,
                discordUsername: data.discordUsername,
                ipAddress: data.ipAddress
            }
        });

        // Update onboarding session
        await prisma.onboardingSession.update({
            where: { discordId: data.discordId },
            data: { tosAccepted: true }
        });

        return acceptance;
    }

    async getAcceptanceStats(tosId: string) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [total, todayCount, weekCount, monthCount, tos] = await Promise.all([
            prisma.tosAcceptance.count({ where: { tosId } }),
            prisma.tosAcceptance.count({
                where: {
                    tosId,
                    acceptedAt: { gte: today }
                }
            }),
            prisma.tosAcceptance.count({
                where: {
                    tosId,
                    acceptedAt: { gte: weekAgo }
                }
            }),
            prisma.tosAcceptance.count({
                where: {
                    tosId,
                    acceptedAt: { gte: monthAgo }
                }
            }),
            prisma.termsOfService.findUnique({ where: { id: tosId } })
        ]);

        return {
            totalAcceptances: total,
            todayAcceptances: todayCount,
            weeklyAcceptances: weekCount,
            monthlyAcceptances: monthCount,
            currentVersion: tos?.version || 0
        };
    }


    // ============================================
    // SESSION METHODS
    // ============================================

    async createSession(data: CreateSessionDto) {
        return await prisma.onboardingSession.upsert({
            where: { discordId: data.discordId },
            create: data,
            update: { discordUsername: data.discordUsername }
        });
    }

    async getSession(discordId: string) {
        return await prisma.onboardingSession.findUnique({
            where: { discordId }
        });
    }

    async updateSession(discordId: string, data: UpdateSessionDto) {
        return await prisma.onboardingSession.update({
            where: { discordId },
            data
        });
    }

    async completeOnboarding(discordId: string) {
        return await prisma.onboardingSession.update({
            where: { discordId },
            data: {
                roleAssigned: true,
                registeredInDb: true,
                completedAt: new Date()
            }
        });
    }

    async getIncompleteSessions() {
        return await prisma.onboardingSession.findMany({
            where: {
                OR: [
                    { tosAccepted: false },
                    { questionsCompleted: false },
                    { roleAssigned: false },
                    { registeredInDb: false }
                ]
            },
            orderBy: { startedAt: "desc" }
        });
    }

    // ============================================
    // USER REGISTRATION
    // ============================================

    async registerUser(data: RegisterUserDto) {
        // Check if user already exists by discordId
        let user = await prisma.user.findUnique({
            where: { discordId: data.discordId }
        });

        if (user) {
            // Update existing user with complete data
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    fullname: data.fullname,
                    email: data.email,
                    phone: data.phone,
                    discordUsername: data.discordUsername,
                    discordDisplayName: data.discordDisplayName,
                    discordRole: "customer",
                    role: "user"
                }
            });
        } else {
            // Create new user
            user = await prisma.user.create({
                data: {
                    fullname: data.fullname,
                    email: data.email,
                    phone: data.phone,
                    discordId: data.discordId,
                    discordUsername: data.discordUsername,
                    discordDisplayName: data.discordDisplayName,
                    discordRole: "customer",
                    role: "user",
                    emailIsVerified: false
                }
            });

            // Create wallet for new customer
            await prisma.wallet.create({
                data: {
                    userId: user.id,
                    walletType: "CUSTOMER",
                    balance: 0,
                    currency: "USD"
                }
            });
        }

        return user;
    }

    // ============================================
    // PUBLISH TO DISCORD
    // ============================================

    async publishTosToDiscord(id: string) {
        // Get TOS by ID
        const tos = await prisma.termsOfService.findUnique({
            where: { id }
        });

        if (!tos) {
            throw new Error("Terms of Service not found");
        }

        // Check if Discord bot is initialized
        if (!discordClient.tosManager) {
            throw new Error("Discord bot TOS manager not initialized");
        }

        // Refresh the TOS channel with the latest data
        await discordClient.tosManager.refreshTosChannel();

        logger.info(`TOS published to Discord: ${tos.title} (ID: ${id})`);

        return {
            success: true,
            message: "TOS published to Discord successfully",
            tosId: id
        };
    }
}
