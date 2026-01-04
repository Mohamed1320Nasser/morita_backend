import { Service } from "typedi";
import prisma from "../../../common/prisma/client";
import { SubmitAnswersDto } from "../dtos";
import logger from "../../../common/loggers";
import * as XLSX from "xlsx";

@Service()
export default class AnswerService {
    async submitAnswers(data: SubmitAnswersDto) {

        const user = await prisma.user.findUnique({
            where: { discordId: data.discordId }
        });

        if (!user) {
            throw new Error("User not found. Please accept TOS first.");
        }

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

        await prisma.onboardingSession.update({
            where: { discordId: data.discordId },
            data: { questionsCompleted: true }
        });

        return {
            success: true,
            answersSubmitted: answers.length,
            data: answers
        };
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
            throw new Error("User not found");
        }

        return {
            userId: user.id,
            discordId: user.discordId,
            discordUsername: user.discordUsername,
            fullname: user.fullname,
            email: user.email,
            answeredAt: user.onboardingAnswers[0]?.answeredAt,
            totalAnswers: user.onboardingAnswers.length,
            answers: user.onboardingAnswers.map((a: any) => ({
                questionId: a.questionId,
                question: a.question.question,
                answer: a.answer,
                required: a.question.required,
                answeredAt: a.answeredAt
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
                totalAnswers: user.onboardingAnswers.length,
                answers: user.onboardingAnswers.map((a: any) => ({
                    questionId: a.questionId,
                    question: a.question.question,
                    answer: a.answer,
                    required: a.question.required,
                    answeredAt: a.answeredAt
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

        const questions = await prisma.onboardingQuestion.findMany({
            where: { isActive: true },
            orderBy: { displayOrder: "asc" }
        });

        const excelData = users.map((user: any) => {
            const row: any = {
                "User ID": user.id,
                "Discord ID": user.discordId,
                "Discord Username": user.discordUsername,
                "Full Name": user.fullname,
                "Email": user.email,
                "Joined At": user.createdAt
            };

            questions.forEach((q: any) => {
                const answer = user.onboardingAnswers.find((a: any) => a.questionId === q.id);
                row[q.question] = answer?.answer || "N/A";
            });

            return row;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        XLSX.utils.book_append_sheet(wb, ws, "Onboarding Responses");

        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        return buffer;
    }
}
