import { IsString, IsNotEmpty } from 'class-validator';

export class GiveRewardDto {
  @IsString()
  @IsNotEmpty()
  referredDiscordId: string;
}
