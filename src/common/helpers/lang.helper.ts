export type lang = "*" | "ar" | "en";

type DynamicType<T extends string> = {
    [K in Exclude<lang, "*"> as `${T}_${K}`]?: boolean;
};

export function getAttributesByLang<T extends string, U extends lang>(
    name: T,
    lang: U
) {
    let attributes: Partial<DynamicType<T>> = {};
    if (lang == "*") {
        attributes = Object.assign(
            attributes,
            ...["ar", "en"].map(l => {
                return { [`${name}_${l}`]: true };
            })
        );
    } else {
        attributes = Object.assign(attributes, { [`${name}_${lang}`]: true });
    }
    return attributes as Partial<DynamicType<T>>;
}
