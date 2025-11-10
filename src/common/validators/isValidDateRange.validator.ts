import moment from "moment";
import { BadRequestError } from "routing-controllers";
import {
    registerDecorator,
    Validate,
    ValidationArguments,
    ValidationOptions,
} from "class-validator";

function parseUserDate(dateStr: string, isTimeStr?: true): number {
    if ((!dateStr || typeof dateStr !== "string") && isTimeStr) {
        throw new BadRequestError(
            "Invalid time format. Please provide a valid string."
        );
    }

    const formats = [
        "YYYY-MM-DD",
        "DD-MM-YYYY",
        "MM-DD-YYYY",
        "YYYY/MM/DD",
        "DD/MM/YYYY",
        "MM/DD/YYYY",
        "YYYY-MM-DDTHH:mm:ssZ",
        "YYYY-MM-DD HH:mm",
        "DD-MM-YYYY HH:mm",
        "YYYY/MM/DD HH:mm",
        "DD/MM/YYYY HH:mm",
        moment.ISO_8601,
    ];
    const parsedDate = moment.utc(dateStr, formats, true);

    if (!parsedDate.isValid())
        throw new BadRequestError(
            `Invalid date format. Please use a valid format like ${formats.join(", ")}`
        );
    return parsedDate.toDate().getTime();
}

export function IsValidDateRange(
    validationOptions?: ValidationOptions & {
        fieldName: string;
        isTimeStr?: boolean;
    }
) {
    let errorMessage = "End date should be greater than start date";

    return function (object: Object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName,
            name: "isValidTimeRange",
            options: validationOptions,
            constraints: [],
            validator: {
                async validate(value: any, args: ValidationArguments) {
                    try {
                        const fieldName: any = validationOptions?.fieldName,
                            isTimeStr: any = validationOptions?.isTimeStr;
                        if (!fieldName)
                            errorMessage =
                                "provided start date is not valid or not found";
                        const startHour = (args.object as any)[fieldName];
                        const endHour = value;

                        const isValid =
                            parseUserDate(endHour, isTimeStr) >
                            parseUserDate(startHour, isTimeStr);

                        if (!isValid)
                            errorMessage =
                                "End date should be greater than start date";
                        return isValid;
                    } catch (error: any) {
                        errorMessage = error.message;
                        return false;
                    }
                },
                defaultMessage() {
                    return errorMessage;
                },
            },
        });
    };
}
