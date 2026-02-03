import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { CreateAccountDto, UpdateAccountDto, GetAccountListDto, GetAccountViewListDto } from "./dtos";
import { NotFoundError } from "routing-controllers";
import { countStart } from "../../common/helpers/pagination.helper";
import API from "../../common/config/api.types";
import { normalizeImage } from "../../common/helpers/normalize.helper";

// Helper to normalize account with nested images using normalizeImage
function normalizeAccountImages(account: any) {
    if (!account) return account;

    return {
        ...account,
        images: account.images?.map((img: any) => {
            // Create object with file property for normalizeImage
            const imgWithFile = {
                id: img.id,
                fileId: img.fileId,
                createdAt: img.createdAt,
                file: img.file,
            };
            // Use normalizeImage on the file property
            return normalizeImage(imgWithFile, "file");
        }) || [],
    };
}

@Service()
export default class AccountService {
    constructor() {}

    async create(data: CreateAccountDto, images: API.File[]) {
        const validImages = images.filter((image) => image.id !== undefined);

        const account = await prisma.account.create({
            data: {
                name: data.name,
                price: data.price,
                quantity: data.quantity || 1,
                source: data.source,
                category: data.category,
                accountData: data.accountData,
                status: data.status || "IN_STOCK",
                images: {
                    create: validImages.map((image) => ({
                        fileId: image.id as number,
                    })),
                },
            },
            include: {
                images: {
                    include: {
                        file: true,
                    },
                },
            },
        });

        return normalizeAccountImages(account);
    }

    async update(id: string, data: UpdateAccountDto, newImages: API.File[] = []) {
        const account = await prisma.account.findFirst({
            where: { id },
        });

        if (!account) {
            throw new NotFoundError("Account not found");
        }

        if (data.deleteImageIds && data.deleteImageIds.length > 0) {
            await prisma.accountImage.deleteMany({
                where: {
                    id: { in: data.deleteImageIds },
                    accountId: id,
                },
            });
        }

        const { deleteImageIds, ...updateData } = data;

        const validNewImages = newImages.filter((image) => image.id !== undefined);

        const updatedAccount = await prisma.account.update({
            where: { id },
            data: {
                ...updateData,
                updatedAt: new Date(),
                // Add new images
                images: validNewImages.length > 0 ? {
                    create: validNewImages.map((image) => ({
                        fileId: image.id as number,
                    })),
                } : undefined,
            },
            include: {
                images: {
                    include: {
                        file: true,
                    },
                },
            },
        });

        return normalizeAccountImages(updatedAccount);
    }

    async getList(query: GetAccountListDto) {
        const { search, category, status, page, limit, sortBy, sortOrder } = query;

        const where: any = {
            ...(category ? { category } : {}),
            ...(status ? { status } : {}),
            ...(search
                ? {
                      OR: [
                          { name: { contains: search } },
                          { source: { contains: search } },
                      ],
                  }
                : {}),
        };

        const [accounts, filterCount, totalCount] = await Promise.all([
            prisma.account.findMany({
                where,
                skip: countStart(page, limit),
                take: limit,
                orderBy: {
                    [sortBy || "createdAt"]: sortOrder || "desc",
                },
                include: {
                    images: {
                        include: {
                            file: true,
                        },
                    },
                    soldTo: {
                        select: {
                            id: true,
                            fullname: true,
                            email: true,
                            discordId: true,
                        },
                    },
                    reservedBy: {
                        select: {
                            id: true,
                            fullname: true,
                            discordId: true,
                        },
                    },
                },
            }),
            prisma.account.count({ where }),
            prisma.account.count(),
        ]);

        return {
            list: accounts.map(normalizeAccountImages),
            total: totalCount,
            filterCount,
        };
    }

    async getSingle(id: string) {
        const account = await prisma.account.findFirst({
            where: { id },
            include: {
                images: {
                    include: {
                        file: true,
                    },
                },
                soldTo: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
                soldBy: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
                reservedBy: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
            },
        });

        if (!account) {
            throw new NotFoundError("Account not found");
        }

        return normalizeAccountImages(account);
    }

    async delete(id: string) {
        const account = await prisma.account.findFirst({
            where: { id },
        });

        if (!account) {
            throw new NotFoundError("Account not found");
        }

        // Delete account (images will cascade delete)
        await prisma.account.delete({
            where: { id },
        });

        return { message: "Account deleted successfully" };
    }

