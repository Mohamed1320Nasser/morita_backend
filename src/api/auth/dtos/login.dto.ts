import { IsNotEmpty, IsObject, IsOptional, IsPositive } from "class-validator";
import { Expose } from "class-transformer";

export class LoginDto {
    @IsNotEmpty({ message: "email Can Not Be Empty" })
    email: string;

    @IsNotEmpty({ message: "Password Can Not Be Empty" })
    password: string;

    @IsOptional()
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
