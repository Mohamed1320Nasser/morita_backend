import {
    JsonController,
    Get,
    Post,
    Put,
    Param,
    Body,
    QueryParams,
} from "routing-controllers";
import { Service } from "typedi";
import OrderService from "./order.service";
import prisma from "../../common/prisma/client";
import {
    DiscordCreateOrderDto,
    AssignWorkerDto,
    GetOrderListDto,
    UpdateOrderStatusDto,
    CompleteOrderDto,
    ConfirmOrderDto,
    CancelOrderDto,
    ClaimOrderDto,
} from "./dtos";
import logger from "../../common/loggers";

// Discord Order Controller (for bot API calls)
@JsonController("/discord/orders")
@Service()
export default class DiscordOrderController {
    constructor(private orderService: OrderService) {}

    /**
     * Create order via Discord (in ticket)
     */
    @Post("/create")
    async createOrder(@Body() data: DiscordCreateOrderDto) {
        logger.info(
            `[Discord] Creating order for customer ${data.customerDiscordId}`
        );

        try {
            const order = await this.orderService.createOrderByDiscord(data);

            return {
                success: true,
                data: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    customer: order.customer,
                    worker: order.worker,
                    support: order.support,
                    service: order.service,
                    orderValue: parseFloat(order.orderValue.toString()),
                    depositAmount: parseFloat(order.depositAmount.toString()),
                    currency: order.currency,
                    jobDetails: order.jobDetails,
                    createdAt: order.createdAt,
                },
            };
        } catch (error) {
            logger.error(`[Discord] Create order error:`, error);
            throw error;
        }
    }

    /**
     * Get order by ID
     */
    @Get("/:orderId")
    async getOrder(@Param("orderId") orderId: string) {
        const order = await this.orderService.getOrderById(orderId);

        return {
            success: true,
            data: {
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                customer: order.customer,
                worker: order.worker,
                support: order.support,
                service: order.service,
                method: order.method,
                paymentMethod: order.paymentMethod,
                ticketId: order.ticketId,
                ticket: order.ticket,
                orderValue: parseFloat(order.orderValue.toString()),
                depositAmount: parseFloat(order.depositAmount.toString()),
                currency: order.currency,
                jobDetails: order.jobDetails,
                orderChannelId: order.orderChannelId,
                completionNotes: order.completionNotes,
                createdAt: order.createdAt,
                assignedAt: order.assignedAt,
                startedAt: order.startedAt,
                completedAt: order.completedAt,
                confirmedAt: order.confirmedAt,
                statusHistory: order.statusHistory,
            },
        };
    }

    /**
     * Claim a job (worker claims an unassigned order)
     */
    @Post("/:orderId/claim")
    async claimJob(
        @Param("orderId") orderId: string,
        @Body() data: ClaimOrderDto
    ) {
        logger.info(
            `[Discord] Worker ${data.workerDiscordId} claiming order ${orderId}`
        );

        try {
            const order = await this.orderService.claimOrder(orderId, data);

            return {
                success: true,
                data: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    customer: order.customer,
                    worker: order.worker,
                    support: order.support,
                    service: order.service,
                    ticketId: order.ticketId,
                    orderValue: parseFloat(order.orderValue.toString()),
                    depositAmount: parseFloat(order.depositAmount.toString()),
                    currency: order.currency,
                    jobDetails: order.jobDetails,
                    assignedAt: order.assignedAt,
                },
            };
        } catch (error) {
            logger.error(`[Discord] Claim order error:`, error);
            throw error;
        }
    }

    /**
     * Get orders list with filters
     */
    @Get("/")
    async getOrders(@QueryParams() query: GetOrderListDto) {
        const result = await this.orderService.getOrders(query);

        return {
            success: true,
            data: result,
        };
    }

    /**
     * Get orders by Discord user ID
     */
    @Get("/user/:discordId")
    async getOrdersByDiscordId(
        @Param("discordId") discordId: string,
        @QueryParams() query: GetOrderListDto
    ) {
        // Find user by Discord ID
        const user = await prisma.user.findUnique({
            where: { discordId },
        });

        if (!user) {
            return {
                success: true,
                data: {
                    list: [],
                    total: 0,
                    page: 1,
                    limit: query.limit || 20,
                    totalPages: 0,
                },
            };
        }

        // Get orders for this user (as customer or worker)
        const result = await this.orderService.getOrders({
            ...query,
            customerId: user.id,
        });

        return {
            success: true,
            data: result,
        };
    }

    /**
     * Assign worker to order
     */
    @Put("/:orderId/assign")
    async assignWorker(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string; assignedByDiscordId: string; notes?: string }
    ) {
        logger.info(`[Discord] Assigning worker to order ${orderId}`);

        // Find worker and assigner by Discord IDs
        const [worker, assigner] = await Promise.all([
            prisma.user.findUnique({
                where: { discordId: data.workerDiscordId },
            }),
            prisma.user.findUnique({
                where: { discordId: data.assignedByDiscordId },
            }),
        ]);

        if (!worker) {
            throw new Error("Worker not found");
        }

        if (!assigner) {
            throw new Error("Assigner not found");
        }

        const order = await this.orderService.assignWorker(orderId, {
            workerId: worker.id,
            assignedById: assigner.id,
            notes: data.notes,
        });

        return {
            success: true,
            data: order,
        };
    }

    /**
     * Worker starts working on order
     */
    @Put("/:orderId/start")
    async startOrder(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string }
    ) {
        logger.info(`[Discord] Starting order ${orderId}`);

        const worker = await prisma.user.findUnique({
            where: { discordId: data.workerDiscordId },
        });

        if (!worker) {
            throw new Error("Worker not found");
        }

        const order = await this.orderService.updateOrderStatus(orderId, {
            status: "IN_PROGRESS" as any,
            changedById: worker.id,
            reason: "Worker started working on order",
        });

        return {
            success: true,
            data: order,
        };
    }

    /**
     * Worker marks order as complete
     */
    @Put("/:orderId/complete")
    async completeOrder(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string; completionNotes?: string }
    ) {
        logger.info(`[Discord] Completing order ${orderId}`);

        const worker = await prisma.user.findUnique({
            where: { discordId: data.workerDiscordId },
        });

        if (!worker) {
            throw new Error("Worker not found");
        }

        const order = await this.orderService.completeOrder({
            orderId,
            workerId: worker.id,
            completionNotes: data.completionNotes,
        });

        return {
            success: true,
            data: order,
        };
    }

    /**
     * Customer confirms order completion
     */
    @Put("/:orderId/confirm")
    async confirmOrder(
        @Param("orderId") orderId: string,
        @Body() data: { customerDiscordId: string; feedback?: string }
    ) {
        logger.info(`[Discord] Confirming order ${orderId}`);

        const customer = await prisma.user.findUnique({
            where: { discordId: data.customerDiscordId },
        });

        if (!customer) {
            throw new Error("Customer not found");
        }

        const order = await this.orderService.confirmOrderCompletion({
            orderId,
            customerId: customer.id,
            feedback: data.feedback,
        });

        return {
            success: true,
            data: order,
        };
    }

    /**
     * Cancel order
     */
    @Put("/:orderId/cancel")
    async cancelOrder(
        @Param("orderId") orderId: string,
        @Body() data: {
            cancelledByDiscordId: string;
            cancellationReason: string;
            refundType?: "full" | "partial" | "none";
            refundAmount?: number;
        }
    ) {
        logger.info(`[Discord] Cancelling order ${orderId}`);

        const cancelledBy = await prisma.user.findUnique({
            where: { discordId: data.cancelledByDiscordId },
        });

        if (!cancelledBy) {
            throw new Error("User not found");
        }

        const order = await this.orderService.cancelOrder({
            orderId,
            cancelledById: cancelledBy.id,
            cancellationReason: data.cancellationReason,
            refundType: data.refundType,
            refundAmount: data.refundAmount,
        });

        return {
            success: true,
            data: order,
        };
    }

    /**
     * Update order channel ID
     */
    @Put("/:orderId/channel")
    async updateOrderChannel(
        @Param("orderId") orderId: string,
        @Body() data: { orderChannelId: string; claimMessageId?: string }
    ) {
        logger.info(`[Discord] Updating order channel for ${orderId}`);

        const order = await prisma.order.update({
            where: { id: orderId },
            data: {
                orderChannelId: data.orderChannelId,
                claimMessageId: data.claimMessageId,
            },
        });

        return {
            success: true,
            data: order,
        };
    }

    /**
     * Update order status (for disputes, etc.)
     */
    @Put("/:orderId/status")
    async updateOrderStatus(
        @Param("orderId") orderId: string,
        @Body() data: {
            status: string;
            changedByDiscordId: string;
            reason: string;
            notes?: string;
        }
    ) {
        logger.info(`[Discord] Updating order ${orderId} status to ${data.status}`);

        const changedBy = await prisma.user.findUnique({
            where: { discordId: data.changedByDiscordId },
        });

        if (!changedBy) {
            throw new Error("User not found");
        }

        const order = await this.orderService.updateOrderStatus(orderId, {
            status: data.status as any,
            changedById: changedBy.id,
            reason: data.reason,
            notes: data.notes,
        });

        return {
            success: true,
            data: order,
        };
    }
}
