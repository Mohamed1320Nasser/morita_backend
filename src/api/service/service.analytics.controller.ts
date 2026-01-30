import { JsonController, Get, Authorized, QueryParams, Param } from "routing-controllers";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";
import API from "../../common/config/api.types";
import { Decimal } from "@prisma/client/runtime/library";

@JsonController("/api/admin/services/stats")
@Service()
export default class ServiceAnalyticsController {
    @Get("/overview")
    @Authorized(API.Role.admin)
    async getOverview(@QueryParams() query: { startDate?: string; endDate?: string }) {
        logger.info("[Admin] Fetching service analytics overview");

        try {
            // Date range setup
            const dateFilter: any = {};
            if (query.startDate || query.endDate) {
                dateFilter.createdAt = {};
                if (query.startDate) {
                    dateFilter.createdAt.gte = new Date(query.startDate);
                }
                if (query.endDate) {
                    const endDate = new Date(query.endDate);
                    endDate.setHours(23, 59, 59, 999);
                    dateFilter.createdAt.lte = endDate;
                }
            }

            // Get service counts
            const [totalServices, activeServices] = await Promise.all([
                prisma.service.count(),
                prisma.service.count({ where: { active: true } }),
            ]);

            // Get order statistics
            const orders = await prisma.order.findMany({
                where: dateFilter,
                select: {
                    id: true,
                    orderValue: true,
                    status: true,
                    serviceId: true,
                    service: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            const totalOrders = orders.length;
            const totalRevenue = orders
                .filter((o) => o.status === "COMPLETED")
                .reduce((sum, o) => sum + parseFloat(o.orderValue.toString()), 0);

            const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

            // Find top performing service
            const serviceStats = new Map<string, { name: string; orderCount: number; revenue: number }>();

            orders.forEach((order) => {
                if (!order.serviceId || !order.service) return;

                const existing = serviceStats.get(order.serviceId) || {
                    name: order.service.name,
                    orderCount: 0,
                    revenue: 0,
                };

                existing.orderCount++;
                if (order.status === "COMPLETED") {
                    existing.revenue += parseFloat(order.orderValue.toString());
                }

                serviceStats.set(order.serviceId, existing);
            });

            // Find top service by revenue
            let topPerformingService = null;
            let maxRevenue = 0;

            serviceStats.forEach((stats, serviceId) => {
                if (stats.revenue > maxRevenue) {
                    maxRevenue = stats.revenue;
                    topPerformingService = {
                        id: serviceId,
                        name: stats.name,
                        orderCount: stats.orderCount,
                        revenue: stats.revenue,
                    };
                }
            });

            return {
                success: true,
                data: {
                    totalServices,
                    activeServices,
                    totalOrders,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
                    topPerformingService,
                },
            };
        } catch (error) {
            logger.error("[Admin] Get service overview error:", error);
            throw error;
        }
    }

    @Get("/top-services")
    @Authorized(API.Role.admin)
    async getTopServices(
        @QueryParams()
        query: {
            period?: number;
            startDate?: string;
            endDate?: string;
            limit?: number;
            sortBy?: "revenue" | "orders" | "avgValue" | "completionRate";
        }
    ) {
        const limit = query.limit || 10;
        const sortBy = query.sortBy || "revenue";
        logger.info(`[Admin] Fetching top ${limit} services sorted by ${sortBy}`);

        try {
            // Date range setup
            let startDate: Date;
            let endDate: Date;

            if (query.startDate && query.endDate) {
                startDate = new Date(query.startDate);
                endDate = new Date(query.endDate);
                endDate.setHours(23, 59, 59, 999);
            } else {
                const period = query.period || 30;
                startDate = new Date();
                startDate.setDate(startDate.getDate() - period);
                endDate = new Date();
            }

            // Get all orders with services in the date range
            const orders = await prisma.order.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                    serviceId: { not: null },
                },
                select: {
                    id: true,
                    orderValue: true,
                    status: true,
                    serviceId: true,
                    createdAt: true,
                    assignedAt: true,
                    completedAt: true,
                    service: {
                        select: {
                            id: true,
                            name: true,
                            category: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                },
            });

            // Calculate statistics per service
            const serviceStatsMap = new Map<
                string,
                {
                    serviceId: string;
                    serviceName: string;
                    categoryName: string;
                    orderCount: number;
                    completedCount: number;
                    totalRevenue: number;
                    completionTimes: number[];
                }
            >();

            orders.forEach((order) => {
                if (!order.serviceId || !order.service) return;

                const existing = serviceStatsMap.get(order.serviceId) || {
                    serviceId: order.serviceId,
                    serviceName: order.service.name,
                    categoryName: order.service.category?.name || "Unknown",
                    orderCount: 0,
                    completedCount: 0,
                    totalRevenue: 0,
                    completionTimes: [],
                };

                existing.orderCount++;

                if (order.status === "COMPLETED") {
                    existing.completedCount++;
                    existing.totalRevenue += parseFloat(order.orderValue.toString());

                    // Calculate completion time in hours
                    if (order.assignedAt && order.completedAt) {
                        const timeInMs = order.completedAt.getTime() - order.assignedAt.getTime();
                        const timeInHours = timeInMs / (1000 * 60 * 60);
                        existing.completionTimes.push(timeInHours);
                    }
                }

                serviceStatsMap.set(order.serviceId, existing);
            });

            // Convert to array and calculate final metrics
            const serviceStats = Array.from(serviceStatsMap.values()).map((stats) => {
                const avgCompletionTime =
                    stats.completionTimes.length > 0
                        ? stats.completionTimes.reduce((a, b) => a + b, 0) / stats.completionTimes.length
                        : 0;

                return {
                    serviceId: stats.serviceId,
                    serviceName: stats.serviceName,
                    categoryName: stats.categoryName,
                    orderCount: stats.orderCount,
                    totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
                    averageOrderValue:
                        stats.completedCount > 0
                            ? Math.round((stats.totalRevenue / stats.completedCount) * 100) / 100
                            : 0,
                    completionRate:
                        stats.orderCount > 0
                            ? Math.round((stats.completedCount / stats.orderCount) * 100 * 10) / 10
                            : 0,
                    avgCompletionTime: Math.round(avgCompletionTime * 10) / 10,
                };
            });

            // Sort based on sortBy parameter
            serviceStats.sort((a, b) => {
                switch (sortBy) {
                    case "orders":
                        return b.orderCount - a.orderCount;
                    case "avgValue":
                        return b.averageOrderValue - a.averageOrderValue;
                    case "completionRate":
                        return b.completionRate - a.completionRate;
                    case "revenue":
                    default:
                        return b.totalRevenue - a.totalRevenue;
                }
            });

            return {
                success: true,
                data: serviceStats.slice(0, limit),
            };
        } catch (error) {
            logger.error("[Admin] Get top services error:", error);
            throw error;
        }
    }

    @Get("/service/:serviceId")
    @Authorized(API.Role.admin)
    async getServiceDetails(
        @Param("serviceId") serviceId: string,
        @QueryParams() query: { startDate?: string; endDate?: string }
    ) {
        logger.info(`[Admin] Fetching analytics for service ${serviceId}`);

        try {
            // Get service info
            const service = await prisma.service.findUnique({
                where: { id: serviceId },
                select: {
                    id: true,
                    name: true,
                    category: {
                        select: {
                            name: true,
                        },
                    },
                },
            });

            if (!service) {
                throw new Error("Service not found");
            }

            // Date range setup
            const dateFilter: any = { serviceId };
            if (query.startDate || query.endDate) {
                dateFilter.createdAt = {};
                if (query.startDate) {
                    dateFilter.createdAt.gte = new Date(query.startDate);
                }
                if (query.endDate) {
                    const endDate = new Date(query.endDate);
                    endDate.setHours(23, 59, 59, 999);
                    dateFilter.createdAt.lte = endDate;
                }
            }

            // Get all orders for this service
            const orders = await prisma.order.findMany({
                where: dateFilter,
                select: {
                    id: true,
                    orderValue: true,
                    workerPayout: true,
                    systemPayout: true,
                    status: true,
                    createdAt: true,
                    assignedAt: true,
                    completedAt: true,
                },
            });

            // Calculate order statistics by status
            const ordersByStatus = {
                total: orders.length,
                completed: orders.filter((o) => o.status === "COMPLETED").length,
                inProgress: orders.filter((o) => o.status === "IN_PROGRESS").length,
                pending: orders.filter((o) => o.status === "PENDING").length,
                cancelled: orders.filter((o) => o.status === "CANCELLED").length,
                disputed: orders.filter((o) => o.status === "DISPUTED").length,
            };

            // Calculate revenue statistics
            const completedOrders = orders.filter((o) => o.status === "COMPLETED");
            const totalRevenue = completedOrders.reduce(
                (sum, o) => sum + parseFloat(o.orderValue.toString()),
                0
            );
            const workerPayouts = completedOrders.reduce(
                (sum, o) => sum + (o.workerPayout ? parseFloat(o.workerPayout.toString()) : 0),
                0
            );
            const systemRevenue = completedOrders.reduce(
                (sum, o) => sum + (o.systemPayout ? parseFloat(o.systemPayout.toString()) : 0),
                0
            );

            const revenue = {
                total: Math.round(totalRevenue * 100) / 100,
                average:
                    completedOrders.length > 0
                        ? Math.round((totalRevenue / completedOrders.length) * 100) / 100
                        : 0,
                workerPayouts: Math.round(workerPayouts * 100) / 100,
                systemRevenue: Math.round(systemRevenue * 100) / 100,
            };

            // Calculate performance metrics
            const completionTimes: number[] = [];
            const assignmentTimes: number[] = [];

            completedOrders.forEach((order) => {
                if (order.assignedAt && order.completedAt) {
                    const timeInHours =
                        (order.completedAt.getTime() - order.assignedAt.getTime()) / (1000 * 60 * 60);
                    completionTimes.push(timeInHours);
                }

                if (order.assignedAt) {
                    const timeInMinutes =
                        (order.assignedAt.getTime() - order.createdAt.getTime()) / (1000 * 60);
                    assignmentTimes.push(timeInMinutes);
                }
            });

            const avgCompletionTime =
                completionTimes.length > 0
                    ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
                    : 0;

            const avgAssignmentTime =
                assignmentTimes.length > 0
                    ? assignmentTimes.reduce((a, b) => a + b, 0) / assignmentTimes.length
                    : 0;

            const performance = {
                completionRate:
                    orders.length > 0
                        ? Math.round((ordersByStatus.completed / orders.length) * 100 * 10) / 10
                        : 0,
                avgCompletionTime: Math.round(avgCompletionTime * 10) / 10,
                avgAssignmentTime: Math.round(avgAssignmentTime * 10) / 10,
                cancellationRate:
                    orders.length > 0
                        ? Math.round((ordersByStatus.cancelled / orders.length) * 100 * 10) / 10
                        : 0,
                disputeRate:
                    orders.length > 0
                        ? Math.round((ordersByStatus.disputed / orders.length) * 100 * 10) / 10
                        : 0,
            };

            // Calculate timeline (daily aggregates)
            const timelineMap = new Map<string, { orderCount: number; revenue: number }>();

            orders.forEach((order) => {
                const dateKey = order.createdAt.toISOString().split("T")[0];
                const existing = timelineMap.get(dateKey) || { orderCount: 0, revenue: 0 };

                existing.orderCount++;
                if (order.status === "COMPLETED") {
                    existing.revenue += parseFloat(order.orderValue.toString());
                }

                timelineMap.set(dateKey, existing);
            });

            const timeline = Array.from(timelineMap.entries())
                .map(([date, data]) => ({
                    date,
                    orderCount: data.orderCount,
                    revenue: Math.round(data.revenue * 100) / 100,
                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            return {
                success: true,
                data: {
                    service: {
                        id: service.id,
                        name: service.name,
                        category: service.category?.name || "Unknown",
                    },
                    orders: ordersByStatus,
                    revenue,
                    performance,
                    timeline,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get service ${serviceId} details error:`, error);
            throw error;
        }
    }

    @Get("/revenue-trend")
    @Authorized(API.Role.admin)
    async getRevenueTrend(
        @QueryParams()
        query: {
            days?: number;
            startDate?: string;
            endDate?: string;
            serviceIds?: string; // Comma-separated
        }
    ) {
        logger.info("[Admin] Fetching revenue trend data");

        try {
            // Date range setup
            let startDate: Date;
            let endDate: Date;
            let days: number;

            if (query.startDate && query.endDate) {
                startDate = new Date(query.startDate);
                endDate = new Date(query.endDate);
                endDate.setHours(23, 59, 59, 999);
                days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            } else {
                days = query.days || 30;
                startDate = new Date();
                startDate.setDate(startDate.getDate() - days);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date();
                endDate.setHours(23, 59, 59, 999);
            }

            // Parse service IDs filter
            const serviceIdFilter: any = { serviceId: { not: null } };
            if (query.serviceIds) {
                const serviceIds = query.serviceIds.split(",").map((id) => id.trim());
                serviceIdFilter.serviceId = { in: serviceIds };
            }

            // Get orders in date range
            const orders = await prisma.order.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                    ...serviceIdFilter,
                },
                select: {
                    createdAt: true,
                    orderValue: true,
                    status: true,
                    serviceId: true,
                    service: {
                        select: {
                            name: true,
                        },
                    },
                },
            });

            // If filtering by specific services, create per-service timelines
            if (query.serviceIds) {
                const serviceIds = query.serviceIds.split(",").map((id) => id.trim());
                const serviceTimelines = new Map<
                    string,
                    Map<string, { orderCount: number; revenue: number }>
                >();

                orders.forEach((order) => {
                    if (!order.serviceId) return;

                    const dateKey = order.createdAt.toISOString().split("T")[0];

                    if (!serviceTimelines.has(order.serviceId)) {
                        serviceTimelines.set(order.serviceId, new Map());
                    }

                    const serviceMap = serviceTimelines.get(order.serviceId)!;
                    const existing = serviceMap.get(dateKey) || { orderCount: 0, revenue: 0 };

                    existing.orderCount++;
                    if (order.status === "COMPLETED") {
                        existing.revenue += parseFloat(order.orderValue.toString());
                    }

                    serviceMap.set(dateKey, existing);
                });

                // Convert to array format
                const result: any = {};
                serviceTimelines.forEach((timeline, serviceId) => {
                    const serviceName = orders.find((o) => o.serviceId === serviceId)?.service?.name || serviceId;
                    const dataPoints = [];

                    for (let i = 0; i < days; i++) {
                        const date = new Date(startDate);
                        date.setDate(date.getDate() + i);
                        const dateKey = date.toISOString().split("T")[0];
                        const data = timeline.get(dateKey) || { orderCount: 0, revenue: 0 };

                        dataPoints.push({
                            date: dateKey,
                            orderCount: data.orderCount,
                            revenue: Math.round(data.revenue * 100) / 100,
                        });
                    }

                    result[serviceName] = dataPoints;
                });

                return {
                    success: true,
                    data: result,
                };
            } else {
                // Aggregate timeline for all services
                const timelineMap = new Map<string, { orderCount: number; revenue: number }>();

                orders.forEach((order) => {
                    const dateKey = order.createdAt.toISOString().split("T")[0];
                    const existing = timelineMap.get(dateKey) || { orderCount: 0, revenue: 0 };

                    existing.orderCount++;
                    if (order.status === "COMPLETED") {
                        existing.revenue += parseFloat(order.orderValue.toString());
                    }

                    timelineMap.set(dateKey, existing);
                });

                // Fill in missing dates
                const result = [];
                for (let i = 0; i < days; i++) {
                    const date = new Date(startDate);
                    date.setDate(date.getDate() + i);
                    const dateKey = date.toISOString().split("T")[0];
                    const data = timelineMap.get(dateKey) || { orderCount: 0, revenue: 0 };

                    result.push({
                        date: dateKey,
                        orderCount: data.orderCount,
                        revenue: Math.round(data.revenue * 100) / 100,
                    });
                }

                return {
                    success: true,
                    data: result,
                };
            }
        } catch (error) {
            logger.error("[Admin] Get revenue trend error:", error);
            throw error;
        }
    }

    @Get("/categories")
    @Authorized(API.Role.admin)
    async getCategoryStats(@QueryParams() query: { startDate?: string; endDate?: string }) {
        logger.info("[Admin] Fetching category statistics");

        try {
            // Date range setup
            const dateFilter: any = {};
            if (query.startDate || query.endDate) {
                dateFilter.createdAt = {};
                if (query.startDate) {
                    dateFilter.createdAt.gte = new Date(query.startDate);
                }
                if (query.endDate) {
                    const endDate = new Date(query.endDate);
                    endDate.setHours(23, 59, 59, 999);
                    dateFilter.createdAt.lte = endDate;
                }
            }

            // Get all orders with service and category info
            const orders = await prisma.order.findMany({
                where: {
                    ...dateFilter,
                    serviceId: { not: null },
                },
                select: {
                    orderValue: true,
                    status: true,
                    service: {
                        select: {
                            categoryId: true,
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            });

            // Calculate stats per category
            const categoryStatsMap = new Map<
                string,
                {
                    categoryId: string;
                    categoryName: string;
                    orderCount: number;
                    revenue: number;
                    completedCount: number;
                }
            >();

            orders.forEach((order) => {
                if (!order.service?.category) return;

                const categoryId = order.service.categoryId;
                const existing = categoryStatsMap.get(categoryId) || {
                    categoryId,
                    categoryName: order.service.category.name,
                    orderCount: 0,
                    revenue: 0,
                    completedCount: 0,
                };

                existing.orderCount++;
                if (order.status === "COMPLETED") {
                    existing.completedCount++;
                    existing.revenue += parseFloat(order.orderValue.toString());
                }

                categoryStatsMap.set(categoryId, existing);
            });

            // Convert to array and calculate percentages
            const totalOrders = orders.length;
            const categoryStats = Array.from(categoryStatsMap.values())
                .map((stats) => ({
                    categoryId: stats.categoryId,
                    categoryName: stats.categoryName,
                    orderCount: stats.orderCount,
                    orderPercentage: totalOrders > 0 ? Math.round((stats.orderCount / totalOrders) * 100 * 10) / 10 : 0,
                    revenue: Math.round(stats.revenue * 100) / 100,
                    averageOrderValue:
                        stats.completedCount > 0
                            ? Math.round((stats.revenue / stats.completedCount) * 100) / 100
                            : 0,
                    completionRate:
                        stats.orderCount > 0
                            ? Math.round((stats.completedCount / stats.orderCount) * 100 * 10) / 10
                            : 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);

            return {
                success: true,
                data: categoryStats,
            };
        } catch (error) {
            logger.error("[Admin] Get category stats error:", error);
            throw error;
        }
    }
}
