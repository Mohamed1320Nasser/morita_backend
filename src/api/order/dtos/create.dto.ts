import { Transform } from "class-transformer";
import {
    IsString,
    IsNumber,
    IsOptional,
    IsObject,
} from "class-validator";
import { BaseOrderDto } from "./common.dto";

export class CreateOrderDto extends BaseOrderDto {
    @IsNumber()
    @Transform(({ value }) => parseInt(value) || null)
    customerId!: number;

    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || null)
    workerId?: number;

    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || null)
    supportId?: number;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    ticketId?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    discordChannelId?: string;

    @IsObject()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? JSON.parse(value) : value))
    jobDetails?: any;
}
