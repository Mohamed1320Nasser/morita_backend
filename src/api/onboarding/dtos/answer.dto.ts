import { IsString, IsNotEmpty, IsArray, ValidateNested } from "class-validator";
import { Expose, Type } from "class-transformer";

export class AnswerItemDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    questionId: string;

    @IsString()
    @IsNotEmpty()
    @Expose()
    answer: string;
}

export class SubmitAnswersDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    discordId: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AnswerItemDto)
    @Expose()
    answers: AnswerItemDto[];
}

export class UserAnswersDto {
    @Expose()
    userId: number;

    @Expose()
    discordId: string;

    @Expose()
    discordUsername: string;

    @Expose()
    fullname: string;

    @Expose()
    email: string;

    @Expose()
    answeredAt: Date;

    @Expose()
    answers: {
        questionId: string;
        question: string;
        answer: string;
        required: boolean;
    }[];
}
