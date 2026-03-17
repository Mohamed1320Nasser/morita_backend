import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class TrackReferralDto {
  @IsString()
  @IsNotEmpty()
  referrerDiscordId: string;

  @IsString()
  @IsNotEmpty()
  referredDiscordId: string;

  @IsString()
  @IsOptional()
  inviteCode?: string; // Discord invite code
}
