import { IsString, IsNotEmpty, IsUrl, IsOptional, Matches, IsBoolean, IsInt } from "class-validator";
import { Expose } from "class-transformer";

export class CreateTosDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    title: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    content: string;

    @IsUrl()
    @IsOptional()
    @Expose()
    bannerUrl?: string;

    @IsUrl()
    @IsOptional()
    @Expose()
    thumbnailUrl?: string;

    @IsString()
    @Matches(/^[0-9A-Fa-f]{6}$/) // Hex color without #
    @IsOptional()
    @Expose()
    embedColor?: string;

    @IsString()
    @IsOptional()
    @Expose()
    footerText?: string;

    @IsString()
    @IsOptional()
    @Expose()
    buttonLabel?: string;

    @IsBoolean()
    @IsOptional()
    @Expose()
    isActive?: boolean;
}

export class UpdateTosDto {
    @IsString()
    @IsOptional()
    @Expose()
    title?: string;

    @IsString()
    @IsOptional()
    @Expose()
    content?: string;

    @IsUrl()
    @IsOptional()
    @Expose()
    bannerUrl?: string;

    @IsUrl()
    @IsOptional()
    @Expose()
    thumbnailUrl?: string;

    @IsString()
    @Matches(/^[0-9A-Fa-f]{6}$/)
    @IsOptional()
    @Expose()
    embedColor?: string;

    @IsString()
    @IsOptional()
    @Expose()
    footerText?: string;

    @IsString()
    @IsOptional()
    @Expose()
    buttonLabel?: string;

    @IsBoolean()
    @IsOptional()
    @Expose()
    isActive?: boolean;
}

export class AcceptTosDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    discordId: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    discordUsername: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    tosId: string;

    @IsString()
    @IsOptional()
    @Expose()
    ipAddress?: string;
}

export class TosStatsDto {
    @Expose()
    totalAcceptances: number;

    @Expose()
    todayAcceptances: number;

    @Expose()
    currentVersion: number;

    @Expose()
    weeklyAcceptances: number;

    @Expose()
    monthlyAcceptances: number;
}
