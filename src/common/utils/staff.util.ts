import prisma from "../prisma/client";

/**
 * Staff (admins, support, workers) and the company's own system accounts are
 * not customers: they are left out of customer leaderboards and analytics and
 * never earn customer rewards (daily gifts, referral rewards, loyalty tiers).
 */
export const STAFF_DISCORD_ROLES = ["admin", "support", "worker"] as const;
export const STAFF_SYSTEM_ROLES = ["admin", "system"] as const;

export function isStaffUser(user: { discordRole?: string | null; role?: string | null } | null | undefined): boolean {
    if (!user) return false;
    return (
        (!!user.discordRole && (STAFF_DISCORD_ROLES as readonly string[]).includes(user.discordRole)) ||
        (!!user.role && (STAFF_SYSTEM_ROLES as readonly string[]).includes(user.role))
    );
}

/** Prisma user filter matching staff accounts */
export const staffUserWhere = {
    OR: [
        { discordRole: { in: [...STAFF_DISCORD_ROLES] } },
        { role: { in: [...STAFF_SYSTEM_ROLES] } },
    ],
};

/**
 * Prisma user filter matching everyone else. discordRole is nullable, and
 * NOT IN never matches NULL in SQL, so members without one are listed
 * explicitly or they would vanish too.
 */
export const nonStaffUserWhere = {
    AND: [
        { OR: [{ discordRole: null }, { discordRole: { notIn: [...STAFF_DISCORD_ROLES] } }] },
        { role: { notIn: [...STAFF_SYSTEM_ROLES] } },
    ],
};

export async function getStaffDiscordIds(): Promise<string[]> {
    const staff = await prisma.user.findMany({
        where: { ...staffUserWhere, discordId: { not: null } },
        select: { discordId: true },
    });
    return staff.map((u) => u.discordId as string);
}
