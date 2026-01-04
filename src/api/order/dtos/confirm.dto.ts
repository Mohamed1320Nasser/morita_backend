import { Transform } from "class-transformer";
import {
    IsString,
    IsNumber,
    IsOptional,
} from "class-validator";

export class ConfirmOrderDto {
    @IsString()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    orderId!: string;

    @IsNumber()
    @Transform(({ value }) => parseInt(value) || null)
    customerId!: number;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    feedback?: string;
}
