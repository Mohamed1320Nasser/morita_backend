import { discordApiClient } from "../clients/DiscordApiClient";
import { getRedisService } from "../../common/services/redis.service";
import { unwrapApiData } from "../utils/apiResponse.util";
import logger from "../../common/loggers";

export interface Branding {
    banner: string;
    thumbnail: string;
}

const CACHE_KEY = "discord:branding";
const CACHE_TTL = 5 * 60;
const REFRESH_INTERVAL = 5 * 60 * 1000;

const redis = getRedisService();

let snapshot: Branding = envFallback();
let refreshTimer: NodeJS.Timeout | null = null;

function envFallback(): Branding {
    return {
        banner: (process.env.CALC_BANNER_URL || "").trim(),
        thumbnail: (
            process.env.CALC_THUMBNAIL_URL ||
            process.env.BRAND_LOGO_URL ||
            ""
        ).trim(),
    };
}

function toBranding(data: any): Branding {
    const fallback = envFallback();
    return {
        banner: (data?.["brand.banner"] || fallback.banner || "").trim(),
        thumbnail: (data?.["brand.thumbnail"] || fallback.thumbnail || "").trim(),
    };
}

export function getBranding(): Branding {
    return snapshot;
}

export function getBrandBanner(): string {
    return snapshot.banner;
}

export function getBrandThumbnail(): string {
    return snapshot.thumbnail;
}

export function getBrandIcon(fallback?: string): string | undefined {
    return snapshot.thumbnail || fallback || undefined;
}

export async function refreshBranding(): Promise<Branding> {
    try {
        const cached = await redis.get<Record<string, string | null>>(CACHE_KEY);
        if (cached) {
            snapshot = toBranding(cached);
            return snapshot;
        }
    } catch (error) {
        logger.warn("[Branding] Cache read failed:", error);
    }

    try {
        const response: any = await discordApiClient.get("/discord/branding");
        const data = unwrapApiData<Record<string, string | null>>(response);

        snapshot = toBranding(data);

        try {
            await redis.set(CACHE_KEY, data, CACHE_TTL);
        } catch (error) {
            logger.warn("[Branding] Cache write failed:", error);
        }

        logger.info(
            `[Branding] Loaded (banner: ${snapshot.banner ? "set" : "none"}, thumbnail: ${snapshot.thumbnail ? "set" : "none"})`
        );
    } catch (error) {
        logger.warn("[Branding] Fetch failed, keeping current values:", error);
    }

    return snapshot;
}

export async function initBranding(): Promise<void> {
    await refreshBranding();

    if (!refreshTimer) {
        refreshTimer = setInterval(() => {
            refreshBranding().catch(error =>
                logger.warn("[Branding] Background refresh failed:", error)
            );
        }, REFRESH_INTERVAL);

        refreshTimer.unref?.();
    }
}
