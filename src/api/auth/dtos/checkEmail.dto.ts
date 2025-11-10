import { IsEmail, IsOptional, IsString } from "class-validator";

export class checkEmailDto {
    @IsOptional()
    @IsString({ message: "email Can Not Be Empty" })
    @IsEmail({}, { message: "email must be a valid email address" })
    email?: string;

    @IsOptional()
    @IsString({ message: "phone Can Not Be Empty" })
    phone?: string;
}
