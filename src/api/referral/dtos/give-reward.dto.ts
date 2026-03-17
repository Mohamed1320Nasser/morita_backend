import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class GiveRewardDto {
  @IsString()
  @IsNotEmpty()
  referredDiscordId: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;
}
