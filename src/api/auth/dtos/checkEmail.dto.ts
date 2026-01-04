import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString } from "class-validator";

export class checkEmailDto {
    @IsOptional()
    @IsString({ message: "Email must be a string" })
    @IsEmail({}, { message: "Email must be a valid email address" })
    @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
    email?: string;

    @IsOptional()
    @IsString({ message: "Phone must be a string" })
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    phone?: string;
}
