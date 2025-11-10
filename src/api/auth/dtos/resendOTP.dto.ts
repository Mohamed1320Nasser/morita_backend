import { IsNotEmpty, IsUUID } from "class-validator";

export class ResendOTPDto {
    @IsNotEmpty({ message: "Request ID is required" })
    @IsUUID(undefined, { message: "Request ID must be a valid UUID" })
    requestId: string;
}

