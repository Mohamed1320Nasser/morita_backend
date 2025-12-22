import {
    IsString,
    IsOptional,
    IsBoolean,
    MaxLength,
    IsUUID,
    IsEnum,
    IsPositive,
    IsInt,
    Min,
    Max,
} from "class-validator";
import { PricingUnit } from "@prisma/client";
import { Transform } from "class-transformer";

export class CreatePricingMethodDto {
    @IsString()
    @IsUUID()
    serviceId: string;

    @IsString()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    groupName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @Transform(({ value }) => (value === "string" ? parseFloat(value) : value))
    @IsPositive({ message: "Base price must be greater than 0" })
    basePrice: number;

    @IsEnum(PricingUnit)
    pricingUnit: PricingUnit;

    @IsOptional()
    @Transform(({ value }) => (value === "string" ? parseInt(value) : value))
    @IsInt({ message: "Start level must be an integer" })
    @Min(1, { message: "Start level must be at least 1" })
    @Max(120, { message: "Start level must not exceed 120" })
    startLevel?: number;

    @IsOptional()
    @Transform(({ value }) => (value === "string" ? parseInt(value) : value))
    @IsInt({ message: "End level must be an integer" })
    @Min(1, { message: "End level must be at least 1" })
    @Max(120, { message: "End level must not exceed 120" })
    endLevel?: number;

    @IsOptional()
    @Transform(({ value }) => (value === "string" ? parseInt(value) : value))
    @IsPositive({ message: "Display order must be greater than 0" })
    displayOrder?: number = 0;

    @IsOptional()
    @Transform(({ value }) => (value === "string" ? Boolean(value) : value))
    @IsBoolean({ message: "Active must be a boolean" })
    active?: boolean = true;
}
