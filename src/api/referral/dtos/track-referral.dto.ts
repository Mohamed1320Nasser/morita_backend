import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class TrackReferralDto {
  // Discord-side inviter. For bot-created personal invites this is the bot,
  // so the backend resolves the real owner from inviteCode first.
  @IsString()
  @IsOptional()
  referrerDiscordId?: string;

  @IsString()
  @IsNotEmpty()
  referredDiscordId: string;

  @IsString()
  @IsOptional()
  inviteCode?: string;
}
