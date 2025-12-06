import {
    JsonController,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    QueryParams,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import OrderService from "./order.service";
import prisma from "../../common/prisma/client";
import { GetOrderListDto } from "./dtos";
import logger from "../../common/loggers";
import { Prisma } from "@prisma/client";
import API from "../../common/config/api.types";

@JsonController("/api/admin/orders")
@Service()
export default class AdminOrderController {
    constructor(private orderService: OrderService) {}

    @Get("/")
    @Authorized(API.Role.admin)
    async getAllOrders(@QueryParams() query: GetOrderListDto) {
        logger.info(`[Admin] Fetching orders with filters:`, query);

        try {
            const result = await this.orderService.getOrders(query);

            return {
                success: true,
                data: result,
            };
        } catch (error) {
            logger.error(`[Admin] Get orders error:`, error);
            throw error;
        }
    }

    /**
     * Get order statistics for dashboard
     */
    @Get("/stats")
    @Authorized(API.Role.admin)
    async getOrderStats() {
        logger.info(`[Admin] Fetching order statistics`);

        try {
            // Get total orders count
            const totalOrders = await prisma.order.count();

            // Get orders by status
            const ordersByStatus = await prisma.order.groupBy({
                by: ["status"],
                _count: {
                    id: true,
                },
            });

            // Get total revenue (sum of completed orders)
            const revenueResult = await prisma.order.aggregate({
                where: {
                    status: {
                        in: ["COMPLETED"],
                    },
                },
                _sum: {
                    orderValue: true,
                },
            });

            // Get pending orders count
            const pendingOrders = await prisma.order.count({
                where: {
                    status: "PENDING",
                },
            });

            // Get in-progress orders count
            const inProgressOrders = await prisma.order.count({
                where: {
                    status: "IN_PROGRESS",
                },
            });

            // Get completed orders count
            const completedOrders = await prisma.order.count({
                where: {
                    status: "COMPLETED",
                },
            });

            // Get cancelled orders count
            const cancelledOrders = await prisma.order.count({
                where: {
                    status: "CANCELLED",
                },
            });

            // Get orders today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const ordersToday = await prisma.order.count({
                where: {
                    createdAt: {
                        gte: today,
                    },
                },
            });

            // Get orders this week
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const ordersThisWeek = await prisma.order.count({
                where: {
                    createdAt: {
                        gte: weekAgo,
                    },
                },
            });

            // Get orders this month
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            const ordersThisMonth = await prisma.order.count({
                where: {
                    createdAt: {
                        gte: monthStart,
                    },
                },
            });

            // Calculate average order value
            const avgOrderValue = await prisma.order.aggregate({
                where: {
                    status: {
                        notIn: ["CANCELLED"],
                    },
                },
                _avg: {
                    orderValue: true,
                },
            });

            // Get disputed orders count
            const disputedOrders = await prisma.order.count({
                where: {
                    status: "DISPUTED",
                },
            });

            return {
                success: true,
                data: {
                    totalOrders,
                    ordersByStatus: ordersByStatus.map((item) => ({
                        status: item.status,
                        count: item._count.id,
                    })),
                    totalRevenue: revenueResult._sum.orderValue
                        ? parseFloat(revenueResult._sum.orderValue.toString())
                        : 0,
                    pendingOrders,
                    inProgressOrders,
                    completedOrders,
                    cancelledOrders,
                    disputedOrders,
                    ordersToday,
                    ordersThisWeek,
                    ordersThisMonth,
                    averageOrderValue: avgOrderValue._avg.orderValue
                        ? parseFloat(avgOrderValue._avg.orderValue.toString())
                        : 0,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get order stats error:`, error);
            throw error;
        }
    }

    /**
     * Get order volume chart data (last N days or custom date range)
     */
    @Authorized(API.Role.admin)
    @Get("/stats/volume")
    async getOrderVolumeStats(@QueryParams() query: { days?: number; startDate?: string; endDate?: string }) {
        logger.info(`[Admin] Fetching order volume stats:`, query);

        try {
            let startDate: Date;
            let endDate: Date;
            let days: number;

            // Check if custom date range is provided
            if (query.startDate && query.endDate) {
                startDate = new Date(query.startDate);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(query.endDate);
                endDate.setHours(23, 59, 59, 999);

                // Calculate number of days between dates
                days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                logger.info(`[Admin] Using custom date range: ${startDate.toISOString()} to ${endDate.toISOString()} (${days} days)`);
            } else {
                // Use days parameter (default 30)
                days = query.days || 30;
                startDate = new Date();
                startDate.setDate(startDate.getDate() - days);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date();
                endDate.setHours(23, 59, 59, 999);

                logger.info(`[Admin] Using preset period: last ${days} days`);
            }

            // Get orders grouped by date
            const orders = await prisma.order.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                select: {
                    createdAt: true,
                    orderValue: true,
                    status: true,
                },
                orderBy: {
                    createdAt: "asc",
                },
            });

            // Group by date
            const volumeByDate = new Map<string, { count: number; value: number }>();

            orders.forEach((order) => {
                const dateKey = order.createdAt.toISOString().split("T")[0];
                const existing = volumeByDate.get(dateKey) || { count: 0, value: 0 };
                volumeByDate.set(dateKey, {
                    count: existing.count + 1,
                    value:
                        existing.value +
                        parseFloat(order.orderValue.toString()),
                });
            });

            // Convert to array and fill missing dates
            const result = [];
            for (let i = 0; i < days; i++) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + i);
                const dateKey = date.toISOString().split("T")[0];
                const data = volumeByDate.get(dateKey) || { count: 0, value: 0 };
                result.push({
                    date: dateKey,
                    count: data.count,
                    value: data.value,
                });
            }

            return {
                success: true,
                data: result,
            };
        } catch (error) {
            logger.error(`[Admin] Get order volume stats error:`, error);
            throw error;
        }
    }

    /**
     * Get recent activity (last 20 orders)
     */
    @Authorized(API.Role.admin)
    @Get("/activity/recent")
    async getRecentActivity() {
        logger.info(`[Admin] Fetching recent order activity`);

        try {
            const recentOrders = await prisma.order.findMany({
                take: 20,
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    customer: {
                        select: {
                            id: true,
                            username: true,
                            discordId: true,
                        },
                    },
                    worker: {
                        select: {
                            id: true,
                            username: true,
                            discordId: true,
                        },
                    },
                    service: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            return {
                success: true,
                data: recentOrders.map((order) => ({
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    orderValue: parseFloat(order.orderValue.toString()),
                    currency: order.currency,
                    customer: order.customer,
                    worker: order.worker,
                    service: order.service,
                    createdAt: order.createdAt,
                })),
            };
        } catch (error) {
            logger.error(`[Admin] Get recent activity error:`, error);
            throw error;
        }
    }

    /**
     * Get order detail by ID
     */
    @Authorized(API.Role.admin)
    @Get("/:orderId")
    async getOrderDetail(@Param("orderId") orderId: string) {
        logger.info(`[Admin] Fetching order ${orderId}`);

        try {
            const order = await this.orderService.getOrderById(orderId);

            return {
                success: true,
                data: order,
            };
        } catch (error) {
            logger.error(`[Admin] Get order detail error:`, error);
            throw error;
        }
    }

    /**
     * Update order status (admin override)
     */
    @Authorized(API.Role.admin)
    @Put("/:orderId/status")
    async updateOrderStatus(
        @Param("orderId") orderId: string,
        @Body()
        data: {
            status: string;
            adminId: string;
            reason: string;
            notes?: string;
        }
    ) {
        logger.info(
            `[Admin] Updating order ${orderId} status to ${data.status}`
        );

        try {
            const order = await this.orderService.updateOrderStatus(orderId, {
                status: data.status as any,
                changedById: parseInt(data.adminId),
                reason: data.reason,
                notes: data.notes,
            });

            return {
                success: true,
                data: order,
            };
        } catch (error) {
            logger.error(`[Admin] Update order status error:`, error);
            throw error;
        }
    }

    /**
     * Force cancel order (admin override)
     */
    @Authorized(API.Role.admin)
    @Put("/:orderId/cancel")
    async forceCancelOrder(
        @Param("orderId") orderId: string,
        @Body()
        data: {
            adminId: string;
            reason: string;
            refundType?: "full" | "partial" | "none";
            refundAmount?: number;
        }
    ) {
        logger.info(`[Admin] Force cancelling order ${orderId}`);

        try {
            const order = await this.orderService.cancelOrder({
                orderId,
                cancelledById: parseInt(data.adminId),
                cancellationReason: data.reason,
                refundType: data.refundType || "full",
                refundAmount: data.refundAmount,
            });

            return {
                success: true,
                data: order,
            };
        } catch (error) {
            logger.error(`[Admin] Force cancel order error:`, error);
            throw error;
        }
    }

    /**
     * Reassign worker (admin override)
     */
    @Authorized(API.Role.admin)
    @Put("/:orderId/reassign")
    async reassignWorker(
        @Param("orderId") orderId: string,
        @Body()
        data: {
            newWorkerId: string;
            adminId: string;
            reason: string;
        }
    ) {
        logger.info(
            `[Admin] Reassigning order ${orderId} to worker ${data.newWorkerId}`
        );

        try {
            const order = await this.orderService.assignWorker(orderId, {
                workerId: parseInt(data.newWorkerId),
                assignedById: parseInt(data.adminId),
                notes: data.reason,
            });

            return {
                success: true,
                data: order,
            };
        } catch (error) {
            logger.error(`[Admin] Reassign worker error:`, error);
            throw error;
        }
    }

    /**
     * Get order status history
     */
    @Authorized(API.Role.admin)
    @Get("/:orderId/history")
    async getOrderHistory(@Param("orderId") orderId: string) {
        logger.info(`[Admin] Fetching order ${orderId} history`);

        try {
            const order = await prisma.order.findUnique({
                where: { id: orderId },
                select: {
                    statusHistory: true,
                },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            return {
                success: true,
                data: order.statusHistory || [],
            };
        } catch (error) {
            logger.error(`[Admin] Get order history error:`, error);
            throw error;
        }
    }

    /**
     * Export orders to CSV (returns data for CSV generation on frontend)
     */
    @Authorized(API.Role.admin)
    @Get("/export/csv")
    async exportOrders(@QueryParams() query: GetOrderListDto) {
        logger.info(`[Admin] Exporting orders to CSV`);

        try {
            // Get all orders matching filters (no pagination for export)
            const orders = await prisma.order.findMany({
                where: this.buildOrderFilters(query),
                include: {
                    customer: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    worker: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    support: {
                        select: {
                            username: true,
                            email: true,
                        },
                    },
                    service: {
                        select: {
                            name: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

            // Format for CSV export
            const csvData = orders.map((order) => ({
                orderNumber: order.orderNumber,
                status: order.status,
                customer: order.customer?.username || "N/A",
                worker: order.worker?.username || "Unassigned",
                support: order.support?.username || "N/A",
                service: order.service?.name || "N/A",
                orderValue: parseFloat(order.orderValue.toString()),
                depositAmount: parseFloat(order.depositAmount.toString()),
                currency: order.currency,
                createdAt: order.createdAt,
                completedAt: order.completedAt,
            }));

            return {
                success: true,
                data: csvData,
            };
        } catch (error) {
            logger.error(`[Admin] Export orders error:`, error);
            throw error;
        }
    }

    /**
     * Helper: Build order filters from query
     */
    private buildOrderFilters(query: GetOrderListDto): Prisma.OrderWhereInput {
        const filters: Prisma.OrderWhereInput = {};

        if (query.status) {
            filters.status = query.status as any;
        }

        if (query.customerId) {
            filters.customerId = query.customerId;
        }

        if (query.workerId) {
            filters.workerId = query.workerId;
        }

        if (query.serviceId) {
            filters.serviceId = query.serviceId;
        }

        // Date range filter
        if (query.startDate || query.endDate) {
            filters.createdAt = {};
            if (query.startDate) {
                filters.createdAt.gte = new Date(query.startDate);
            }
            if (query.endDate) {
                filters.createdAt.lte = new Date(query.endDate);
            }
        }

        return filters;
    }
}
