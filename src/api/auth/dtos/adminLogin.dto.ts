import { Expose } from "class-transformer";
import { LoginDto } from "./login.dto";

export class adminLoginDto extends LoginDto {}

export class adminloginResultDto {
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
