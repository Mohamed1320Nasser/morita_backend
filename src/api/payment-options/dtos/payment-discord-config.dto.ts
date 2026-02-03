import { IsString, IsOptional } from "class-validator";

export class UpdatePaymentDiscordConfigDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    color?: string;

    @IsOptional()
    @IsString()
    bannerUrl?: string;

    @IsOptional()
    @IsString()
    thumbnailUrl?: string;

    @IsOptional()
    @IsString()
    cryptoButtonLabel?: string;

    @IsOptional()
    @IsString()
    cryptoButtonStyle?: string;

    @IsOptional()
    @IsString()
    paymentButtonLabel?: string;

    @IsOptional()
    @IsString()
    paymentButtonStyle?: string;

    @IsOptional()
    @IsString()
    footerText?: string;
}
