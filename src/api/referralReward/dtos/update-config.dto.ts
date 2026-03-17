import { IsBoolean, IsNumber, IsOptional, IsString, IsArray, IsEnum, Min } from "class-validator";

export class UpdateReferralRewardConfigDto {
    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;

    @IsOptional()
    @IsEnum(['PER_REFERRAL', 'MILESTONE', 'HYBRID'])
    rewardMode?: string;

    @IsOptional()
    @IsBoolean()
    perReferralEnabled?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    perReferralAmount?: number;

    @IsOptional()
    @IsBoolean()
    milestonesEnabled?: boolean;

    @IsOptional()
    @IsArray()
    milestones?: Array<{ count: number; reward: number; type: string }>;

    @IsOptional()
    @IsBoolean()
    requireOnboarding?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    minimumRetentionRate?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    minimumDaysInServer?: number;

    @IsOptional()
    @IsBoolean()
    countOnlyActive?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(1)
    maxRewardsPerDay?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    cooldownMinutes?: number;

    @IsOptional()
    @IsBoolean()
    notifyDiscord?: boolean;

    @IsOptional()
    @IsBoolean()
    notifyDM?: boolean;

    @IsOptional()
    @IsString()
    currencyName?: string;
}
