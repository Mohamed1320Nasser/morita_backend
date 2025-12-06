import {
    IsString,
    IsOptional,
    IsNumber,
    IsEnum,
    MaxLength,
    IsInt,
} from "class-validator";
import { TicketStatus } from "@prisma/client";

export class UpdateTicketDto {
    @IsOptional()
    @IsEnum(TicketStatus)
    status?: TicketStatus;

    @IsOptional()
    @IsString()
    serviceId?: string;

    @IsOptional()
    @IsNumber()
    calculatedPrice?: number;

    @IsOptional()
    @IsString()
    paymentMethodId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    currency?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    customerNotes?: string;

    @IsOptional()
    @IsInt()
    supportId?: number;

    @IsOptional()
    @IsString()
    supportDiscordId?: string;
}

export class UpdateTicketStatusDto {
    @IsEnum(TicketStatus)
    status: TicketStatus;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}

export class AssignSupportDto {
    @IsInt()
    supportId: number;

    @IsString()
    supportDiscordId: string;
}
