import { IsString, IsNotEmpty, IsOptional, IsBoolean } from "class-validator";

export class CreateWalletDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    currency: string;

    @IsString()
    @IsNotEmpty()
    network: string;

    @IsString()
    @IsNotEmpty()
    address: string;
}

export class UpdateWalletDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    currency?: string;

    @IsOptional()
    @IsString()
    network?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
