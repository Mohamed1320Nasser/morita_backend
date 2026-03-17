import { IsOptional, IsDateString, IsIn, IsNumber, Min, IsString } from "class-validator";

export class DiscordEngagementQueryDto {
    @IsOptional()
    @IsIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    period?: string;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsNumber()
    @Min(1)
    limit?: number;
}

export class TopEngagedUsersQueryDto {
    @IsOptional()
    @IsIn(['daily', 'weekly', 'monthly', 'yearly'])
    period?: string;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @IsNumber()
    @Min(1)
    limit?: number;
}

export class AwardEngagementRankDto {
    @IsString()
    discordId: string;

    @IsString()
    rank: string;

    @IsString()
    reason: string;

    @IsOptional()
    @IsNumber()
    userId?: number;
}
