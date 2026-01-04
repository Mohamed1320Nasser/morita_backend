import { IsNotEmpty, IsString, Matches } from "class-validator";

export class ChangePasswordDto {
    @IsNotEmpty({ message: "Old password cannot be empty" })
    @IsString({ message: "Old password must be a string" })
    old: string;

    @IsNotEmpty({ message: "New password cannot be empty" })
    @IsString({ message: "New password must be a string" })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
        message: "New password must be strong",
    })
    new: string;
}
