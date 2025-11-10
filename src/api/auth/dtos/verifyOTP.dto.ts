import { IsNotEmpty, IsUUID } from "class-validator";

export class VerifyOTPDto {
    @IsUUID(undefined, { message: "request Id is not valid" })
    requestId: string;

    @IsNotEmpty({ message: "otp Can Not Be Empty" })
    otp: string;
}
