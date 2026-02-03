import { IsBoolean, IsNumber, IsOptional, IsString, IsEnum, Min, Max } from "class-validator";

export enum RewardType {
    FIXED = "FIXED",
    PERCENTAGE = "PERCENTAGE",
}

export class UpdateOrderRewardConfigDto {
    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;

    @IsOptional()
    @IsEnum(RewardType)
    rewardType?: RewardType;

    @IsOptional()
    @IsNumber()
    @Min(0)
    fixedAmount?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(100)
    percentage?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    minReward?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    maxReward?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    minOrderAmount?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    firstOrderBonus?: number;

    @IsOptional()
    @IsBoolean()
    notifyDiscord?: boolean;

    @IsOptional()
    @IsString()
    currencyName?: string;
}
