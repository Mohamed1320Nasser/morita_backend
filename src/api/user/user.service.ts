import API from "../../common/config/api.types";
import { cryptPassword } from "../../common/helpers/hashing.helper";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { createUserDto, editProfileDto, getUsersListDto } from "./dtos";
import { PrismaClient, Role, User } from "@prisma/client";
import { countStart } from "../../common/helpers/pagination.helper";
import { normalizeImage } from "../../common/helpers/normalize.helper";
import { BadRequestError } from "routing-controllers";
import getLanguage, { langCode } from "../../common/language/index";
import { lang } from "../../common/helpers/lang.helper";
@Service()
export default class UserService {
    constructor() {}

    async createUser(
        lang: langCode,
        admin: boolean,
        data: createUserDto,
        role: Role,
        profileFile?: API.File,
        client?: Pick<PrismaClient, "user">
    ) {
        const userOld = await (client ?? prisma).user.findFirst({
            select: {
                email: true,
                phone: true,
            },
            where: {
                OR: [
                    {
                        phone: data.phone,
                    },
                    {
                        email: data.email,
                    },
                ],
                deletedAt: null,
            },
        });

        if (userOld) {
            if (data.email && userOld.email == data.email.toLowerCase()) {
                throw new BadRequestError(getLanguage(lang).emailAlreadyExits);
            }

            if (userOld.phone && userOld.phone == data.phone) {
                throw new BadRequestError(
                    getLanguage(lang).phoneNumberAlreadyExits
                );
            }
        }

        let password = await cryptPassword(data.password);

        const fullname = data.fullname.replace(/\s/g, "-").toLowerCase();
        const randomNumber = Math.floor(Math.random() * 900) + 100;
        const username = `${fullname}${randomNumber}`;

        let user = await (client ?? prisma).user.create({
            data: {
                fullname: data.fullname,
                email: data.email,
                phone: data.phone,
                password: password,
                username: username,
                role: role,
                ...(admin
                    ? {
                          emailIsVerified: true,
                          profileId: profileFile?.id,
                      }
                    : {}),
            },
        });
        if (profileFile) {
            this.updateProfile(user.id, profileFile);
        }
        return user;
    }

    async updateProfile(userId: number, profileFile: API.File) {
        const profile = await prisma.file.create({
            data: {
                folder: profileFile.folder,
                format: profileFile.extention,
                title: profileFile.title,
                size: profileFile.size,
                uploadedBy: userId,
            },
        });
        const res = await prisma.user.update({
            data: { profileId: profile.id },
            where: {
                id: userId,
            },
        });
        return profile;
    }

    async getUserByEmailorPhone(emailorPhone: string) {
        const user = await prisma.user.findFirst({
            include: {
                profile: true,
            },
            where: {
                OR: [{ email: emailorPhone }, { phone: emailorPhone }],
                deletedAt: null,
            },
        });
        return user;
    }

    async updateUser(
        userId: number,
        data: Partial<User>,
        client?: Pick<PrismaClient, "user">
    ) {
        const res = await (client ?? prisma).user.update({
            data,
            where: { id: userId },
        });
        return res ? true : false;
    }

    public async getList(lang: langCode, data: getUsersListDto) {
        const where = {
            OR:
                data.search != ""
                    ? [
                          {
                              email: {
                                  contains: data.search,
                              },
                          },
                          {
                              phone: {
                                  contains: data.search,
                              },
                          },
                          {
                              fullname: {
                                  contains: data.search,
                              },
                          },
                      ]
                    : undefined,
            deletedAt: null,
            userRole: data.roleId
                ? {
                      some: {
                          id: data.roleId,
                      },
                  }
                : undefined,
            banned: data.banned ?? undefined,
        };

        const [usersList, bannedCount, activeCount, filterCount] =
            await prisma.$transaction([
                prisma.user.findMany({
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        banned: true,
                        email: true,
                        phone: true,
                        createdAt: true,
                        profile: {
                            select: {
                                title: true,
                                folder: true,
                            },
                        },
                    },
                    take: data.limit,
                    skip: countStart(data.page, data.limit),
                    where: {
                        ...where,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                }),
                prisma.user.count({
                    where: {
                        banned: true,
                        deletedAt: null,
                    },
                }),
                prisma.user.count({
                    where: {
                        banned: false,
                        deletedAt: null,
                    },
                }),
                prisma.user.count({ where }),
            ]);

        const list = usersList.map(user => {
            const { ...restUser } = user;

            const newUser = {
                ...normalizeImage(restUser, "profile"),
            };
            return newUser;
        });

        return {
            list,
            bannedCount,
            activeCount,
            filterCount,
            total: bannedCount + activeCount,
        };
    }

