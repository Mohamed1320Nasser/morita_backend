import * as Sentry from "@sentry/node";
// this code is copied from nestjs src on: 24/02/2023

import logger from "../loggers";

interface Type<T = any> extends Function {
    new (...args: any[]): T;
}

type TransformMetadataKey =
    | "_excludeMetadatas"
    | "_exposeMetadatas"
    | "_typeMetadatas"
    | "_transformMetadatas";

interface MappedType<T> extends Type<T> {
    new (): T;
}

function applyIsOptionalDecorator(targetClass: Function, propertyKey: string) {
    if (!isClassValidatorAvailable()) {
        return;
    }
    const classValidator: typeof import("class-validator") = require("class-validator");
    const decoratorFactory = classValidator.IsOptional();
    decoratorFactory(targetClass.prototype, propertyKey);

    const validateIfDecorator = classValidator.ValidateIf(
        (obj, value) => value !== ""
    );
    validateIfDecorator(targetClass.prototype, propertyKey);
}

function isClassTransformerAvailable() {
    try {
        require("class-transformer");
        return true;
    } catch {
        return false;
    }
}

function isClassValidatorAvailable() {
    try {
        require("class-validator");
        return true;
    } catch {
        return false;
    }
}

function inheritTransformerMetadata(
    key: TransformMetadataKey,
    parentClass: Type<any>,
    targetClass: Function,
    isPropertyInherited?: (key: string) => boolean
) {
    let classTransformer: any;
    try {
        /** "class-transformer" >= v0.3.x */
        classTransformer = require("class-transformer/cjs/storage");
    } catch {
        /** "class-transformer" <= v0.3.x */
        classTransformer = require("class-transformer/storage");
    }
    const metadataStorage /*: typeof import('class-transformer/types/storage').defaultMetadataStorage */ =
        classTransformer.defaultMetadataStorage;

    while (parentClass && parentClass !== Object) {
        if (metadataStorage[key].has(parentClass)) {
            const metadataMap = metadataStorage[key] as Map<
                Function,
                Map<string, any>
            >;
            const parentMetadata = metadataMap.get(parentClass);

            const targetMetadataEntries: Iterable<[string, any]> = Array.from(
                parentMetadata!.entries()
            )
                .filter(
                    ([key]) => !isPropertyInherited || isPropertyInherited(key)
                )
                .map(([key, metadata]) => {
                    if (Array.isArray(metadata)) {
                        // "_transformMetadatas" is an array of elements
                        const targetMetadata = metadata.map(item => ({
                            ...item,
                            target: targetClass,
                        }));
                        return [key, targetMetadata];
                    }
                    return [key, { ...metadata, target: targetClass }];
                });

            if (metadataMap.has(targetClass)) {
                const existingRules = metadataMap.get(targetClass)!.entries();
                metadataMap.set(
                    targetClass,
                    new Map([...existingRules, ...targetMetadataEntries])
                );
            } else {
                metadataMap.set(targetClass, new Map(targetMetadataEntries));
            }
        }
        parentClass = Object.getPrototypeOf(parentClass);
    }
}

function inheritValidationMetadata(
    parentClass: Type<any>,
    targetClass: Function,
    isPropertyInherited?: (key: string) => boolean
) {
    if (!isClassValidatorAvailable()) {
        return;
    }
    try {
        const classValidator: typeof import("class-validator") = require("class-validator");
        const metadataStorage: import("class-validator").MetadataStorage = (
            classValidator as any
        ).getMetadataStorage
            ? (classValidator as any).getMetadataStorage()
            : classValidator.getFromContainer(classValidator.MetadataStorage);

        const getTargetValidationMetadatasArgs = [
            parentClass,
            null!,
            false,
            false,
        ];
        const targetMetadata: ReturnType<
            typeof metadataStorage.getTargetValidationMetadatas
        > = (metadataStorage.getTargetValidationMetadatas as Function)(
            ...getTargetValidationMetadatasArgs
        );
        return targetMetadata
            .filter(
                ({ propertyName }) =>
                    !isPropertyInherited || isPropertyInherited(propertyName)
            )
            .map(value => {
                const originalType = Reflect.getMetadata(
                    "design:type",
                    parentClass.prototype,
                    value.propertyName
                );
                if (originalType) {
                    Reflect.defineMetadata(
                        "design:type",
                        originalType,
                        targetClass.prototype,
                        value.propertyName
                    );
                }

                metadataStorage.addValidationMetadata({
                    ...value,
                    target: targetClass,
                });
                return value.propertyName;
            });
    } catch (err) {
        logger.error(
            `Validation ("class-validator") metadata cannot be inherited for "${parentClass.name}" class.`
        );
        logger.error(err);
        Sentry.captureException(err);
    }
}

function inheritPropertyInitializers(
    target: Record<string, any>,
    sourceClass: Type<any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isPropertyInherited = (key: string) => true
) {
    try {
        const tempInstance = new sourceClass();
        const propertyNames = Object.getOwnPropertyNames(tempInstance);

        propertyNames
            .filter(
                propertyName =>
                    typeof tempInstance[propertyName] !== "undefined" &&
                    typeof target[propertyName] === "undefined"
            )
            .filter(propertyName => isPropertyInherited(propertyName))
            .forEach(propertyName => {
                target[propertyName] = tempInstance[propertyName];
            });
    } catch {}
}
function inheritTransformationMetadata(
    parentClass: Type<any>,
    targetClass: Function,
    isPropertyInherited?: (key: string) => boolean
) {
    if (!isClassTransformerAvailable()) {
        return;
    }
    try {
        const transformMetadataKeys: TransformMetadataKey[] = [
            "_excludeMetadatas",
            "_exposeMetadatas",
            "_transformMetadatas",
            "_typeMetadatas",
        ];
        transformMetadataKeys.forEach(key =>
            inheritTransformerMetadata(
                key,
                parentClass,
                targetClass,
                isPropertyInherited
            )
        );
    } catch (err) {
        logger.error(
            `Transformer ("class-transformer") metadata cannot be inherited for "${parentClass.name}" class.`
        );
        logger.error(err);
        Sentry.captureException(err);
    }
}
export function PartialType<T>(classRef: Type<T>): MappedType<Partial<T>> {
    abstract class PartialClassType {
        constructor() {
            inheritPropertyInitializers(this, classRef);
        }
    }

    const propertyKeys = inheritValidationMetadata(classRef, PartialClassType);
    inheritTransformationMetadata(classRef, PartialClassType);

    if (propertyKeys) {
        propertyKeys.forEach(key => {
            applyIsOptionalDecorator(PartialClassType, key);
        });
    }

    Object.defineProperty(PartialClassType, "name", {
        value: `Partial${classRef.name}`,
    });
    return PartialClassType as MappedType<Partial<T>>;
}
export function OmitType<T, K extends keyof T>(
    classRef: Type<T>,
    keys: readonly K[]
): MappedType<Omit<T, (typeof keys)[number]>> {
    const isInheritedPredicate = (propertyKey: string) =>
        !keys.includes(propertyKey as K);
    abstract class OmitClassType {
        constructor() {
            inheritPropertyInitializers(this, classRef, isInheritedPredicate);
        }
    }

    inheritValidationMetadata(classRef, OmitClassType, isInheritedPredicate);
    inheritTransformationMetadata(
        classRef,
        OmitClassType,
        isInheritedPredicate
    );

    return OmitClassType as MappedType<Omit<T, (typeof keys)[number]>>;
}
