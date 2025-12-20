import {
    IsString,
    IsOptional,
    IsNumber,
    IsEnum,
    MaxLength,
    IsInt,
} from "class-validator";
import { TicketStatus } from "@prisma/client";

export class CreateTicketDto {
    @IsInt()
    customerId: number;

    @IsString()
    customerDiscordId: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    serviceId?: string;

    @IsString()
    channelId: string;

    @IsOptional()
    @IsNumber()
    calculatedPrice?: number;

    @IsOptional()
    @IsString()
    paymentMethodId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    currency?: string = "USD";

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    customerNotes?: string;
}

export class CreateTicketFromDiscordDto {
    @IsString()
    customerDiscordId: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    serviceId?: string;

    @IsString()
    channelId: string;

    @IsOptional()
    @IsNumber()
    calculatedPrice?: number;

    @IsOptional()
    @IsString()
    paymentMethodId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    currency?: string = "USD";

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    customerNotes?: string;

    // Customer info from Discord
    @IsString()
    customerName: string;

    @IsOptional()
    @IsString()
    customerEmail?: string;

    @IsOptional()
    @IsString()
    customerDiscordRole?: string; // Discord role: admin, support, worker, customer
}
