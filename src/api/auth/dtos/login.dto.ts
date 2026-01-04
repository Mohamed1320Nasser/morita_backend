import { Transform, Expose } from "class-transformer";
import { IsNotEmpty, IsOptional } from "class-validator";

export class LoginDto {
    @IsNotEmpty({ message: "Email cannot be empty" })
    @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
    email: string;

    @IsNotEmpty({ message: "Password cannot be empty" })
    password: string;

    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    identifier: string;
}

export class loginResultDto {
    @Expose()
    login: boolean;

    @Expose()
    token: string;

    @Expose()
    user: {
        fullname: true;
        profile: {
            title?: string;
            folder?: string;
        };
    };
}
