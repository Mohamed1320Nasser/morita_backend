import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { BadRequestError, NotFoundError } from "routing-controllers";
import { countStart } from "../../common/helpers/pagination.helper";
import logger from "../../common/loggers";

export type WorkerFeedbackType = "PRAISE" | "WARNING" | "NOTE";

@Service()
export default class WorkerFeedbackService {
    async create(data: {
        workerId?: number;
        workerDiscordId?: string;
        authorId?: number;
        authorDiscordId?: string;
        type: WorkerFeedbackType;
        rating?: number | null;
        comment: string;
        orderId?: string | null;
    }) {
        const worker = await this.resolveUser(data.workerId, data.workerDiscordId, "Worker");
        const author = await this.resolveUser(data.authorId, data.authorDiscordId, "Author");

        if (worker.id === author.id) {
            throw new BadRequestError("You cannot leave feedback on yourself");
        }

        if (!data.comment?.trim()) {
            throw new BadRequestError("A comment is required");
        }

        if (data.rating != null) {
            if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
                throw new BadRequestError("Rating must be a whole number between 1 and 5");
            }
        }

        if (data.orderId) {
            const order = await prisma.order.findUnique({
                where: { id: data.orderId },
                select: { id: true, workerId: true },
            });

            if (!order) {
                throw new NotFoundError("Order not found");
            }

            if (order.workerId !== worker.id) {
                throw new BadRequestError("That order is not assigned to this worker");
            }
        }

        const feedback = await prisma.workerFeedback.create({
            data: {
                workerId: worker.id,
                authorId: author.id,
                type: data.type,
                rating: data.rating ?? null,
                comment: data.comment.trim(),
                orderId: data.orderId || null,
            },
            include: {
                worker: { select: { id: true, fullname: true, discordUsername: true } },
                author: { select: { id: true, fullname: true, discordUsername: true } },
            },
        });

        logger.info(
            `[WorkerFeedback] ${data.type} recorded for worker ${worker.id} by ${author.id}`
        );

        return feedback;
    }

    private async resolveUser(id?: number, discordId?: string, label = "User") {
        const user = id
            ? await prisma.user.findUnique({ where: { id } })
            : discordId
              ? await prisma.user.findUnique({ where: { discordId } })
              : null;

        if (!user) {
            throw new NotFoundError(`${label} not found`);
        }

        return user;
    }

    async list(query: {
        workerId?: number;
        type?: WorkerFeedbackType;
        page?: number;
        limit?: number;
    }) {
        const page = query.page || 1;
        const limit = query.limit || 20;

        const where: any = {};
        if (query.workerId) where.workerId = Number(query.workerId);
        if (query.type) where.type = query.type;

        const [list, total] = await Promise.all([
            prisma.workerFeedback.findMany({
                where,
                include: {
                    worker: {
                        select: { id: true, fullname: true, discordUsername: true },
                    },
                    author: {
                        select: { id: true, fullname: true, discordUsername: true },
                    },
                    order: { select: { id: true, orderNumber: true } },
                },
                orderBy: { createdAt: "desc" },
                skip: countStart(page, limit),
                take: limit,
            }),
            prisma.workerFeedback.count({ where }),
        ]);

        return { list, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    async remove(id: string) {
        const existing = await prisma.workerFeedback.findUnique({ where: { id } });

        if (!existing) {
            throw new NotFoundError("Feedback not found");
        }

        await prisma.workerFeedback.delete({ where: { id } });
        return { message: "Feedback removed" };
    }

    /**
     * Feedback totals per worker for the KPI panel, keyed by worker id.
     *
     * Reported next to the customer-driven numbers rather than folded into
     * them: a single blended score hides why a worker is scoring badly, which
     * is the part a manager actually needs.
     */
    async summaryByWorker(gte?: Date, lte?: Date) {
        const where: any = {};
        if (gte || lte) {
            where.createdAt = {};
            if (gte) where.createdAt.gte = gte;
            if (lte) where.createdAt.lte = lte;
        }

        const rows = await prisma.workerFeedback.findMany({
            where,
            select: { workerId: true, type: true, rating: true },
        });

        const byWorker = new Map<
            number,
            { praise: number; warnings: number; notes: number; ratings: number[] }
        >();

        for (const row of rows) {
            const entry = byWorker.get(row.workerId) || {
                praise: 0,
                warnings: 0,
                notes: 0,
                ratings: [],
            };

            if (row.type === "PRAISE") entry.praise++;
            else if (row.type === "WARNING") entry.warnings++;
            else entry.notes++;

            if (row.rating != null) entry.ratings.push(row.rating);

            byWorker.set(row.workerId, entry);
        }

        const summary = new Map<number, any>();
        for (const [workerId, entry] of byWorker) {
            summary.set(workerId, {
                staffPraise: entry.praise,
                staffWarnings: entry.warnings,
                staffNotes: entry.notes,
                staffFeedbackCount: entry.praise + entry.warnings + entry.notes,
                avgStaffRating: entry.ratings.length
                    ? parseFloat(
                          (
                              entry.ratings.reduce((a, b) => a + b, 0) / entry.ratings.length
                          ).toFixed(2)
                      )
                    : null,
            });
        }

        return summary;
    }
}
