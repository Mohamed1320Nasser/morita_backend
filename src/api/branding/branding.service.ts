import { Service } from "typedi";
import { NotFoundError, BadRequestError } from "routing-controllers";
import prisma from "../../common/prisma/client";
import { getFileLink } from "../../common/helpers/file.helper";
import API from "../../common/config/api.types";

export const BRANDING_KEYS = ["brand.banner", "brand.thumbnail"] as const;

export type BrandingKey = (typeof BRANDING_KEYS)[number];

@Service()
export default class BrandingService {
    private assertKey(key: string): BrandingKey {
        if (!BRANDING_KEYS.includes(key as BrandingKey)) {
            throw new BadRequestError(
                `Unknown branding key "${key}". Expected one of: ${BRANDING_KEYS.join(", ")}`
            );
        }
        return key as BrandingKey;
    }

    async getAll() {
        const settings = await prisma.brandingSetting.findMany({
            include: { file: true },
        });

        const urls: Record<string, string | null> = {};

        for (const key of BRANDING_KEYS) {
            const setting = settings.find(s => s.key === key);
            urls[key] = setting
                ? getFileLink(setting.file.folder, setting.file.title)
                : null;
        }

        return urls;
    }

    async getDetailed() {
        const settings = await prisma.brandingSetting.findMany({
            include: { file: true },
            orderBy: { key: "asc" },
        });

        return settings.map(setting => ({
            key: setting.key,
            url: getFileLink(setting.file.folder, setting.file.title),
            fileId: setting.fileId,
            updatedAt: setting.updatedAt,
        }));
    }

    async upsert(key: string, file: API.File, updatedBy: number) {
        const brandingKey = this.assertKey(key);

        if (!file?.id) {
            throw new BadRequestError("An image file is required");
        }

        const setting = await prisma.brandingSetting.upsert({
            where: { key: brandingKey },
            create: { key: brandingKey, fileId: file.id, updatedBy },
            update: { fileId: file.id, updatedBy },
            include: { file: true },
        });

        return {
            key: setting.key,
            url: getFileLink(setting.file.folder, setting.file.title),
            fileId: setting.fileId,
            updatedAt: setting.updatedAt,
        };
    }

    async remove(key: string) {
        const brandingKey = this.assertKey(key);

        const setting = await prisma.brandingSetting.findUnique({
            where: { key: brandingKey },
        });

        if (!setting) {
            throw new NotFoundError(`No branding image set for "${brandingKey}"`);
        }

        await prisma.brandingSetting.delete({ where: { key: brandingKey } });

        return { key: brandingKey, url: null };
    }
}
