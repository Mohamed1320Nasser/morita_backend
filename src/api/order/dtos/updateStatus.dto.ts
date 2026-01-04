import { Transform } from "class-transformer";
import {
    IsString,
    IsNumber,
    IsOptional,
    IsEnum,
} from "class-validator";
import { OrderStatus } from "./common.dto";

export class UpdateOrderStatusDto {
    @IsEnum(OrderStatus, { message: "Invalid order status" })
    status!: OrderStatus;

    @IsNumber()
    @Transform(({ value }) => parseInt(value) || null)
    changedById!: number;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    reason?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    notes?: string;
}
