import { IsInt, Min, Max, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GetLeaderboardDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsIn(['total', 'active', 'retention', 'left'])
  sortBy?: string;
}
