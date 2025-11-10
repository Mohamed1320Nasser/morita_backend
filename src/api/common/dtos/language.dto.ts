import { IsString, MaxLength, MinLength } from "class-validator";

export class LanguageDto {
    @IsString({ message: "phone country code Can Not Be Empty" })
    text: string;

    @MaxLength(5)
    @MinLength(2)
    @IsString({ message: "language code Can Not Be Empty" })
    langCode: string;
}
