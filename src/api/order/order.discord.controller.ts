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
        return await this.orderService.getOrderByNumber(orderNumber);
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
        return await this.orderService.getOrdersByDiscordId(discordId, query);
    }

    @Put("/:orderId/assign")
    async assignWorker(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string; assignedByDiscordId: string; notes?: string }
    ) {
        return await this.orderService.assignWorkerByDiscordId(orderId, data);
    }

    @Put("/:orderId/start")
    async startOrder(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string }
    ) {
        return await this.orderService.startOrderByDiscordId(orderId, data.workerDiscordId);
    }

    @Put("/:orderId/complete")
    async completeOrder(
        @Param("orderId") orderId: string,
        @Body() data: { workerDiscordId: string; completionNotes?: string; completionScreenshots?: string[] }
    ) {
        return await this.orderService.completeOrderByDiscordId(orderId, data);
    }

    @Put("/:orderId/confirm")
    async confirmOrder(
        @Param("orderId") orderId: string,
        @Body() data: { customerDiscordId: string; feedback?: string }
    ) {
        return await this.orderService.confirmOrderByDiscordId(orderId, data);
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
        return await this.orderService.cancelOrderByDiscordId(orderId, data);
    }

    @Put("/:orderId/channel")
    async updateOrderChannel(
        @Param("orderId") orderId: string,
        @Body() data: { orderChannelId: string; claimMessageId?: string }
    ) {
        return await this.orderService.updateOrderChannel(orderId, data);
    }

    @Put("/:orderId/message")
    async updateOrderMessage(
        @Param("orderId") orderId: string,
        @Body() data: {
            ticketChannelId?: string;
            pinnedMessageId?: string;
        }
    ) {
        return await this.orderService.updateOrderMessage(orderId, data);
    }

    @Put("/:orderId/review")
    async submitOrderReview(
        @Param("orderId") orderId: string,
        @Body() data: {
            customerDiscordId: string;
            rating: number;
            review?: string;
        }
    ) {
        return await this.orderService.submitOrderReview(orderId, data);
    }

    @Post("/:orderId/report-issue")
    async reportIssue(
        @Param("orderId") orderId: string,
        @Body() data: {
            reportedByDiscordId: string;
            issueDescription: string;
            priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
        }
    ) {
        return await this.orderService.reportIssue(orderId, data);
    }

    @Get("/issues/:issueId")
    async getIssue(@Param("issueId") issueId: string) {
        return await this.orderService.getIssue(issueId);
    }

    @Put("/issues/:issueId")
    async updateIssue(
        @Param("issueId") issueId: string,
        @Body() data: {
            discordMessageId?: string;
            discordChannelId?: string;
            status?: string;
            resolution?: string;
            resolvedByDiscordId?: string;
        }
    ) {
        return await this.orderService.updateIssue(issueId, data);
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
            isAdminOverride?: boolean;
        }
    ) {
        return await this.orderService.updateOrderStatusByDiscordId(orderId, data);
    }

    @Put("/:orderId/proof")
    async addProofScreenshots(
        @Param("orderId") orderId: string,
        @Body() data: {
            workerDiscordId: string;
            screenshots: string[];
            notes?: string;
        }
    ) {
        return await this.orderService.addProofScreenshots(orderId, data);
    }

    @Get("/:orderId/proof")
    async getProofScreenshots(@Param("orderId") orderId: string) {
        return await this.orderService.getProofScreenshots(orderId);
    }
}