    public async flipUserBan(id: number) {
        const res = await prisma.$transaction(async tx => {
            const user = await tx.user.findFirst({
                select: {
                    banned: true,
                },
                where: {
                    id: id,
                },
            });
            if (!user) {
                return null;
            }

            return await tx.user.update({
                data: {
                    banned: !user.banned,
                },
                where: {
                    id: id,
                },
            });
        });

        return res;
    }

    public async getProfile(lang: langCode, userId: number) {
        const user = await prisma.user.findFirst({
            select: {
                fullname: true,
                username: true,
                phone: true,
                email: true,
                password: true,
                profile: {
                    select: {
                        title: true,
                        folder: true,
                    },
                },
            },
            where: {
                id: userId,
            },
        });

        if (!user) return null;

        const { ...restUser } = user;

        return normalizeImage(user, "profile");
    }

    public async editProfile(
        lang: langCode,
        id: number,
        data: editProfileDto,
        profileFile?: API.File
    ) {
        if (data.phone) {
            const userOld = await prisma.user.findFirst({
                select: {
                    phone: true,
                },
                where: {
                    phone: data.phone,
                },
            });

            if (userOld && userOld.phone == data.phone) {
                throw new BadRequestError(
                    getLanguage(lang).phoneNumberAlreadyExits
                );
            }
        }

        let user = await prisma.user.update({
            data: {
                fullname: data.fullname,
                phone: data.phone,
                profile: profileFile?.id
                    ? { connect: { id: profileFile?.id } }
                    : data.removeProfileImage
                      ? { disconnect: true }
                      : undefined,
            },
            where: {
                id: id,
            },
        });
        if (profileFile) {
            this.updateProfile(user.id, profileFile);
        }

        return user;
    }

    public async getUser(lang: langCode, userId: number) {
        const user = await prisma.user.findFirst({
            select: {
                fullname: true,
                username: true,
                phone: true,
                email: true,
                profile: {
                    select: {
                        title: true,
                        folder: true,
                    },
                },
            },
            where: {
                id: userId,
            },
        });

        if (!user) return null;

        const { ...restUser } = user;

        const newUser = {
            ...normalizeImage(restUser, "profile"),
        };
        return newUser;
    }

    async getProfileWithPermissions(lang: langCode, userId: number) {
        const user = await prisma.user.findFirst({
            where: {
                id: userId,
                deletedAt: null,
            },
            select: {
                id: true,
                fullname: true,
                username: true,
                email: true,
                phone: true,
                role: true,
                emailIsVerified: true,
                banned: true,
                createdAt: true,
                updatedAt: true,
                profile: {
                    select: {
                        title: true,
                        folder: true,
                    },
                },
            },
        });

        if (!user) {
            return null;
        }

        const normalizedUser = normalizeImage(user, "profile");

        return normalizedUser;
    }

