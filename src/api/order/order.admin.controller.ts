import {
    JsonController,
    Get,
    Put,
    Param,
    Body,
    QueryParams,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import OrderService from "./order.service";
import { GetOrderListDto } from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/admin/orders")
@Service()
export default class AdminOrderController {
    constructor(private orderService: OrderService) {}

    @Get("/")
    @Authorized(API.Role.admin)
    async getAllOrders(@QueryParams() query: GetOrderListDto) {
        return await this.orderService.getOrders(query);
    }

    @Get("/stats")
    @Authorized(API.Role.admin)
    async getOrderStats() {
        return await this.orderService.getOrderStats();
    }

    @Get("/debug/count")
    @Authorized(API.Role.admin)
    async getOrderDebugCount() {
        return await this.orderService.getOrderDebugInfo();
    }

    @Authorized(API.Role.admin)
    @Get("/stats/volume")
    async getOrderVolumeStats(@QueryParams() query: { days?: number; startDate?: string; endDate?: string }) {
        return await this.orderService.getOrderVolumeStats(query);
    }

    @Authorized(API.Role.admin)
    @Get("/activity/recent")
    async getRecentActivity() {
        return await this.orderService.getRecentActivity();
    }

    @Authorized(API.Role.admin)
    @Get("/:orderId")
    async getOrderDetail(@Param("orderId") orderId: string) {
        return await this.orderService.getOrderById(orderId);
    }

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
        return await this.orderService.updateOrderStatus(orderId, {
            status: data.status as any,
            changedById: parseInt(data.adminId),
            reason: data.reason,
            notes: data.notes,
        });
    }

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
        return await this.orderService.cancelOrder({
            orderId,
            cancelledById: parseInt(data.adminId),
            cancellationReason: data.reason,
            refundType: data.refundType || "full",
            refundAmount: data.refundAmount,
        });
    }

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
        return await this.orderService.assignWorker(orderId, {
            workerId: parseInt(data.newWorkerId),
            assignedById: parseInt(data.adminId),
            notes: data.reason,
        });
    }

    @Authorized(API.Role.admin)
    @Get("/:orderId/history")
    async getOrderHistory(@Param("orderId") orderId: string) {
        return await this.orderService.getOrderHistory(orderId);
    }

    @Authorized(API.Role.admin)
    @Get("/export/csv")
    async exportOrders(@QueryParams() query: GetOrderListDto) {
        return await this.orderService.getOrdersForExport(query);
    }
}
