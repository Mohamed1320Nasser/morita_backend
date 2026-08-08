import { Service } from "typedi";
import prisma from "../../../common/prisma/client";
import { CreateQuestionDto, UpdateQuestionDto } from "../dtos";
import { QuestionFieldKey } from "@prisma/client";
import { BadRequestError } from "routing-controllers";
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
        await this.assertFieldKeyAvailable(data.fieldKey);

        return await prisma.onboardingQuestion.create({
            data
        });
    }

    private async assertFieldKeyAvailable(
        fieldKey?: QuestionFieldKey,
        excludeQuestionId?: string
    ) {
        if (!fieldKey || fieldKey === QuestionFieldKey.NONE) {
            return;
        }

        const conflict = await prisma.onboardingQuestion.findFirst({
            where: {
                fieldKey,
                isActive: true,
                ...(excludeQuestionId && { id: { not: excludeQuestionId } })
            },
            select: { question: true }
        });

        if (conflict) {
            throw new BadRequestError(
                `Another active question is already mapped to "${fieldKey}": "${conflict.question}". ` +
                `Each profile field can only be linked to one question.`
            );
        }
    }

    async updateQuestion(id: string, data: UpdateQuestionDto) {
        await this.assertFieldKeyAvailable(data.fieldKey, id);

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
