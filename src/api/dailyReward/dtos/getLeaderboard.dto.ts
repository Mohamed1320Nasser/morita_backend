import { IsOptional, IsInt, Min, Max } from "class-validator";
import { Transform } from "class-transformer";

export class GetLeaderboardDto {
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || 10)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 10;
}
