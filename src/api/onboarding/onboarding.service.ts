import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateTosDto,
    UpdateTosDto,
    AcceptTosDto,
    CreateQuestionDto,
    UpdateQuestionDto,
    SubmitAnswersDto,
    CreateSessionDto,
    UpdateSessionDto,
    RegisterUserDto
} from "./dtos";
import logger from "../../common/loggers";
import * as XLSX from "xlsx";
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
    // QUESTIONS METHODS
    // ============================================

    async getActiveQuestions() {
        return await prisma.onboardingQuestion.findMany({
            where: { isActive: true },
            orderBy: { displayOrder: "asc" }
        });
    }

    async getAllQuestions() {
        return await prisma.onboardingQuestion.findMany({
            orderBy: { displayOrder: "asc" },
            include: {
                _count: {
                    select: { answers: true }
                }
            }
        });
    }

    async getQuestionById(id: string) {
        return await prisma.onboardingQuestion.findUnique({
            where: { id },
            include: {
                answers: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                fullname: true,
                                discordUsername: true
                            }
                        }
                    },
                    orderBy: { answeredAt: "desc" },
                    take: 100
                }
            }
        });
    }

    async createQuestion(data: CreateQuestionDto) {
        return await prisma.onboardingQuestion.create({
            data
        });
    }

    async updateQuestion(id: string, data: UpdateQuestionDto) {
        return await prisma.onboardingQuestion.update({
            where: { id },
            data
        });
    }

    async deleteQuestion(id: string) {
        return await prisma.onboardingQuestion.delete({
            where: { id }
        });
    }

    async reorderQuestions(questionIds: string[]) {
        // Update display order based on array order
        const updates = questionIds.map((id, index) =>
            prisma.onboardingQuestion.update({
                where: { id },
                data: { displayOrder: index }
            })
        );

        await prisma.$transaction(updates);

        return { success: true };
    }

    // ============================================
    // ANSWERS METHODS
    // ============================================

    async submitAnswers(data: SubmitAnswersDto) {
        // Find or create user
        let user = await prisma.user.findUnique({
            where: { discordId: data.discordId }
        });

        if (!user) {
            throw new Error("User not found. Please accept TOS first.");
        }

        // Create answer records
        const answers = await Promise.all(
            data.answers.map(answer =>
                prisma.onboardingAnswer.upsert({
                    where: {
                        userId_questionId: {
                            userId: user.id,
                            questionId: answer.questionId
                        }
                    },
                    create: {
                        userId: user.id,
                        questionId: answer.questionId,
                        answer: answer.answer,
                        discordId: data.discordId
                    },
                    update: {
                        answer: answer.answer
                    }
                })
            )
        );

        // Update onboarding session
        await prisma.onboardingSession.update({
            where: { discordId: data.discordId },
            data: { questionsCompleted: true }
        });

        return answers;
    }

    async getUserAnswers(discordId: string) {
        const user = await prisma.user.findUnique({
            where: { discordId },
            include: {
                onboardingAnswers: {
                    include: {
                        question: true
                    },
                    orderBy: { answeredAt: "desc" }
                }
            }
        });

        if (!user) {
            return null;
        }

        return {
            userId: user.id,
            discordId: user.discordId,
            discordUsername: user.discordUsername,
            fullname: user.fullname,
            email: user.email,
            answeredAt: user.onboardingAnswers[0]?.answeredAt,
            answers: user.onboardingAnswers.map((a: any) => ({
                questionId: a.questionId,
                question: a.question.question,
                answer: a.answer,
                required: a.question.required
            }))
        };
    }

    async getAllAnswers(page: number = 1, limit: number = 50) {
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where: {
                    discordId: { not: null },
                    onboardingAnswers: {
                        some: {}
                    }
                },
                include: {
                    onboardingAnswers: {
                        include: {
                            question: true
                        }
                    }
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit
            }),
            prisma.user.count({
                where: {
                    discordId: { not: null },
                    onboardingAnswers: {
                        some: {}
                    }
                }
            })
        ]);

        return {
            data: users.map((user: any) => ({
                userId: user.id,
                discordId: user.discordId,
                discordUsername: user.discordUsername,
                fullname: user.fullname,
                email: user.email,
                createdAt: user.createdAt,
                answers: user.onboardingAnswers.map((a: any) => ({
                    questionId: a.questionId,
                    question: a.question.question,
                    answer: a.answer,
                    required: a.question.required
                }))
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async exportToExcel() {
        const users = await prisma.user.findMany({
            where: {
                discordId: { not: null },
                onboardingAnswers: {
                    some: {}
                }
            },
            include: {
                onboardingAnswers: {
                    include: {
                        question: true
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        // Get all questions for column headers
        const questions = await this.getActiveQuestions();

        // Prepare data for Excel
        const excelData = users.map((user: any) => {
            const row: any = {
                "User ID": user.id,
                "Discord ID": user.discordId,
                "Discord Username": user.discordUsername,
                "Full Name": user.fullname,
                "Email": user.email,
                "Joined At": user.createdAt
            };

            // Add answer columns
            questions.forEach((q: any) => {
                const answer = user.onboardingAnswers.find((a: any) => a.questionId === q.id);
                row[q.question] = answer?.answer || "N/A";
            });

            return row;
        });

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Onboarding Responses");

        // Generate buffer
        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        return buffer;
    }

    async getAnswerStatistics() {
        const questions = await prisma.onboardingQuestion.findMany({
            include: {
                _count: {
                    select: { answers: true }
                }
            },
            orderBy: { displayOrder: "asc" }
        });

        return questions.map((q: any) => ({
            questionId: q.id,
            question: q.question,
            required: q.required,
            responses: q._count.answers
        }));
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
