import { Transform } from "class-transformer";
import {
    IsString,
    IsNumber,
    IsOptional,
} from "class-validator";

export class CancelOrderDto {
    @IsString()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    orderId!: string;

    @IsNumber()
    @Transform(({ value }) => parseInt(value) || null)
    cancelledById!: number;

    @IsString()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    cancellationReason!: string;

    @IsString()
    @IsOptional()
    refundType?: "full" | "partial" | "none" = "full";

    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => parseFloat(value) || null)
    refundAmount?: number;
}
