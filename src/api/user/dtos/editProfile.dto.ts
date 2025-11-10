import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsPhoneNumber,
    IsPositive,
    IsString,
    Length,
    Matches,
} from "class-validator";

export class editProfileDto {
    @IsOptional()
    @IsString({ message: "fullname must be a string" })
    @IsNotEmpty({ message: "fullname must not be empty" })
    @Length(2, 50, { message: "fullname must be between 2 and 50 characters" })
    fullname?: string;

    @IsOptional()
    @Length(5, 15, { message: "phone number must be max 15 characters" })
    @IsString({ message: "phone must be a string" })
    @Matches(/^[0-9]*$/, { message: "phone number must contain only digits" })
    phone?: string;

    @IsOptional()
    @Transform(({ value }) =>
        typeof value == "string" ? JSON.parse(value) : value
    )
    @IsPositive({ each: true, message: "role Id must be a positive number" })
    role?: number[];

    @IsOptional()
    @Transform(({ value }) =>
        value === undefined ? value : Boolean(JSON.parse(value))
    )
    @IsBoolean({ message: "removeProfileImage must be boolean" })
    removeProfileImage?: boolean;
}
