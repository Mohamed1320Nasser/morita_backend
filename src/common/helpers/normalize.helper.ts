import { getFileLink } from "./file.helper";

export type LanguageObject<U extends string> = {
    [P in U]: {
        original: string;
        textTranslation: {
            text: string;
        }[];
    };
};

type NormalizedLanguageObject<T, U extends string> = Omit<T, U> & {
    [P in U]: string | null;
};

type NormalizedMultiLanguageObject<T, U extends string> = Omit<T, U> & {
    [P in U]: { languageCode: string; text: string | null }[];
};

export function normalizeLanguage<T, U extends string>(
    obj: T | (LanguageObject<U> & T),
    property: U,
    showOriginal: boolean = true
): NormalizedLanguageObject<T, U> {
    const { [property]: title, ...rest } = (obj ?? {}) as LanguageObject<U> & T;
    const newTitle =
        title?.textTranslation.at(0)?.text ??
        (showOriginal ? title?.original : null);
    const mod = {
        ...rest,
        [property]: title ? newTitle : undefined,
    };
    return mod as NormalizedLanguageObject<T, U>;
}

export function normalizeMultiLanguage<T, U extends string>(
    obj: T | (LanguageObject<U> & T),
    property: U,
    showOriginal: boolean = true
): NormalizedMultiLanguageObject<T, U> {
    const { [property]: title, ...rest } = (obj ?? {}) as LanguageObject<U> & T;

    let newTitle = title.textTranslation?.map((x: any) => ({
        text: x.text,
        languageCode: x.languageCode,
    }));

    newTitle.unshift({
        text: title.original,
        languageCode: "any",
    });

    const mod = {
        ...rest,
        [property]: title ? newTitle : undefined,
    };
    return mod as NormalizedMultiLanguageObject<T, U>;
}

export type ImageObject<U extends string> = {
    [P in U]?: {
        title: string;
        folder: string;
    } | null;
};

// type NormalizedImageObject<T, U extends string> = U extends keyof T
//     ? Omit<T, U> & { [P in U]: Omit<Pick<T, U>, "title" | "folder"> & { url: string | null } }
//     : T;
type NormalizedImageObject<T, U extends string> = {
    [P in keyof T]: P extends U
        ?
              | (Omit<NonNullable<T[P]>, "title" | "folder"> & {
                    url: string | null;
                })
              | null
        : T[P];
};

export function normalizeImage<T, U extends string>(
    obj: ImageObject<U> & T,
    property: U
): NormalizedImageObject<T, U> {
    let newImg: string | null = getFileLink(
        obj[property]?.folder,
        obj[property]?.title
    );
    const { [property]: img, ...rest } = obj ?? {};
    const { title, folder, ...restImg } = img ?? {};
    const res = {
        ...rest,
        [property]: {
            ...restImg,
            url: newImg,
        },
    };
    return res as NormalizedImageObject<T, U>;
}

export type ImageArrayObject<U extends string> = {
    [P in U]?: {
        title: string;
        folder: string;
    }[];
};

type NormalizedImageArrayObject<T, U extends string> = {
    [P in keyof T]: P extends U
        ? T[P] extends Array<infer Item>
            ? Array<Omit<Item, "title" | "folder"> & { url: string | null }>
            : T[P]
        : T[P];
};

export function normalizeImageArray<T, U extends string>(
    obj: ImageArrayObject<U> & T,
    property: U
): NormalizedImageArrayObject<T, U> {
    const { [property]: images, ...rest } = obj ?? {};

    let newImages = (images as any[]).map(({ folder, title, ...restImg }) => ({
        ...restImg,
        url: getFileLink(folder, title),
    }));
    const res = {
        ...rest,
        [property]: newImages,
    };
    return res as NormalizedImageArrayObject<T, U>;
}
