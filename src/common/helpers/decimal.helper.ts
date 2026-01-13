import { Decimal } from "@prisma/client/runtime/library";
export function convertDecimalsToNumbers<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;

    if (obj instanceof Decimal) {
        return obj.toNumber() as unknown as T;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => convertDecimalsToNumbers(item)) as unknown as T;
    }

    if (typeof obj === "object" && obj.constructor === Object) {
        const result: Record<string, any> = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result[key] = convertDecimalsToNumbers((obj as any)[key]);
            }
        }
        return result as T;
    }

    return obj;
}
