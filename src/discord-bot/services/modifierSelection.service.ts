import { randomBytes } from "crypto";
import { getRedisService } from "../../common/services/redis.service";
import logger from "../../common/loggers";

const redis = getRedisService();

const PREFIX = "calc:modsel:";
const TTL_SECONDS = 30 * 60;

export interface ModifierSelectionState {
    userId: string;
    serviceId: string;
    serviceName: string;
    serviceEmoji?: string;
    startLevel?: number;
    endLevel?: number;
    groupName?: string;
    quantity?: number;
    methodId?: string;
    paymentMethodId?: string;
    dbUserId?: number;
    selectedIds: string[];
}

export function createSelectionToken(): string {
    return randomBytes(6).toString("hex");
}

export async function saveSelectionState(
    token: string,
    state: ModifierSelectionState
): Promise<void> {
    try {
        await redis.set(`${PREFIX}${token}`, state, TTL_SECONDS);
    } catch (error) {
        logger.warn(`[ModifierSelection] Could not persist state ${token}:`, error);
    }
}

export async function getSelectionState(
    token: string
): Promise<ModifierSelectionState | null> {
    try {
        return await redis.get<ModifierSelectionState>(`${PREFIX}${token}`);
    } catch (error) {
        logger.warn(`[ModifierSelection] Could not read state ${token}:`, error);
        return null;
    }
}

export async function updateSelectedIds(
    token: string,
    selectedIds: string[]
): Promise<ModifierSelectionState | null> {
    const state = await getSelectionState(token);
    if (!state) {
        return null;
    }

    const updated: ModifierSelectionState = { ...state, selectedIds };
    await saveSelectionState(token, updated);
    return updated;
}
