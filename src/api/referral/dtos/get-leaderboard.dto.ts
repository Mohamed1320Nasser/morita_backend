import { IsInt, Min, Max, IsOptional } from 'class-validator';

export class GetLeaderboardDto {
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
