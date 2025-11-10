import { IsEmail, IsNotEmpty, IsStrongPassword, IsUUID } from "class-validator";

export class recoverPasswordDto {
    @IsNotEmpty({ message: "New Password Can Not Be Empty" })
    @IsStrongPassword(
        {
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 1,
        },
        {
            message:
                "Password must contain at least one digit, one lowercase letter, one uppercase letter, one special character, and be between 8 and 12 characters long.",
        }
    )
    new: string;

    @IsUUID(undefined, { message: "request Id is not valid" })
    requestId: string;

    @IsNotEmpty({ message: "email can not be empty" })
    @IsEmail({}, { message: "email must be a valid email address" })
    email: string;
}
