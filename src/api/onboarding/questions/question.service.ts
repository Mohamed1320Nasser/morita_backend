import { Service } from "typedi";
import prisma from "../../../common/prisma/client";
import { CreateQuestionDto, UpdateQuestionDto } from "../dtos";
import logger from "../../../common/loggers";

@Service()
export default class QuestionService {
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
        const question = await prisma.onboardingQuestion.findUnique({
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

        if (!question) {
            throw new Error("Question not found");
        }

        return question;
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
        const updates = questionIds.map((id, index) =>
            prisma.onboardingQuestion.update({
                where: { id },
                data: { displayOrder: index }
            })
        );

        await prisma.$transaction(updates);

        return { success: true, message: "Questions reordered successfully" };
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
            responses: q._count.answers,
            isActive: q.isActive,
            displayOrder: q.displayOrder
        }));
    }
}
