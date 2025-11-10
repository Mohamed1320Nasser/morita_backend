import prisma from "../prisma/client";
import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from "class-validator";
import getLanguage from "../language";

export function IsExistsItem(
    validationOptions?: { tableName: any } & ValidationOptions
) {
    return (object: any, propertyName: string) => {
        registerDecorator({
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: {
                async validate(value: any, args: ValidationArguments) {
                    const tableName = validationOptions?.tableName;
                    if (!tableName)
                        throw new Error(getLanguage("en").tableNameRequired);
                    if (!value) return false;
                    if (Array.isArray(value)) {
                        for (const item of value) {
                            const itemExists = await (
                                prisma[tableName] as any
                            ).findUnique({
                                where: {
                                    id:
                                        tableName === "grade"
                                            ? item.gradeId
                                            : item,
                                },
                            });

                            if (!itemExists) return false;
                        }

                        return true;
                    } else {
                        const item = await (
                            prisma[tableName] as any
                        ).findUnique({
                            where: { id: value },
                        });

                        if (!item) return false;
                        return true;
                    }
                },
            },
        });
    };
}
