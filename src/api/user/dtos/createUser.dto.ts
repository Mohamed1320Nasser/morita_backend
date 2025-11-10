import { Expose } from "class-transformer";
import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsStrongPassword,
    Length,
    Matches,
} from "class-validator";

export class createUserDto {
    @IsNotEmpty({ message: "email must not be empty" })
    @IsEmail({}, { message: "email must be a valid email address" })
    @Length(5, 64, { message: "Email local part cannot exceed 64 characters" })
    @Matches(
        /^[\w-]+(\.[\w-]+)*@[A-Za-z0-9]+(\.[A-Za-z0-9]+)*(\.[A-Za-z]{2,})$/,
        { message: "Invalid email format" }
    )
    email: string;

    @IsString({ message: "fullname must be a string" })
    @IsNotEmpty({ message: "fullname must not be empty" })
    @Length(2, 50, { message: "fullname must be between 2 and 50 characters" })
    fullname: string;

    @IsOptional()
    @IsString({ message: "phone must be a string" })
    @Matches(/^[0-9]*$/, { message: "phone number must contain only digits" })
    @Length(5, 15, { message: "phone number must be max 15 characters" })
    phone?: string;

    @IsNotEmpty({ message: "Password Can Not Be Empty" })
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
    password: string;
}

export class SignupResultDto {
    @Expose()
    id: number;
}
