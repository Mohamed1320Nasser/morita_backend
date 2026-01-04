import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsStrongPassword, IsUUID } from "class-validator";

export class recoverPasswordDto {
    @IsNotEmpty({ message: "New password cannot be empty" })
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

    @IsUUID(undefined, { message: "Request ID is not valid" })
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    requestId: string;

    @IsNotEmpty({ message: "Email cannot be empty" })
    @IsEmail({}, { message: "Email must be a valid email address" })
    @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
    email: string;
}
