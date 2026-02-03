import { Transform } from "class-transformer";
import {
    IsString,
    IsOptional,
    IsObject,
} from "class-validator";
import { BaseOrderDto } from "./common.dto";

export class DiscordCreateOrderDto extends BaseOrderDto {
    @IsString()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    customerDiscordId!: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    workerDiscordId?: string;

    @IsString()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    supportDiscordId!: string;

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
