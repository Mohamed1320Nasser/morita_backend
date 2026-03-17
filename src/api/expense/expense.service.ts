import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { CreateExpenseDto } from "../kpi/dtos";
import { NotFoundError } from "routing-controllers";
import logger from "../../common/loggers";

@Service()
export default class ExpenseService {
    async createExpense(dto: CreateExpenseDto & { createdBy: number }) {
        logger.info(`[ExpenseService] Creating expense: ${dto.category} - $${dto.amount}`);

        const expense = await prisma.operationalExpense.create({
            data: {
                category: dto.category,
                amount: dto.amount,
                description: dto.description,
                date: new Date(dto.date),
                recurring: dto.recurring || false,
                frequency: dto.frequency,
                reference: dto.reference,
                createdBy: dto.createdBy
            },
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true,
                        discordUsername: true
                    }
                }
            }
        });

        return {
            msg: 'Expense created successfully',
            status: 201,
            data: expense,
            error: false
        };
    }

    async getExpenses(query: any) {
        const { category, startDate, endDate, page = 1, limit = 50 } = query;

        const where: any = {};

        if (category) {
            where.category = category;
        }

        if (startDate || endDate) {
            where.date = {};
            if (startDate) where.date.gte = new Date(startDate);
            if (endDate) where.date.lte = new Date(endDate);
        }

        const expenses = await prisma.operationalExpense.findMany({
            where,
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true,
                        discordUsername: true
                    }
                }
            },
            orderBy: { date: 'desc' },
            skip: (page - 1) * limit,
            take: limit
        });

        const total = await prisma.operationalExpense.count({ where });

        return {
            msg: 'Expenses retrieved successfully',
            status: 200,
            data: {
                expenses,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            },
            error: false
        };
    }

    async deleteExpense(id: string) {
        const expense = await prisma.operationalExpense.findUnique({
            where: { id }
        });

        if (!expense) {
            throw new NotFoundError('Expense not found');
        }

        await prisma.operationalExpense.delete({
            where: { id }
        });

        return {
            msg: 'Expense deleted successfully',
            status: 200,
            data: null,
            error: false
        };
    }
}
