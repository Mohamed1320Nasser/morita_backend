import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class UpdateConfigDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    minAmount?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
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

    @IsOptional()
    @IsBoolean()
    reminderEnabled?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(168) // Max 1 week
    reminderAfterHours?: number;

    @IsOptional()
    @IsString()
    reminderChannelId?: string;
}
