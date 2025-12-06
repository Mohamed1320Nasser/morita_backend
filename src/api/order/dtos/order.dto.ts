import {
    IsString,
    IsNumber,
    IsOptional,
    IsEnum,
    IsUUID,
    IsObject,
    Min,
} from "class-validator";
import { Type } from "class-transformer";

// Order Status enum (matches Prisma)
export enum OrderStatus {
    PENDING = "PENDING",
    CLAIMING = "CLAIMING",
    ASSIGNED = "ASSIGNED",
    IN_PROGRESS = "IN_PROGRESS",
    AWAITING_CONFIRM = "AWAITING_CONFIRM",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED",
    DISPUTED = "DISPUTED",
    REFUNDED = "REFUNDED",
}

// DTO for creating an order via Discord
export class CreateOrderDto {
    @IsNumber()
    customerId!: number;

    @IsNumber()
    @IsOptional()
    workerId?: number; // If provided, assign directly. Otherwise, post to claiming

    @IsNumber()
    @IsOptional()
    supportId?: number;

    @IsString()
    @IsOptional()
    ticketId?: string;

    @IsString()
    @IsOptional()
    serviceId?: string;

    @IsString()
    @IsOptional()
    methodId?: string;

    @IsString()
    @IsOptional()
    paymentMethodId?: string;

    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
    orderValue!: number;

    @IsNumber()
    @Min(0)
    @Type(() => Number)
    depositAmount!: number;

    @IsString()
    @IsOptional()
    currency?: string = "USD";

    @IsObject()
    @IsOptional()
    jobDetails?: any; // Account credentials, instructions, etc.
}

// DTO for creating order via Discord (ticket command)
export class DiscordCreateOrderDto {
    @IsString()
    customerDiscordId!: string;

    @IsString()
    @IsOptional()
    workerDiscordId?: string; // If provided, assign directly

    @IsString()
    supportDiscordId!: string;

    @IsString()
    @IsOptional()
    ticketId?: string;

    @IsString()
    @IsOptional()
    serviceId?: string;

    @IsString()
    @IsOptional()
    methodId?: string;

    @IsString()
    @IsOptional()
    paymentMethodId?: string;

    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
    orderValue!: number;

    @IsNumber()
    @Min(0)
    @Type(() => Number)
    depositAmount!: number;

    @IsString()
    @IsOptional()
    currency?: string = "USD";

    @IsObject()
    @IsOptional()
    jobDetails?: any;
}

// DTO for updating order status
export class UpdateOrderStatusDto {
    @IsEnum(OrderStatus)
    status!: OrderStatus;

    @IsNumber()
    changedById!: number;

    @IsString()
    @IsOptional()
    reason?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}

// DTO for assigning worker to order
export class AssignWorkerDto {
    @IsNumber()
    workerId!: number;

    @IsNumber()
    assignedById!: number;

    @IsString()
    @IsOptional()
    notes?: string;
}

// DTO for worker claiming order
export class ClaimOrderDto {
    @IsString()
    workerDiscordId!: string;
}

// DTO for getting order list
export class GetOrderListDto {
    @IsString()
    @IsOptional()
    search?: string;

    @IsEnum(OrderStatus)
    @IsOptional()
    status?: OrderStatus;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    customerId?: number;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    workerId?: number;

    @IsString()
    @IsOptional()
    ticketId?: string;

    @IsString()
    @IsOptional()
    serviceId?: string;

    @IsString()
    @IsOptional()
    startDate?: string;

    @IsString()
    @IsOptional()
    endDate?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    page?: number = 1;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    limit?: number = 20;

    @IsString()
    @IsOptional()
    sortBy?: string = "createdAt";

    @IsString()
    @IsOptional()
    sortOrder?: "asc" | "desc" = "desc";
}

// DTO for marking order complete (worker)
export class CompleteOrderDto {
    @IsString()
    orderId!: string;

    @IsNumber()
    workerId!: number;

    @IsString()
    @IsOptional()
    completionNotes?: string;
}

// DTO for confirming order completion (customer)
export class ConfirmOrderDto {
    @IsString()
    orderId!: string;

    @IsNumber()
    customerId!: number;

    @IsString()
    @IsOptional()
    feedback?: string;
}

// DTO for cancelling order
export class CancelOrderDto {
    @IsString()
    orderId!: string;

    @IsNumber()
    cancelledById!: number;

    @IsString()
    cancellationReason!: string;

    @IsString()
    @IsOptional()
    refundType?: "full" | "partial" | "none" = "full";

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    refundAmount?: number;
}
