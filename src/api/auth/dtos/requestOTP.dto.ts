import { OtpType } from "@prisma/client";
import { IsEmail, IsEnum, IsNotEmpty, IsUUID } from "class-validator";

export class RequestOTPDto {
    @IsNotEmpty({ message: "email Can Not Be Empty" })
    @IsEmail({}, { message: "email Must Be An Email" })
    email: string;

    @IsEnum(OtpType, { message: "must be an vaild type" })
    type: OtpType;
}
