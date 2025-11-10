import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreatePaymentMethodDto,
    UpdatePaymentMethodDto,
    GetPaymentMethodListDto,
} from "./dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";

@Service()
export default class PaymentMethodService {
    constructor() {}

    async create(data: CreatePaymentMethodDto) {
        // Check if payment method with same name already exists
        const existingMethod = await prisma.paymentMethod.findFirst({
            where: { name: data.name },
        });

        if (existingMethod) {
            throw new BadRequestError(
                "Payment method with this name already exists"
            );
        }

        const paymentMethod = await prisma.paymentMethod.create({
            data,
        });

        return paymentMethod;
    }

    async getList(query: GetPaymentMethodListDto) {
        const { type, search, active, page, limit, sortBy, sortOrder } = query;
        const skip = ((page || 1) - 1) * (limit || 10);

        const where = {
            ...(type ? { type } : {}),
            ...(active !== undefined ? { active } : {}),
            ...(search
                ? {
                      name: { contains: search },
                  }
                : {}),
            deletedAt: null,
        };

        const [methods, total] = await Promise.all([
            prisma.paymentMethod.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    [sortBy as string]: sortOrder,
                },
                include: {
                    methodPrices: {
                        include: {
                            method: {
                                select: {
                                    id: true,
                                    name: true,
                                    service: {
                                        select: {
                                            id: true,
                                            name: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma.paymentMethod.count({ where }),
        ]);

        return {
            list: methods,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / (limit || 10)),
        };
    }

    async getSingle(id: string) {
        const method = await prisma.paymentMethod.findFirst({
            where: {
                id,
                deletedAt: null,
            },
            include: {
                methodPrices: {
                    include: {
                        method: {
                            select: {
                                id: true,
                                name: true,
                                service: {
                                    select: {
                                        id: true,
                                        name: true,
                                        category: {
                                            select: {
                                                id: true,
                                                name: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!method) {
            throw new NotFoundError("Payment method not found");
        }

        return method;
    }

    async update(id: string, data: UpdatePaymentMethodDto) {
        const method = await prisma.paymentMethod.findFirst({
            where: { id, deletedAt: null },
        });

        if (!method) {
            throw new NotFoundError("Payment method not found");
        }

        // Check if name already exists (if being updated)
        if (data.name && data.name !== method.name) {
            const existingMethod = await prisma.paymentMethod.findFirst({
                where: { name: data.name },
            });

            if (existingMethod) {
                throw new BadRequestError(
                    "Payment method with this name already exists"
                );
            }
        }

        const updatedMethod = await prisma.paymentMethod.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
        });

        return updatedMethod;
    }

    async delete(id: string) {
        const method = await prisma.paymentMethod.findFirst({
            where: { id, deletedAt: null },
        });

        if (!method) {
            throw new NotFoundError("Payment method not found");
        }

        // Check if method has active orders
        const activeOrders = await prisma.order.count({
            where: {
                paymentMethodId: id,
                status: { in: ["PENDING", "IN_PROGRESS"] },
            },
        });

        if (activeOrders > 0) {
            throw new BadRequestError(
                "Cannot delete payment method with active orders"
            );
        }

        // Soft delete
        await prisma.paymentMethod.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                updatedAt: new Date(),
            },
        });

        return { message: "Payment method deleted successfully" };
    }

    async getPublicList() {
        const methods = await prisma.paymentMethod.findMany({
            where: {
                active: true,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                type: true,
            },
            orderBy: { name: "asc" },
        });

        return methods;
    }
}
