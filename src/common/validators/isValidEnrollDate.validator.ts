import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
} from "class-validator";

@ValidatorConstraint({ name: "IsValidEnrollEndDate", async: false })
export class IsValidEnrollEndDateConstraint
    implements ValidatorConstraintInterface
{
    validate(enrollEndDate: Date, args: ValidationArguments) {
        const object: any = args.object;
        const startDate: Date = object.startDate;
        const endDate: Date = object.endDate;

        if (
            !(enrollEndDate instanceof Date) ||
            !(startDate instanceof Date) ||
            !(endDate instanceof Date)
        )
            return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return (
            enrollEndDate > startDate &&
            enrollEndDate <= endDate &&
            enrollEndDate > today
        );
    }

    defaultMessage(args: ValidationArguments) {
        const object: any = args.object;

        return `$property must be a valid date between ${object?.startDate} and ${object?.endDate} and greater than to today.`;
    }
}

export function IsValidEnrollEndDate(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints: [],
            validator: IsValidEnrollEndDateConstraint,
        });
    };
}
