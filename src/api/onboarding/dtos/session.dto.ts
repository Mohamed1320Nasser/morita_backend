import { IsString, IsNotEmpty, IsBoolean, IsOptional } from "class-validator";
import { Expose } from "class-transformer";

export class CreateSessionDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    discordId: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    discordUsername: string;
}

export class UpdateSessionDto {
    @IsBoolean()
    @IsOptional()
    @Expose()
    tosAccepted?: boolean;

    @IsBoolean()
    @IsOptional()
    @Expose()
    questionsCompleted?: boolean;

    @IsBoolean()
    @IsOptional()
    @Expose()
    roleAssigned?: boolean;

    @IsBoolean()
    @IsOptional()
    @Expose()
    registeredInDb?: boolean;
}

export class RegisterUserDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    discordId: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    discordUsername: string;

    @IsString()
    @IsOptional()
    @Expose()
    discordDisplayName?: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    fullname: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    email: string;

    @IsString()
    @IsOptional()
    @Expose()
    phone?: string;
}
