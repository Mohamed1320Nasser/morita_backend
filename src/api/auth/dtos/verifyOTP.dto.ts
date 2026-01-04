import { Transform } from "class-transformer";
import { IsNotEmpty } from "class-validator";
import { BaseOTPRequestDto } from "./resendOTP.dto";

export class VerifyOTPDto extends BaseOTPRequestDto {
    @IsNotEmpty({ message: "OTP cannot be empty" })
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    otp: string;
}
