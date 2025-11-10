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

export function IsUniqueField<T extends TableNameWithFindFirst>(
    validationOptions?: {
        tableName: T;
        field: TableFields<T>;
    } & ValidationOptions
) {
    return (object: any, propertyName: string) => {
        registerDecorator({
            name: "isUniqueItem",
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: {
                async validate(value: any, args: ValidationArguments) {
                    const field = validationOptions?.field;
                    const tableName = validationOptions?.tableName;

                    if (!field)
                        throw new Error(getLanguage("en").fieldNameRequired);
                    if (!tableName)
                        throw new Error(getLanguage("en").tableNameRequired);
                    if (!value) return false;

                    const model = prisma[tableName] as any;
                    const supportsActive =
                        "fields" in model && typeof model.fields === "object"
                            ? "active" in model.fields
                            : true;

                    const buildWhere = (item: any) => {
                        const where: Record<string, any> = { [field]: item };
                        if (supportsActive) where.active = true;
                        return { where };
                    };

                    const item = await (prisma[tableName] as any).findFirst(
                        buildWhere(value)
                    );
                    if (item) return false;
                    return true;
                },
            },
        });
    };
}
