import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    Min,
    MaxLength,
    IsUUID,
} from "class-validator";
import { Expose } from "class-transformer";

export class UpdateServiceDto {
    @IsOptional()
    @IsString()
    @IsUUID()
    categoryId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    slug?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    emoji?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    displayOrder?: number;
}
