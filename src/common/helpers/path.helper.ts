import fg from "fast-glob";
import path from "path";

export function slash(path: string) {
    const isExtendedLengthPath = /^\\\\\?\\/.test(path);

    if (isExtendedLengthPath) {
        return path;
    }

    return path.replace(/\\/g, "/");
}

export async function getFilesByPattern(pattern: string): Promise<string[]> {
    return fg(slash(pattern));
}

export function getDirs(files: string[]) {
    const d = new Set<string>();
    files.forEach(file => {
        const dir = path.dirname(file);
        const ext = path.extname(file);
        d.add(path.normalize(dir + "/*.controller" + ext));
    });
    return Array.from(d.values());
}
