import { Transform } from "class-transformer";
import {
    IsString,
    IsNumber,
    IsOptional,
    IsEnum,
    IsIn,
} from "class-validator";
import { OrderStatus } from "./common.dto";
import { getListDto } from "../../common/dtos/getList.dto";

export class GetOrderListDto extends getListDto {

    @IsEnum(OrderStatus)
    @IsOptional()
    status?: OrderStatus;

    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || null)
    customerId?: number;

    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || null)
    workerId?: number;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    ticketId?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    serviceId?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    startDate?: string;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    endDate?: string;

    // Which date startDate/endDate filter on: when the order was created, or
    // when it was completed (revenue is counted when an order completes)
    @IsIn(["createdAt", "completedAt"])
    @IsOptional()
    dateField?: "createdAt" | "completedAt";

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    sortBy?: string = "createdAt";

    @IsString()
    @IsOptional()
    sortOrder?: "asc" | "desc" = "desc";
}
