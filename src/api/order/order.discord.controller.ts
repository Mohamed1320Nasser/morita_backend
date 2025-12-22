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
    GetOrderListDto,
    ClaimOrderDto,
} from "./dtos";

@JsonController("/discord/orders")
@Service()
export default class DiscordOrderController {
    constructor(private orderService: OrderService) {}

    @Post("/create")
    async createOrder(@Body() data: DiscordCreateOrderDto) {
        return await this.orderService.createOrderByDiscord(data);
    }

    @Get("/:orderId")
    async getOrder(@Param("orderId") orderId: string) {
        return await this.orderService.getOrderById(orderId);
    }

    @Get("/number/:orderNumber")
    async getOrderByNumber(@Param("orderNumber") orderNumber: string) {
        const orderNum = parseInt(orderNumber);

        if (isNaN(orderNum) || orderNum <= 0) {
            throw new Error("Order number must be a positive integer");
        }

        const order = await prisma.order.findUnique({
            where: { orderNumber: orderNum },
            include: {
                customer: true,
                worker: true,
                support: true,
                service: true,
                method: true,
                paymentMethod: true,
                account: true,
            },
        });

        if (!order) {
            throw new Error(`Order #${orderNumber} not found`);
        }

        return order;
    }

    @Post("/:orderId/claim")
    async claimJob(
        @Param("orderId") orderId: string,
        @Body() data: ClaimOrderDto
    ) {
        return await this.orderService.claimOrder(orderId, data);
    }

    @Get("/")
    async getOrders(@QueryParams() query: GetOrderListDto) {
        return await this.orderService.getOrders(query);
    }

    @Get("/user/:discordId")
    async getOrdersByDiscordId(
        @Param("discordId") discordId: string,
        @QueryParams() query: GetOrderListDto
    ) {
        const user = await prisma.user.findUnique({ where: { discordId } });

        if (!user) {
            return {
                list: [],
                total: 0,
                page: 1,
                limit: query.limit || 20,
                totalPages: 0,
            };
        }

        return await this.orderService.getOrders({
            ...query,
            customerId: user.id,
        });
    }

    @Put("/:orderId/assign")
    async assignWorker(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string; assignedByDiscordId: string; notes?: string }
    ) {
        const [worker, assigner] = await Promise.all([
            prisma.user.findUnique({ where: { discordId: data.workerDiscordId } }),
            prisma.user.findUnique({ where: { discordId: data.assignedByDiscordId } }),
        ]);

        if (!worker) throw new Error("Worker not found");
        if (!assigner) throw new Error("Assigner not found");

        return await this.orderService.assignWorker(orderId, {
            workerId: worker.id,
            assignedById: assigner.id,
            notes: data.notes,
        });
    }

    @Put("/:orderId/start")
    async startOrder(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string }
    ) {
        const worker = await prisma.user.findUnique({ where: { discordId: data.workerDiscordId } });
        if (!worker) throw new Error("Worker not found");

        return await this.orderService.updateOrderStatus(orderId, {
            status: "IN_PROGRESS" as any,
            changedById: worker.id,
            reason: "Worker started working on order",
        });
    }

    @Put("/:orderId/complete")
    async completeOrder(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string; completionNotes?: string }
    ) {
        const worker = await prisma.user.findUnique({ where: { discordId: data.workerDiscordId } });
        if (!worker) throw new Error("Worker not found");

        return await this.orderService.completeOrder({
            orderId,
            workerId: worker.id,
            completionNotes: data.completionNotes,
        });
    }

    @Put("/:orderId/confirm")
    async confirmOrder(
        @Param("orderId") orderId: string,
        @Body() data: { customerDiscordId: string; feedback?: string }
    ) {
        const customer = await prisma.user.findUnique({ where: { discordId: data.customerDiscordId } });
        if (!customer) throw new Error("Customer not found");

        return await this.orderService.confirmOrderCompletion({
            orderId,
            customerId: customer.id,
            feedback: data.feedback,
        });
    }

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
        const cancelledBy = await prisma.user.findUnique({ where: { discordId: data.cancelledByDiscordId } });
        if (!cancelledBy) throw new Error("User not found");

        return await this.orderService.cancelOrder({
            orderId,
            cancelledById: cancelledBy.id,
            cancellationReason: data.cancellationReason,
            refundType: data.refundType,
            refundAmount: data.refundAmount,
        });
    }

    @Put("/:orderId/channel")
    async updateOrderChannel(
        @Param("orderId") orderId: string,
        @Body() data: { orderChannelId: string; claimMessageId?: string }
    ) {
        return await prisma.order.update({
            where: { id: orderId },
            data: {
                orderChannelId: data.orderChannelId,
                claimMessageId: data.claimMessageId,
            },
        });
    }

    @Put("/:orderId/status")
    async updateOrderStatus(
        @Param("orderId") orderId: string,
        @Body() data: {
            status: string;
            changedByDiscordId?: string;
            workerDiscordId?: string;
            reason?: string;
            notes?: string;
        }
    ) {
        // Support both changedByDiscordId and workerDiscordId for backwards compatibility
        const discordId = data.changedByDiscordId || data.workerDiscordId;

        if (!discordId) {
            throw new Error("Either changedByDiscordId or workerDiscordId is required");
        }

        // Get user with role to check admin status server-side
        const changedBy = await prisma.user.findUnique({
            where: { discordId },
            select: { id: true, role: true, fullname: true }
        });
        if (!changedBy) throw new Error("User not found");

        // Check if user is admin/system based on their role in database (server-side validation)
        const isAdmin = changedBy.role === 'admin' || changedBy.role === 'system';

        // Get order details to validate assignment
        const order = await this.orderService.getOrderById(orderId);

        // If order has a worker assigned and caller is not admin, validate they are the assigned worker
        if (order.workerId && !isAdmin) {
            if (order.worker?.discordId !== discordId) {
                throw new Error(
                    `Only the assigned worker can change this order's status. This order is assigned to ${order.worker?.fullname || 'another worker'}.`
                );
            }
        }

        return await this.orderService.updateOrderStatus(orderId, {
            status: data.status as any,
            changedById: changedBy.id,
            reason: data.reason || `Status changed to ${data.status}`,
            notes: data.notes,
        });
    }
}
