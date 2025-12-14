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
            changedByDiscordId: string;
            reason: string;
            notes?: string;
        }
    ) {
        const changedBy = await prisma.user.findUnique({ where: { discordId: data.changedByDiscordId } });
        if (!changedBy) throw new Error("User not found");

        return await this.orderService.updateOrderStatus(orderId, {
            status: data.status as any,
            changedById: changedBy.id,
            reason: data.reason,
            notes: data.notes,
        });
    }
}
