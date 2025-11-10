import { plainToInstance } from "class-transformer";

export function convertResponse(classType: any, plain: any) {
    const res = plainToInstance(classType, plain, {
        excludeExtraneousValues: true,
        ignoreDecorators: true,
    });
    return res;
}
