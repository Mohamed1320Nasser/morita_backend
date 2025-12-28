import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsEnum, Min, Max } from "class-validator";
import { Expose, Type } from "class-transformer";
import { QuestionFieldType } from "@prisma/client";

export class CreateQuestionDto {
    @IsString()
    @IsNotEmpty()
    @Expose()
    question: string;

    @IsEnum(QuestionFieldType)
    @Expose()
    fieldType: QuestionFieldType;

    @IsString()
    @IsOptional()
    @Expose()
    placeholder?: string;

    @IsBoolean()
    @Expose()
    required: boolean;

    @IsInt()
    @IsOptional()
    @Min(1)
    @Expose()
    minLength?: number;

    @IsInt()
    @IsOptional()
    @Max(4000)
    @Expose()
    maxLength?: number;

    @IsInt()
    @Expose()
    displayOrder: number;

    @IsBoolean()
    @IsOptional()
    @Expose()
    isActive?: boolean;
}

export class UpdateQuestionDto {
    @IsString()
    @IsOptional()
    @Expose()
    question?: string;

    @IsEnum(QuestionFieldType)
    @IsOptional()
    @Expose()
    fieldType?: QuestionFieldType;

    @IsString()
    @IsOptional()
    @Expose()
    placeholder?: string;

    @IsBoolean()
    @IsOptional()
    @Expose()
    required?: boolean;

    @IsInt()
    @IsOptional()
    @Min(1)
    @Expose()
    minLength?: number;

    @IsInt()
    @IsOptional()
    @Max(4000)
    @Expose()
    maxLength?: number;

    @IsInt()
    @IsOptional()
    @Expose()
    displayOrder?: number;

    @IsBoolean()
    @IsOptional()
    @Expose()
    isActive?: boolean;
}

export class ReorderQuestionsDto {
    @IsString({ each: true })
    @IsNotEmpty()
    @Expose()
    questionIds: string[];
}
