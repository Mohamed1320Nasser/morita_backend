import path from "path";
import Language from "./prototype.language";
import logger from "../loggers";

let resources: { [p in langCode]?: Language };

export const langs = ["ar", "en"] as const;

export type langCode = (typeof langs)[number];

export async function loadResources() {
    const _resources: { [p in langCode]?: Language } = {};

    for (let index = 0; index < langs.length; index++) {
        const language = langs[index];
        const file = await import(
            path.resolve(__dirname, `./${language}.language.json`)
        )
            .then(x => x.default)
            .catch(() => ({}));
        _resources[language] = Object.assign(new Language(), file) as Language;
    }
    return _resources;
}

(async () => {
    resources = await loadResources();
})();

export default function getLanguage(language: langCode) {
    return resources[language] ?? new Language();
}
