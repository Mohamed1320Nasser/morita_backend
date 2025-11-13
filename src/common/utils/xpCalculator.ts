/**
 * OSRS XP Calculator Utility
 * Uses official OSRS XP table from database
 */

import prisma from '../prisma/client';

// In-memory cache for XP table (loaded once on first use)
let xpTableCache: Map<number, bigint> | null = null;

/**
 * Load XP table from database and cache it
 */
async function loadXpTable(): Promise<Map<number, bigint>> {
    if (xpTableCache) {
        return xpTableCache;
    }

    const xpData = await prisma.experienceTable.findMany({
        orderBy: { level: 'asc' }
    });

    xpTableCache = new Map();
    for (const row of xpData) {
        xpTableCache.set(row.level, row.experience);
    }

    return xpTableCache;
}

/**
 * Get total XP required for a specific level from database
 */
export async function getXpForLevel(level: number): Promise<number> {
    if (level <= 1) return 0;
    if (level > 99) return await getXpForLevel(99);

    const table = await loadXpTable();
    const xp = table.get(level);

    if (xp === undefined) {
        throw new Error(`XP data not found for level ${level}`);
    }

    return Number(xp);
}

/**
 * Calculate XP difference between two levels using database
 */
export function getXpBetweenLevels(startLevel: number, endLevel: number): number {
    if (startLevel >= endLevel) return 0;
    if (startLevel < 1) startLevel = 1;
    if (endLevel > 99) endLevel = 99;

    // Use raw SQL for synchronous operation (needed by existing code)
    // This matches the official OSRS XP table
    const xpTable: Record<number, number> = {
        1: 0, 2: 83, 3: 174, 4: 276, 5: 388, 6: 512, 7: 650, 8: 801, 9: 969, 10: 1154,
        11: 1358, 12: 1584, 13: 1833, 14: 2107, 15: 2411, 16: 2746, 17: 3115, 18: 3523, 19: 3973, 20: 4470,
        21: 5018, 22: 5624, 23: 6291, 24: 7028, 25: 7842, 26: 8740, 27: 9730, 28: 10824, 29: 12031, 30: 13363,
        31: 14833, 32: 16456, 33: 18247, 34: 20224, 35: 22406, 36: 24815, 37: 27473, 38: 30408, 39: 33648, 40: 37224,
        41: 41171, 42: 45529, 43: 50339, 44: 55649, 45: 61512, 46: 67983, 47: 75127, 48: 83014, 49: 91721, 50: 101333,
        51: 111945, 52: 123660, 53: 136594, 54: 150872, 55: 166636, 56: 184040, 57: 203254, 58: 224466, 59: 247886, 60: 273742,
        61: 302288, 62: 333804, 63: 368599, 64: 407015, 65: 449428, 66: 496254, 67: 547953, 68: 605032, 69: 668051, 70: 737627,
        71: 814445, 72: 899257, 73: 992895, 74: 1096278, 75: 1210421, 76: 1336443, 77: 1475581, 78: 1629200, 79: 1798808, 80: 1986068,
        81: 2192818, 82: 2421087, 83: 2673114, 84: 2951373, 85: 3258594, 86: 3597792, 87: 3972294, 88: 4385776, 89: 4842295, 90: 5346332,
        91: 5902831, 92: 6517253, 93: 7195629, 94: 7944614, 95: 8771558, 96: 9684577, 97: 10692629, 98: 11805606, 99: 13034431
    };

    return xpTable[endLevel] - xpTable[startLevel];
}

/**
 * Format XP number with commas for readability
 */
export function formatXp(xp: number): string {
    return xp.toLocaleString('en-US');
}

/**
 * Calculate level from XP using database
 */
export async function getLevelFromXp(xp: number): Promise<number> {
    const table = await loadXpTable();

    let level = 1;
    for (const [lvl, requiredXp] of table.entries()) {
        if (Number(requiredXp) <= xp) {
            level = lvl;
        } else {
            break;
        }
    }

    return level;
}