    async getStats() {
        const [totalAccounts, inStockAccounts, soldAccounts, totalValue, inStockValue] = await Promise.all([
            prisma.account.count(),
            prisma.account.count({ where: { status: "IN_STOCK" } }),
            prisma.account.count({ where: { status: "SOLD" } }),
            prisma.account.aggregate({
                _sum: { price: true },
            }),
            prisma.account.aggregate({
                where: { status: "IN_STOCK" },
                _sum: { price: true },
            }),
        ]);

        return {
            totalAccounts,
            inStockAccounts,
            soldAccounts,
            totalValue: totalValue._sum.price || 0,
            inStockValue: inStockValue._sum.price || 0,
        };
    }
    // ==================== Public View Methods ====================

    async getCategoriesWithCounts() {
        const categories = await prisma.account.groupBy({
            by: ['category'],
            where: { status: 'IN_STOCK' },
            _count: { id: true },
        });

        const allCategories = ['MAIN', 'IRONS', 'HCIM', 'ZERK', 'PURE', 'ACCOUNTS'];
        const categoryMap = new Map(categories.map(c => [c.category, c._count.id]));

        return allCategories.map(category => ({
            category,
            availableCount: categoryMap.get(category as any) || 0,
            label: this.getCategoryLabel(category),
            emoji: this.getCategoryEmoji(category),
        }));
    }

    async getViewList(query: GetAccountViewListDto) {
        const { category, page, limit } = query;

        const where: any = {
            status: 'IN_STOCK',
            ...(category ? { category } : {}),
        };

        const [accounts, filterCount, totalCount] = await Promise.all([
            prisma.account.findMany({
                where,
                skip: countStart(page, limit),
                take: limit,
                orderBy: { price: 'asc' },
                include: {
                    images: {
                        take: 1,
                        include: { file: true },
                    },
                },
            }),
            prisma.account.count({ where }),
            prisma.account.count({ where: { status: 'IN_STOCK' } }),
        ]);

        return {
            list: accounts.map(acc => ({
                id: acc.id,
                name: acc.name,
                price: Number(acc.price),
                category: acc.category,
                accountData: acc.accountData,
                thumbnail: acc.images[0] ? normalizeAccountImages({ images: acc.images }).images[0] : null,
                stats: this.extractDisplayStats(acc.accountData),
            })),
            total: totalCount,
            filterCount,
        };
    }

    async getViewDetail(id: string) {
        const account = await prisma.account.findFirst({
            where: { id, status: 'IN_STOCK' },
            include: {
                images: {
                    include: { file: true },
                },
            },
        });

        if (!account) {
            return null;
        }

        return {
            ...normalizeAccountImages(account),
            stats: this.extractDisplayStats(account.accountData),
            features: this.extractFeatures(account.accountData),
        };
    }

    /**
     * Get account details by ID regardless of status
     * Used for ticket display where account may be RESERVED or SOLD
     * Includes reservedBy and soldTo relations for customer info
     */
    async getAccountById(id: string) {
        const account = await prisma.account.findFirst({
            where: { id },
            include: {
                images: {
                    include: { file: true },
                },
                reservedBy: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
                soldTo: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
            },
        });

        if (!account) {
            return null;
        }

        return {
            ...normalizeAccountImages(account),
            stats: this.extractDisplayStats(account.accountData),
            features: this.extractFeatures(account.accountData),
        };
    }

    async reserveAccount(
        accountId: string,
        userId?: number,
        discordUserId?: string,
        expiryMinutes: number = 30
    ) {
        const account = await prisma.account.findFirst({
            where: { id: accountId, status: 'IN_STOCK' },
        });

        if (!account) {
            return { success: false, error: 'Account not available' };
        }

        // Lookup userId from discordId if not provided
        let resolvedUserId = userId;
        if (!resolvedUserId && discordUserId) {
            const user = await prisma.user.findFirst({
                where: { discordId: discordUserId },
            });
            resolvedUserId = user?.id;
        }

        const expiryDate = new Date();
        expiryDate.setMinutes(expiryDate.getMinutes() + expiryMinutes);

        const updated = await prisma.account.update({
            where: { id: accountId },
            data: {
                status: 'RESERVED',
                reservedById: resolvedUserId || null,
                reservedAt: new Date(),
                reservationExpiry: expiryDate,
            },
            include: {
                images: {
                    include: { file: true },
                },
            },
        });

        return { success: true, account: normalizeAccountImages(updated) };
    }

