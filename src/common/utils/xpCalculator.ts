/**
 * OSRS XP Calculator Utility
 * Calculates XP required for levels using OSRS formula
 */

/**
 * Calculate total XP required for a specific level (OSRS formula)
 */
export function getXpForLevel(level: number): number {
    if (level <= 1) return 0;
    if (level > 99) return getXpForLevel(99);

    let totalXp = 0;
    for (let i = 1; i < level; i++) {
        totalXp += Math.floor(i + 300 * Math.pow(2, i / 7));
    }
    return Math.floor(totalXp / 4);
}

/**
 * Calculate XP difference between two levels
 */
export function getXpBetweenLevels(startLevel: number, endLevel: number): number {
    if (startLevel >= endLevel) return 0;
    if (startLevel < 1) startLevel = 1;
    if (endLevel > 99) endLevel = 99;

    return getXpForLevel(endLevel) - getXpForLevel(startLevel);
}

/**
 * Format XP number with commas for readability
 */
export function formatXp(xp: number): string {
    return xp.toLocaleString('en-US');
}

/**
 * Calculate level from XP
 */
export function getLevelFromXp(xp: number): number {
    let level = 1;
    while (level < 99 && getXpForLevel(level + 1) <= xp) {
        level++;
    }
    return level;
}

/**
 * Pre-calculated XP table for common levels (for faster lookups)
 */
export const XP_TABLE: Record<number, number> = {};
for (let i = 1; i <= 99; i++) {
    XP_TABLE[i] = getXpForLevel(i);
}
