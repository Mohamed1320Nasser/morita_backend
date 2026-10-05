import { IsOptional, IsNumber, IsString, Min, Max, IsIn, MaxLength } from "class-validator";
import { Type } from "class-transformer";

export class GetRewardsDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    limit?: number = 10;

    @IsOptional()
    @IsString()
    search?: string;
}

export class GetOrderRewardsDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number = 10;

    @IsOptional()
    @IsIn(['all', 'PENDING', 'PAID', 'CANCELLED'])
    status?: string;

    @IsOptional()
    @IsString()
    search?: string;
}

export class CancelOrderRewardDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    reason?: string;
}