    async releaseAccount(accountId: string) {
        const account = await prisma.account.findFirst({
            where: { id: accountId, status: 'RESERVED' },
        });

        if (!account) {
            return { success: false, error: 'Account not found or not reserved' };
        }

        await prisma.account.update({
            where: { id: accountId },
            data: {
                status: 'IN_STOCK',
                reservedById: null,
                reservedAt: null,
                reservationExpiry: null,
            },
        });

        return { success: true };
    }

    async completeSale(accountId: string, userId: number, orderId?: string, supportDiscordId?: string) {
        const account = await prisma.account.findFirst({
            where: { id: accountId },
        });

        if (!account) {
            return { success: false, error: 'Account not found' };
        }

        // Find support user by discordId if provided
        let supportId: number | null = null;
        if (supportDiscordId) {
            const supportUser = await prisma.user.findUnique({
                where: { discordId: supportDiscordId },
            });
            supportId = supportUser?.id || null;
        }

        await prisma.account.update({
            where: { id: accountId },
            data: {
                status: 'SOLD',
                soldToId: userId,
                soldById: supportId,
                soldAt: new Date(),
                // Clear reservation fields
                reservedById: null,
                reservedAt: null,
                reservationExpiry: null,
            },
        });

        // If orderId provided, link account to order
        if (orderId) {
            await prisma.order.update({
                where: { id: orderId },
                data: { accountId },
            });
        }

        return { success: true };
    }

    async releaseExpiredReservations() {
        const now = new Date();

        const expired = await prisma.account.findMany({
            where: {
                status: 'RESERVED',
                reservationExpiry: { lt: now },
            },
        });

        if (expired.length > 0) {
            await prisma.account.updateMany({
                where: {
                    id: { in: expired.map(a => a.id) },
                },
                data: {
                    status: 'IN_STOCK',
                    reservedById: null,
                    reservedAt: null,
                    reservationExpiry: null,
                },
            });
        }

        return { released: expired.length };
    }

    // ==================== Helper methods ====================

    private getCategoryLabel(category: string): string {
        const labels: Record<string, string> = {
            MAIN: 'Main Accounts',
            IRONS: 'Ironman Accounts',
            HCIM: 'HCIM Accounts',
            ZERK: 'Zerker Accounts',
            PURE: 'Pure Accounts',
            ACCOUNTS: 'Other Accounts',
        };
        return labels[category] || category;
    }

    private getCategoryEmoji(category: string): string {
        const emojis: Record<string, string> = {
            MAIN: '⚔️',
            IRONS: '🔨',
            HCIM: '💀',
            ZERK: '🗡️',
            PURE: '🏹',
            ACCOUNTS: '📦',
        };
        return emojis[category] || '📦';
    }

    private extractDisplayStats(accountData: any): Record<string, any> {
        if (!accountData) return {};

        // Extract common OSRS account stats for quick display
        const stats: Record<string, any> = {};

        if (accountData.combatLevel) stats.combatLevel = accountData.combatLevel;
        if (accountData.totalLevel) stats.totalLevel = accountData.totalLevel;
        if (accountData.attack) stats.attack = accountData.attack;
        if (accountData.strength) stats.strength = accountData.strength;
        if (accountData.defence) stats.defence = accountData.defence;
        if (accountData.ranged) stats.ranged = accountData.ranged;
        if (accountData.magic) stats.magic = accountData.magic;
        if (accountData.prayer) stats.prayer = accountData.prayer;
        if (accountData.hitpoints) stats.hitpoints = accountData.hitpoints;

        return stats;
    }

    private extractFeatures(accountData: any): Array<{ name: string; available: boolean }> {
        if (!accountData) return [];

        const features: Array<{ name: string; available: boolean }> = [];

        // Common OSRS account features
        const featureChecks = [
            { key: 'questCape', name: 'Quest Cape' },
            { key: 'fireCape', name: 'Fire Cape' },
            { key: 'infernalCape', name: 'Infernal Cape' },
            { key: 'achievementDiaryCape', name: 'Achievement Diary Cape' },
            { key: 'maxCape', name: 'Max Cape' },
            { key: 'torsoComplete', name: 'Fighter Torso' },
            { key: 'voidComplete', name: 'Full Void' },
            { key: 'dragonSlayer2', name: 'Dragon Slayer 2' },
            { key: 'songOfTheElves', name: 'Song of the Elves' },
        ];

        for (const check of featureChecks) {
            if (accountData[check.key] !== undefined) {
                features.push({
                    name: check.name,
                    available: Boolean(accountData[check.key]),
                });
            }
        }

        return features;
    }
}
