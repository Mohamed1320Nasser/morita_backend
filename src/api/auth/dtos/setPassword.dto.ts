import { IsNotEmpty, IsString, MinLength, Matches } from "class-validator";

export class SetPasswordDto {
    @IsNotEmpty({ message: "Token is required" })
    @IsString({ message: "Token must be a string" })
    token: string;

    @IsNotEmpty({ message: "Password is required" })
    @IsString({ message: "Password must be a string" })
    @MinLength(8, { message: "Password must be at least 8 characters long" })
    @Matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
        {
            message:
                "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        }
    )
    password: string;

    @IsNotEmpty({ message: "Confirm password is required" })
    @IsString({ message: "Confirm password must be a string" })
    confirmPassword: string;
}
