import { Transform } from "class-transformer";
import {
    IsString,
    IsNumber,
    IsOptional,
    IsArray,
    Min,
} from "class-validator";

export class BaseOrderDto {
    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    serviceId?: string;

    /** Additional services when an order covers more than one. */
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    @Transform(({ value }) =>
        Array.isArray(value)
            ? value.map(v => (typeof v === "string" ? v.trim() : v)).filter(Boolean)
            : value
    )
    serviceIds?: string[];

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    methodId?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    paymentMethodId?: string;

    @IsNumber()
    @Min(0.01)
    @Transform(({ value }) => parseFloat(value) || null)
    orderValue!: number;

    @IsNumber()
    @Min(0)
    @Transform(({ value }) => parseFloat(value) || null)
    depositAmount!: number;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
    currency?: string = "USD";
}

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