    /**
     * Get users with their orders for repeat customer KPI analysis
     * Used by KPI Service for Repeat Customer Rate calculation
     */
    async getUsersWithOrdersForKPI(filter: {
        startDate?: Date;
        endDate?: Date;
        minOrderValue?: number;
        includeAllStatuses?: boolean;
    }) {
        const orderFilter: any = {
            createdAt: filter.startDate || filter.endDate
                ? {
                    ...(filter.startDate && { gte: filter.startDate }),
                    ...(filter.endDate && { lte: filter.endDate })
                  }
                : undefined,
        };

        if (!filter.includeAllStatuses) {
            orderFilter.status = { in: ['COMPLETED', 'AWAITING_CONFIRM'] };
        }

        if (filter.minOrderValue) {
            orderFilter.orderValue = { gte: filter.minOrderValue };
        }

        return await prisma.user.findMany({
            where: {
                customerOrders: {
                    some: orderFilter
                }
            },
            select: {
                id: true,
                username: true,
                discordUsername: true,
                discordDisplayName: true,
                discordId: true,
                createdAt: true,
                customerOrders: {
                    where: orderFilter,
                    select: {
                        id: true,
                        orderValue: true,
                        createdAt: true,
                        status: true
                    },
                    orderBy: { createdAt: 'asc' }
                },
                loyaltyTier: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
    }

    /**
     * Get comprehensive user profile data for admin dashboard
     */
    async getUserProfileData(userId: number) {
        // Fetch user with all basic relations
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                wallet: {
                    include: {
                        transactions: {
                            take: 10,
                            orderBy: { createdAt: 'desc' }
                        }
                    }
                },
                loyaltyTier: true,
                customerOrders: {
                    orderBy: { createdAt: 'desc' }
                },
                workerOrders: {
                    orderBy: { createdAt: 'desc' }
                },
                customerTickets: {
                    orderBy: { createdAt: 'desc' }
                },
                referrals: {
                    include: {
                        referredUser: {
                            select: {
                                id: true,
                                username: true,
                                discordUsername: true,
                                createdAt: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                },
                referredUsers: {
                    include: {
                        referrer: {
                            select: {
                                id: true,
                                username: true,
                                discordUsername: true
                            }
                        }
                    }
                },
                dailyRewardClaims: {
                    orderBy: { claimedAt: 'desc' }
                },
                orderRewardClaims: {
                    orderBy: { claimedAt: 'desc' }
                },
                referralRewardsReceived: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Build comprehensive profile data
        return this.buildProfileResponse(user);
    }

    /**
     * Build structured profile response
     */
    private buildProfileResponse(user: any) {
        // Basic user info
        const userInfo = {
            id: user.id,
            fullname: user.fullname,
            username: user.username,
            email: user.email,
            phone: user.phone,
            discordId: user.discordId,
            discordUsername: user.discordUsername,
            discordDisplayName: user.discordDisplayName,
            role: user.role,
            discordRole: user.discordRole,
            banned: user.banned,
            emailVerified: user.emailIsVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        // Financial summary
        const financial = this.buildFinancialSummary(user);

        // Loyalty & tier info
        const loyalty = this.buildLoyaltySummary(user);

        // Rewards summary
        const rewards = this.buildRewardsSummary(user);

        // Referral data
        const referrals = this.buildReferralsSummary(user);

        // Order statistics
        const orders = this.buildOrdersSummary(user);

        // Ticket statistics
        const tickets = this.buildTicketsSummary(user);

        // Activity data
        const activity = this.buildActivitySummary(user);

        // Charts data
        const charts = this.buildChartsData(user);

        return {
            user: userInfo,
            financial,
            loyalty,
            rewards,
            referrals,
            orders,
            tickets,
            activity,
            charts
        };
    }

    private buildFinancialSummary(user: any) {
        const wallet = user.wallet;
        const transactions = wallet?.transactions || [];

        const totalDeposits = transactions
            .filter((t: any) => ['DEPOSIT', 'EARNING', 'DAILY_REWARD', 'ORDER_REWARD'].includes(t.type))
            .reduce((sum: number, t: any) => sum + parseFloat(t.amount.toString()), 0);

        const totalWithdrawals = transactions
            .filter((t: any) => ['WITHDRAWAL', 'PAYMENT'].includes(t.type))
            .reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount.toString())), 0);

        const totalEarnings = transactions
            .filter((t: any) => ['EARNING', 'COMMISSION'].includes(t.type))
            .reduce((sum: number, t: any) => sum + parseFloat(t.amount.toString()), 0);

        return {
            wallet: wallet ? {
                balance: parseFloat(wallet.balance.toString()),
                pendingBalance: parseFloat(wallet.pendingBalance.toString()),
                walletType: wallet.walletType,
                isActive: wallet.isActive
            } : null,
            totalSpent: parseFloat(user.totalSpent?.toString() || '0'),
            totalDeposits: parseFloat(totalDeposits.toFixed(2)),
            totalWithdrawals: parseFloat(totalWithdrawals.toFixed(2)),
            totalEarnings: parseFloat(totalEarnings.toFixed(2)),
            recentTransactions: transactions.slice(0, 10).map((t: any) => ({
                id: t.id,
                type: t.type,
                amount: parseFloat(t.amount.toString()),
                status: t.status,
                description: t.description,
                createdAt: t.createdAt
            }))
        };
    }

    private buildLoyaltySummary(user: any) {
        const currentTier = user.loyaltyTier;
        const totalSpent = parseFloat(user.totalSpent?.toString() || '0');

        // You'll need to fetch all tiers to calculate next tier
        // For now, returning basic info
        return {
            currentTier: currentTier ? {
                id: currentTier.id,
                name: currentTier.name,
                discount: currentTier.discountPercentage,
                minSpending: parseFloat(currentTier.minSpending?.toString() || '0'),
                maxSpending: currentTier.maxSpending ? parseFloat(currentTier.maxSpending.toString()) : null
            } : null,
            totalSpent,
            progressToNextTier: 0, // Will calculate in next iteration
            nextTier: null // Will fetch in next iteration
        };
    }

    private buildRewardsSummary(user: any) {
        const dailyRewardClaims = user.dailyRewardClaims || [];
        const orderRewardClaims = user.orderRewardClaims || [];
        const referralRewards = user.referralRewardsReceived || [];

        const totalDailyRewards = dailyRewardClaims.reduce(
            (sum: number, claim: any) => sum + parseFloat(claim.amount.toString()),
            0
        );

        const totalOrderRewards = orderRewardClaims.reduce(
            (sum: number, claim: any) => sum + parseFloat(claim.rewardAmount.toString()),
            0
        );

        const totalReferralRewards = referralRewards.reduce(
            (sum: number, reward: any) => sum + parseFloat(reward.amount.toString()),
            0
        );

        const lastDailyClaim = dailyRewardClaims[0];

        return {
            dailyRewards: {
                totalClaimed: dailyRewardClaims.length,
                totalAmount: parseFloat(totalDailyRewards.toFixed(2)),
                lastClaimDate: lastDailyClaim?.claimedAt || null,
                canClaimNow: false, // Will calculate based on cooldown
                recentClaims: dailyRewardClaims.slice(0, 5).map((claim: any) => ({
                    amount: parseFloat(claim.amount.toString()),
                    claimedAt: claim.claimedAt
                }))
            },
            orderRewards: {
                totalClaimed: orderRewardClaims.length,
                totalAmount: parseFloat(totalOrderRewards.toFixed(2)),
                recentRewards: orderRewardClaims.slice(0, 5).map((claim: any) => ({
                    orderId: claim.orderId,
                    orderAmount: parseFloat(claim.orderAmount.toString()),
                    rewardAmount: parseFloat(claim.rewardAmount.toString()),
                    isFirstOrder: claim.isFirstOrder,
                    claimedAt: claim.claimedAt
                }))
            },
            referralRewards: {
                totalEarned: parseFloat(totalReferralRewards.toFixed(2)),
                recentRewards: referralRewards.slice(0, 5).map((reward: any) => ({
                    amount: parseFloat(reward.amount.toString()),
                    type: reward.rewardType,
                    createdAt: reward.createdAt
                }))
            }
        };
    }

    private buildReferralsSummary(user: any) {
        const referrals = user.referrals || [];
        const referredBy = user.referredUsers?.[0];
        const referralRewards = user.referralRewardsReceived || [];

        const activeReferrals = referrals.filter(
            (ref: any) => ref.memberRetentionDays && ref.memberRetentionDays > 7
        );

        const totalRewards = referralRewards.reduce(
            (sum: number, reward: any) => sum + parseFloat(reward.amount.toString()),
            0
        );

        return {
            totalReferrals: referrals.length,
            activeReferrals: activeReferrals.length,
            referralRewardsEarned: parseFloat(totalRewards.toFixed(2)),
            referralCode: user.discordId || null, // Assuming discord ID is used as referral code
            referredBy: referredBy ? {
                id: referredBy.referrer.id,
                username: referredBy.referrer.username,
                discordUsername: referredBy.referrer.discordUsername
            } : null,
            recentReferrals: referrals.slice(0, 10)
                .filter((ref: any) => ref.referredUser != null)
                .map((ref: any) => ({
                    userId: ref.referredUser.id,
                    username: ref.referredUser.username,
                    discordUsername: ref.referredUser.discordUsername,
                    joinedAt: ref.createdAt,
                    rewardGiven: ref.rewardGiven,
                    memberRetentionDays: ref.memberRetentionDays
                }))
        };
    }

    private buildOrdersSummary(user: any) {
        const customerOrders = user.customerOrders || [];
        const workerOrders = user.workerOrders || [];

        // Customer orders stats
        const completedCustomerOrders = customerOrders.filter((o: any) => o.status === 'COMPLETED');
        const inProgressCustomerOrders = customerOrders.filter((o: any) =>
            ['PENDING', 'CLAIMING', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_CONFIRM'].includes(o.status)
        );
        const cancelledCustomerOrders = customerOrders.filter((o: any) =>
            ['CANCELLED', 'REFUNDED'].includes(o.status)
        );

        const totalCustomerValue = customerOrders.reduce(
            (sum: number, o: any) => sum + parseFloat(o.orderValue?.toString() || '0'),
            0
        );

        const avgCustomerValue = customerOrders.length > 0
            ? totalCustomerValue / customerOrders.length
            : 0;

        // Worker orders stats
        const completedWorkerOrders = workerOrders.filter((o: any) => o.status === 'COMPLETED');
        const inProgressWorkerOrders = workerOrders.filter((o: any) =>
            ['ASSIGNED', 'IN_PROGRESS', 'AWAITING_CONFIRM'].includes(o.status)
        );
        const cancelledWorkerOrders = workerOrders.filter((o: any) =>
            ['CANCELLED', 'REFUNDED'].includes(o.status)
        );

        const totalWorkerEarnings = workerOrders.reduce(
            (sum: number, o: any) => sum + parseFloat(o.workerPayout?.toString() || '0'),
            0
        );

        // Calculate avg completion time for completed orders
        const completedWithTimes = completedWorkerOrders.filter(
            (o: any) => o.startedAt && o.completedAt
        );

        const avgCompletionTime = completedWithTimes.length > 0
            ? completedWithTimes.reduce((sum: number, o: any) => {
                const start = new Date(o.startedAt).getTime();
                const end = new Date(o.completedAt).getTime();
                return sum + (end - start) / (1000 * 60); // minutes
            }, 0) / completedWithTimes.length
            : 0;

        const successRate = workerOrders.length > 0
            ? (completedWorkerOrders.length / workerOrders.length) * 100
            : 0;

        // Order status breakdown
        const customerOrdersByStatus: any = {};
        customerOrders.forEach((o: any) => {
            customerOrdersByStatus[o.status] = (customerOrdersByStatus[o.status] || 0) + 1;
        });

        const workerOrdersByStatus: any = {};
        workerOrders.forEach((o: any) => {
            workerOrdersByStatus[o.status] = (workerOrdersByStatus[o.status] || 0) + 1;
        });

        return {
            asCustomer: {
                total: customerOrders.length,
                completed: completedCustomerOrders.length,
                inProgress: inProgressCustomerOrders.length,
                cancelled: cancelledCustomerOrders.length,
                totalValue: parseFloat(totalCustomerValue.toFixed(2)),
                avgOrderValue: parseFloat(avgCustomerValue.toFixed(2)),
                recentOrders: customerOrders.slice(0, 10).map((o: any) => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    status: o.status,
                    orderValue: parseFloat(o.orderValue?.toString() || '0'),
                    createdAt: o.createdAt
                })),
                ordersByStatus: customerOrdersByStatus
            },
            asWorker: {
                total: workerOrders.length,
                completed: completedWorkerOrders.length,
                inProgress: inProgressWorkerOrders.length,
                cancelled: cancelledWorkerOrders.length,
                totalEarnings: parseFloat(totalWorkerEarnings.toFixed(2)),
                avgCompletionTime: parseFloat(avgCompletionTime.toFixed(1)),
                successRate: parseFloat(successRate.toFixed(1)),
                recentOrders: workerOrders.slice(0, 10).map((o: any) => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    status: o.status,
                    orderValue: parseFloat(o.orderValue?.toString() || '0'),
                    workerPayout: parseFloat(o.workerPayout?.toString() || '0'),
                    createdAt: o.createdAt
                })),
                ordersByStatus: workerOrdersByStatus
            }
        };
    }

    private buildTicketsSummary(user: any) {
        const tickets = user.customerTickets || [];

        const openTickets = tickets.filter((t: any) => t.status === 'OPEN');
        const inProgressTickets = tickets.filter((t: any) =>
            ['IN_PROGRESS', 'AWAITING_CONFIRMATION'].includes(t.status)
        );
        const completedTickets = tickets.filter((t: any) => t.status === 'COMPLETED');
        const convertedTickets = tickets.filter((t: any) => t.convertedToOrder);

        const conversionRate = tickets.length > 0
            ? (convertedTickets.length / tickets.length) * 100
            : 0;

        // Ticket type breakdown
        const ticketsByType: any = {};
        tickets.forEach((t: any) => {
            ticketsByType[t.ticketType] = (ticketsByType[t.ticketType] || 0) + 1;
        });

        return {
            total: tickets.length,
            open: openTickets.length,
            inProgress: inProgressTickets.length,
            completed: completedTickets.length,
            convertedToOrders: convertedTickets.length,
            conversionRate: parseFloat(conversionRate.toFixed(1)),
            avgResponseTime: 0, // Will calculate if we add response tracking
            recentTickets: tickets.slice(0, 10).map((t: any) => ({
                id: t.id,
                ticketNumber: t.ticketNumber,
                ticketType: t.ticketType,
                status: t.status,
                convertedToOrder: t.convertedToOrder,
                createdAt: t.createdAt
            })),
            ticketsByType
        };
    }

    private buildActivitySummary(user: any) {
        const customerOrders = user.customerOrders || [];
        const tickets = user.customerTickets || [];

        const firstOrder = customerOrders.length > 0
            ? customerOrders[customerOrders.length - 1]
            : null;

        const lastOrder = customerOrders.length > 0
            ? customerOrders[0]
            : null;

        const lastTicket = tickets.length > 0
            ? tickets[0]
            : null;

        const daysSinceJoin = Math.floor(
            (new Date().getTime() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Determine activity level
        let activityLevel = 'Inactive';
        if (customerOrders.length > 20) activityLevel = 'Very Active';
        else if (customerOrders.length > 10) activityLevel = 'Active';
        else if (customerOrders.length > 3) activityLevel = 'Moderate';

        return {
            firstOrderDate: firstOrder?.createdAt || null,
            lastOrderDate: lastOrder?.createdAt || null,
            lastTicketDate: lastTicket?.createdAt || null,
            lastLoginDate: null, // Would need session tracking
            daysSinceJoin,
            orderFrequency: this.calculateOrderFrequency(customerOrders),
            activityLevel
        };
    }

    private calculateOrderFrequency(orders: any[]): string {
        if (orders.length < 2) return 'N/A';

        const firstOrder = orders[orders.length - 1];
        const lastOrder = orders[0];

        const daysBetween = Math.floor(
            (new Date(lastOrder.createdAt).getTime() - new Date(firstOrder.createdAt).getTime())
            / (1000 * 60 * 60 * 24)
        );

        const avgDaysBetweenOrders = daysBetween / (orders.length - 1);

        if (avgDaysBetweenOrders < 7) return 'Weekly';
        if (avgDaysBetweenOrders < 14) return 'Bi-weekly';
        if (avgDaysBetweenOrders < 30) return 'Monthly';
        return 'Occasional';
    }

    private buildChartsData(user: any) {
        const customerOrders = user.customerOrders || [];
        const transactions = user.wallet?.transactions || [];

        // Spending trend (last 30 days)
        const spendingTrend = this.buildSpendingTrend(customerOrders);

        // Order volume (last 6 months)
        const orderVolume = this.buildOrderVolume(customerOrders);

        // Balance history (last 30 days)
        const balanceHistory = this.buildBalanceHistory(transactions, user.wallet);

        return {
            spendingTrend,
            orderVolume,
            balanceHistory
        };
    }

    private buildSpendingTrend(orders: any[]) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const recentOrders = orders.filter(o =>
            new Date(o.createdAt) >= thirtyDaysAgo && o.status === 'COMPLETED'
        );

        // Group by date
        const spendingByDate: any = {};
        recentOrders.forEach(order => {
            const date = new Date(order.createdAt).toISOString().split('T')[0];
            spendingByDate[date] = (spendingByDate[date] || 0) + parseFloat(order.orderValue?.toString() || '0');
        });

        // Convert to array and fill missing dates
        const result = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateKey = date.toISOString().split('T')[0];
            result.push({
                date: dateKey,
                amount: parseFloat((spendingByDate[dateKey] || 0).toFixed(2))
            });
        }

        return result;
    }

    private buildOrderVolume(orders: any[]) {
        const now = new Date();
        const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

        const recentOrders = orders.filter(o => new Date(o.createdAt) >= sixMonthsAgo);

        // Group by month
        const ordersByMonth: any = {};
        recentOrders.forEach(order => {
            const date = new Date(order.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            ordersByMonth[monthKey] = (ordersByMonth[monthKey] || 0) + 1;
        });

        // Convert to array with month names
        const result = [];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 30 * 24 * 60 * 60 * 1000);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            result.push({
                month: monthNames[date.getMonth()],
                count: ordersByMonth[monthKey] || 0
            });
        }

        return result;
    }

    private buildBalanceHistory(transactions: any[], wallet: any) {
        if (!wallet) return [];

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const recentTransactions = transactions.filter(t =>
            new Date(t.createdAt) >= thirtyDaysAgo
        ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        // Calculate balance at each point
        let runningBalance = parseFloat(wallet.balance.toString());

        // Work backwards from current balance
        for (let i = recentTransactions.length - 1; i >= 0; i--) {
            const amount = parseFloat(recentTransactions[i].amount.toString());
            runningBalance -= amount;
        }

        const result = [];
        recentTransactions.forEach(t => {
            runningBalance += parseFloat(t.amount.toString());
            result.push({
                date: new Date(t.createdAt).toISOString().split('T')[0],
                balance: parseFloat(runningBalance.toFixed(2))
            });
        });

        // Add current balance
        result.push({
            date: now.toISOString().split('T')[0],
            balance: parseFloat(wallet.balance.toString())
        });

        return result;
    }
}
