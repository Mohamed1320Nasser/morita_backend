import {
    IsString,
    IsOptional,
    IsEnum,
    IsInt,
    Min,
    Max,
} from "class-validator";
import { Type } from "class-transformer";
import { TicketStatus } from "@prisma/client";

export class GetTicketListDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(TicketStatus)
    status?: TicketStatus;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    customerId?: number;

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    supportId?: number;

    @IsOptional()
    @IsString()
    customerDiscordId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 10;

    @IsOptional()
    @IsString()
    sortBy?: string = "createdAt";

    @IsOptional()
    @IsString()
    sortOrder?: "asc" | "desc" = "desc";
}

export class GetTicketByChannelDto {
    @IsString()
    channelId: string;
}

export class GetTicketByCustomerDiscordIdDto {
    @IsString()
    customerDiscordId: string;
}
