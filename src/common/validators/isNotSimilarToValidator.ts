import {
    registerDecorator,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
    ValidationArguments,
} from "class-validator";

@ValidatorConstraint({ async: false })
export class IsNotSimilarToConstraint implements ValidatorConstraintInterface {
    validate(password: any, args: ValidationArguments) {
        const [relatedPropertyName] = args.constraints;
        const email = (args.object as any)[relatedPropertyName];
        if (typeof password !== "string" || typeof email !== "string")
            return false;

        const emailParts = email.split("@");
        if (emailParts.length !== 2) return false;

        const [localPart, domainPart] = emailParts;
        return !password.includes(localPart) && !password.includes(domainPart);
    }

    defaultMessage(args: ValidationArguments) {
        return "Password should not contain parts of the email address";
    }
}

export function IsNotSimilarTo(
    property: string,
    validationOptions?: ValidationOptions
) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            constraints: [property],
            validator: IsNotSimilarToConstraint,
        });
    };
}
