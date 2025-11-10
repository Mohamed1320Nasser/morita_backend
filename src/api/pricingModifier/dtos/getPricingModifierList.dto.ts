import {
    IsOptional,
    IsString,
    IsBoolean,
    IsInt,
    Min,
    Max,
    IsUUID,
} from "class-validator";
import { Transform } from "class-transformer";

export class GetPricingModifierListDto {
    @IsOptional()
    @IsString()
    @IsUUID()
    methodId?: string;

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
    sortBy?: string = "priority";

    @IsOptional()
    @IsString()
    sortOrder?: "asc" | "desc" = "asc";
}
