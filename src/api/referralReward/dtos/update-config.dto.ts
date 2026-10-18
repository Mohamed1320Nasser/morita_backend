import {
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    IsArray,
    IsEnum,
    IsIn,
    IsInt,
    Min,
    Max,
    MaxLength,
    ArrayMaxSize,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ReferralMilestoneDto {
    @IsInt()
    @Min(1)
    count: number;

    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Milestone bonus can have at most 2 decimal places' })
    @Min(0)
    reward: number;

    // Only BONUS is implemented: the bonus is paid on top of the per-referral amount.
    @IsOptional()
    @IsIn(["BONUS"])
    type?: string = "BONUS";
}

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
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Per-referral amount can have at most 2 decimal places' })
    @Min(0)
    perReferralAmount?: number;

    @IsOptional()
    @IsBoolean()
    milestonesEnabled?: boolean;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => ReferralMilestoneDto)
    milestones?: ReferralMilestoneDto[];

    @IsOptional()
    @IsBoolean()
    requireOnboarding?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    minimumRetentionRate?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(365)
    minimumDaysInServer?: number;

    @IsOptional()
    @IsBoolean()
    countOnlyActive?: boolean;

    @IsOptional()
    @IsInt()
    @Min(1)
    maxRewardsPerDay?: number;

    @IsOptional()
    @IsInt()
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
    @MaxLength(10)
    currencyName?: string;

    // ---- Order rewards ----

    @IsOptional()
    @IsBoolean()
    orderRewardEnabled?: boolean;

    @IsOptional()
    @IsIn(['FIXED', 'PERCENTAGE'])
    orderRewardType?: 'FIXED' | 'PERCENTAGE';

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Order reward value can have at most 2 decimal places' })
    @Min(0)
    orderRewardValue?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Max reward per order can have at most 2 decimal places' })
    @Min(0)
    orderRewardMaxPerOrder?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Minimum order value can have at most 2 decimal places' })
    @Min(0)
    orderRewardMinOrderValue?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    orderRewardOrderCount?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(3650)
    orderRewardWindowDays?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(90)
    orderRewardHoldDays?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Lifetime cap can have at most 2 decimal places' })
    @Min(0)
    orderRewardLifetimeCap?: number;
}
