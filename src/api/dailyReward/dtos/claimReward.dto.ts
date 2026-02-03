import { IsString } from "class-validator";

export class ClaimRewardDto {
    @IsString()
    discordId!: string;
}
