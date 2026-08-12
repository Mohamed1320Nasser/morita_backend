import { IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";

export class GrantManualRewardDto {
    @IsString()
    discordId: string;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    amount: number;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    reason?: string;

    @IsString()
    grantedByDiscordId: string;
}
