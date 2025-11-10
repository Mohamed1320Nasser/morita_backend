import { getFileLink } from "./file.helper";

export const filterObject = (obj: any) => {
    if (!isEmptyObject(obj)) {
        Object.keys(obj).forEach(
            key => obj[key] === undefined && delete obj[key]
        );

        return obj;
    }
};

export const isEmptyObject = (obj: Record<string, any>): boolean => {
    for (const key in obj) {
        if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
            return false;
        }
    }

    return true;
};

export const filterList = (list: Array<any>) => {
    return list.filter(item => {
        if (typeof item === "object" && item !== null)
            return filterObject(item);
        else {
            if (item !== undefined || item !== null) return item;
        }
    });
};

export const object2string = (params: any) =>
    Object.keys(params)
        .map(
            key =>
                key +
                "=" +
                (String(params[key]).startsWith("\\")
                    ? String(params[key]).substring(1)
                    : `'${params[key]}'`)
        )
        .join(",");

export function flattenObject(obj: any) {
    let toReturn: any = {};
    for (let i in obj) {
        if (!obj.hasOwnProperty(i)) continue;

        if (typeof obj[i] == "object" && obj[i] !== null) {
            let flatObject = flattenObject(obj[i]);
            for (let x in flatObject) {
                if (!flatObject.hasOwnProperty(x)) continue;

                toReturn[i + "." + x] = flatObject[x];
            }
        } else {
            toReturn[i] = obj[i];
        }
    }
    return toReturn;
}
