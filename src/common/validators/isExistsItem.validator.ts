import prisma from "../prisma/client";
import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from "class-validator";
import getLanguage from "../language";

type HasFindFirst<T> = T extends keyof typeof prisma
    ? (typeof prisma)[T] extends { findFirst: any }
        ? T
        : never
    : never;
type TableNameWithFindFirst = HasFindFirst<keyof typeof prisma>;
type PrismaWhere<T extends TableNameWithFindFirst> =
    "findFirst" extends keyof (typeof prisma)[T]
        ? Parameters<(typeof prisma)[T]["findFirst"]>[0] extends {
              where?: infer W;
          }
            ? W
            : never
        : never;
type TableFields<T extends TableNameWithFindFirst> = keyof PrismaWhere<T>;

export function IsExistsItem<T extends TableNameWithFindFirst>(
    validationOptions?: {
        tableName: T;
        field?: TableFields<T>;
    } & ValidationOptions
) {
    return (object: any, propertyName: string) => {
        registerDecorator({
            target: object.constructor,
            propertyName,
            name: "IsExistsItem",
            options: validationOptions,
            constraints: [],
            validator: {
                async validate(value: any, args: ValidationArguments) {
                    const tableName = validationOptions?.tableName;
                    const field = validationOptions?.field || "id";
                    if (!tableName)
                        throw new Error(getLanguage("en").tableNameRequired);
                    if (!value) return false;

                    const model = prisma[tableName] as any;
                    // const supportsActive = 'fields' in model && typeof model.fields === 'object'
                    //     ? 'active' in model.fields
                    //     : true;

                    const buildWhere = (item: any) => {
                        const where: Record<string, any> = { [field]: item };
                        // if (supportsActive) where.active = true;
                        return { where };
                    };

                    if (Array.isArray(value)) {
                        const results = await Promise.all(
                            value.map(item => model.findFirst(buildWhere(item)))
                        );
                        return results.every(item => !!item);
                    } else {
                        const item = await model.findFirst(buildWhere(value));
                        return !!item;
                    }
                },
            },
        });
    };
}
