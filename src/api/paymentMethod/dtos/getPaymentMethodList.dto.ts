import {
    IsOptional,
    IsString,
    IsBoolean,
    IsInt,
    Min,
    Max,
    IsEnum,
} from "class-validator";
import { Transform } from "class-transformer";
import { PaymentType } from "@prisma/client";

export class GetPaymentMethodListDto {
    @IsOptional()
    @IsEnum(PaymentType)
    type?: PaymentType;

    @IsOptional()
    @IsString()
    search?: string = "";

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === "true")
    active?: boolean;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Transform(({ value }) => parseInt(value))
    page?: number = 1;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    @Transform(({ value }) => parseInt(value))
    limit?: number = 10;

    @IsOptional()
    @IsString()
    sortBy?: string = "name";

    @IsOptional()
    @IsString()
    sortOrder?: "asc" | "desc" = "asc";
}
