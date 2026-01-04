import { Transform } from "class-transformer";
import { OtpType } from "@prisma/client";
import { IsEmail, IsEnum, IsNotEmpty } from "class-validator";

export class RequestOTPDto {
    @IsNotEmpty({ message: "Email cannot be empty" })
    @IsEmail({}, { message: "Email must be a valid email" })
    @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
    email: string;

    @IsEnum(OtpType, { message: "Type must be a valid OTP type" })
    type: OtpType;
}
