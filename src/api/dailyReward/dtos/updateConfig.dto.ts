import { IsBoolean, IsInt, IsOptional, IsString, Min, Max } from "class-validator";

export class UpdateConfigDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    minAmount?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    maxAmount?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(168) // Max 1 week
    cooldownHours?: number;

    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;

    @IsOptional()
    @IsString()
    currencyName?: string;

    @IsOptional()
    @IsString()
    currencyEmoji?: string;

    @IsOptional()
    @IsString()
    gifUrl?: string;

    @IsOptional()
    @IsString()
    thumbnailUrl?: string;
}
