import { IsNotEmpty, IsString, IsUUID, Matches } from "class-validator";

export class ChangePasswordDto {
    @IsNotEmpty({ message: "Old Passwoed can not be empty" })
    @IsString({ message: "Old Passwoed Can Not Be Empty" })
    old: string;

    @IsNotEmpty({ message: "New Passwoed not be empty" })
    @IsString({ message: "New Passwoed Can Not Be Empty" })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
        message: "New Password must be strong",
    })
    new: string;
}
