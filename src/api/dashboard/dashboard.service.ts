import { Service } from "typedi";
import prisma from "../../common/prisma/client";

@Service()
export default class DashboardService {
    public async getStats() {
        const [categoriesCount, servicesCount] = await Promise.all([
            prisma.serviceCategory.count({ where: { deletedAt: null } }),
            prisma.service.count({ where: { deletedAt: null } }),
        ]);

        return { categoriesCount, servicesCount };
    }

    public async getTopServices(limit: number = 5) {
        const services = await prisma.service.findMany({
            where: { deletedAt: null },
            select: {
                id: true,
                name: true,
                slug: true,
                emoji: true,
                createdAt: true,
                pricingMethods: {
                    where: { deletedAt: null, active: true },
                    select: { id: true },
                },
                category: { select: { id: true, name: true, slug: true } },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return services.map(s => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            emoji: s.emoji,
            category: s.category,
            pricingMethodCount: s.pricingMethods.length,
            createdAt: s.createdAt,
        }));
    }
}
