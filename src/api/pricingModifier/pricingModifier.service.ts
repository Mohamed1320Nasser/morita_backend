import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreatePricingModifierDto,
    UpdatePricingModifierDto,
    GetPricingModifierListDto,
} from "./dtos";
import { NotFoundError } from "routing-controllers";

@Service()
export default class PricingModifierService {
    constructor() {}

    async create(data: CreatePricingModifierDto) {
        // Check if pricing method exists
        const method = await prisma.pricingMethod.findFirst({
            where: { id: data.methodId, deletedAt: null },
        });

        if (!method) {
            throw new NotFoundError("Pricing method not found");
        }

        const modifier = await prisma.pricingModifier.create({
            data,
        });

        return modifier;
    }

    async getList(query: GetPricingModifierListDto) {
        const { methodId, search, active, page, limit, sortBy, sortOrder } =
            query;
        const skip = ((page || 1) - 1) * (limit || 10);

        const where = {
            ...(methodId ? { methodId } : {}),
            ...(active !== undefined ? { active } : {}),
            ...(search
                ? {
                      OR: [
                          { name: { contains: search } },
                          { condition: { contains: search } },
                      ],
                  }
                : {}),
        };

        const [modifiers, total] = await Promise.all([
            prisma.pricingModifier.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    [sortBy as string]: sortOrder,
                },
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
            }),
            prisma.pricingModifier.count({ where }),
        ]);

        return {
            list: modifiers,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / (limit || 10)),
        };
    }

    async getSingle(id: string) {
        const modifier = await prisma.pricingModifier.findFirst({
            where: { id },
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
        });

        if (!modifier) {
            throw new NotFoundError("Pricing modifier not found");
        }

        return modifier;
    }

    async update(id: string, data: UpdatePricingModifierDto) {
        const modifier = await prisma.pricingModifier.findFirst({
            where: { id },
        });

        if (!modifier) {
            throw new NotFoundError("Pricing modifier not found");
        }

        const updatedModifier = await prisma.pricingModifier.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
        });

        return updatedModifier;
    }

    async delete(id: string) {
        const modifier = await prisma.pricingModifier.findFirst({
            where: { id },
        });

        if (!modifier) {
            throw new NotFoundError("Pricing modifier not found");
        }

        await prisma.pricingModifier.delete({
            where: { id },
        });

        return { message: "Pricing modifier deleted successfully" };
    }

    async getByMethod(methodId: string) {
        const modifiers = await prisma.pricingModifier.findMany({
            where: {
                methodId,
                active: true,
            },
            orderBy: { priority: "asc" },
        });

        return modifiers;
    }
}
