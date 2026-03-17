import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { RecordMemberActivityDto, RepeatCustomerQueryDto, RepeatCustomerResponse, SupportResponseQueryDto, SupportResponseResponse, TicketConversionQueryDto, TicketConversionResponse } from "./dtos";
import logger from "../../common/loggers";
import UserService from "../user/user.service";
import TicketService from "../ticket/ticket.service";
import OrderService from "../order/order.service";
import DiscordChannelsService from "../discord/discord.channels.service";
import { OrderStatus } from "../order/dtos/common.dto";

@Service()
export default class KpiService {
    constructor(
        private userService: UserService,
        private ticketService: TicketService,
        private orderService: OrderService,
        private discordChannelsService: DiscordChannelsService
    ) {}
    async recordMemberActivity(data: RecordMemberActivityDto) {
        try {
            const tenSecondsAgo = new Date(Date.now() - 10000);
            const existing = await prisma.memberActivity.findFirst({
                where: {
                    discordId: data.discordId,
                    eventType: data.eventType,
                    timestamp: { gte: tenSecondsAgo }
                }
            });

            if (existing) {
                logger.debug(`[KPI] Duplicate activity ignored: ${data.username} - ${data.eventType} (already recorded ${Date.now() - existing.timestamp.getTime()}ms ago)`);
                return existing;
            }

            const activity = await prisma.memberActivity.create({
                data: {
                    discordId: data.discordId,
                    username: data.username,
                    displayName: data.displayName,
                    eventType: data.eventType,
                    reason: data.reason,
                    timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
                }
            });

            logger.info(`[KPI] Member activity recorded: ${data.username} - ${data.eventType}`);

            return activity;
        } catch (error) {
            logger.error("[KPI] Failed to record member activity:", error);
            throw error;
        }
    }

    async getMemberGrowth(period: string = 'monthly', startDate?: Date, endDate?: Date) {
        const now = new Date();
        let gte: Date;
        let lte: Date = endDate || now;

        if (startDate) {
            gte = startDate;
        } else {
            switch (period) {
                case 'daily':
                    gte = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case 'weekly':
                    gte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'monthly':
                    gte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case 'quarterly':
                    gte = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                    break;
                case 'yearly':
                    gte = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    gte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            }
        }

        // Get all activities in the period
        const activities = await prisma.memberActivity.findMany({
            where: {
                timestamp: { gte, lte }
            },
            orderBy: { timestamp: 'asc' }
        });

        // Count by event type
        const joins = activities.filter(a => a.eventType === 'JOIN').length;
        const leaves = activities.filter(a => a.eventType === 'LEAVE').length;
        const kicks = activities.filter(a => a.eventType === 'KICK').length;
        const bans = activities.filter(a => a.eventType === 'BAN').length;

        const totalLeaves = leaves + kicks + bans;
        const netGrowth = joins - totalLeaves;

        // Get total current members (users with discordId)
        const totalMembers = await prisma.user.count({
            where: { discordId: { not: null } }
        });

        // Calculate growth rate
        const previousTotal = totalMembers - netGrowth;
        const growthRate = previousTotal > 0 ? (netGrowth / previousTotal) * 100 : 0;

        // Calculate churn rate (leaves as % of total members)
        const churnRate = totalMembers > 0 ? (totalLeaves / totalMembers) * 100 : 0;

        // Group activities by date for time-series
        const dailyData = this.groupActivitiesByDate(activities);

        // Leave reasons breakdown
        const leaveReasons = activities
            .filter(a => ['KICK', 'BAN'].includes(a.eventType) && a.reason)
            .map(a => ({
                eventType: a.eventType,
                reason: a.reason,
                username: a.username,
                timestamp: a.timestamp
            }));

        return {
            summary: {
                period,
                startDate: gte,
                endDate: lte,
                totalMembers,
                joins,
                leaves,
                kicks,
                bans,
                totalLeaves,
                netGrowth,
                growthRate: parseFloat(growthRate.toFixed(2)),
                churnRate: parseFloat(churnRate.toFixed(2))
            },
            breakdown: {
                joins: {
                    count: joins,
                    percentage: joins > 0 ? ((joins / (joins + totalLeaves)) * 100).toFixed(2) : 0
                },
                voluntaryLeaves: {
                    count: leaves,
                    percentage: totalLeaves > 0 ? ((leaves / totalLeaves) * 100).toFixed(2) : 0
                },
                kicks: {
                    count: kicks,
                    percentage: totalLeaves > 0 ? ((kicks / totalLeaves) * 100).toFixed(2) : 0
                },
                bans: {
                    count: bans,
                    percentage: totalLeaves > 0 ? ((bans / totalLeaves) * 100).toFixed(2) : 0
                }
            },
            dailyData,
            leaveReasons
        };
    }

    // Helper method to group activities by date
    private groupActivitiesByDate(activities: any[]) {
        const grouped: { [key: string]: { joins: number; leaves: number; kicks: number; bans: number } } = {};

        activities.forEach(activity => {
            const dateKey = activity.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD

            if (!grouped[dateKey]) {
                grouped[dateKey] = { joins: 0, leaves: 0, kicks: 0, bans: 0 };
            }

            switch (activity.eventType) {
                case 'JOIN':
                    grouped[dateKey].joins++;
                    break;
                case 'LEAVE':
                    grouped[dateKey].leaves++;
                    break;
                case 'KICK':
                    grouped[dateKey].kicks++;
                    break;
                case 'BAN':
                    grouped[dateKey].bans++;
                    break;
            }
        });

        // Convert to array and sort by date
        return Object.entries(grouped)
            .map(([date, counts]) => ({
                date,
                ...counts,
                netGrowth: counts.joins - (counts.leaves + counts.kicks + counts.bans)
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    // ============================================
    // MEMBER RETENTION ANALYSIS
    // ============================================

    async getMemberRetention(cohortDate: Date) {
        // Get all members who joined on cohortDate
        const cohortJoins = await prisma.memberActivity.findMany({
            where: {
                eventType: 'JOIN',
                timestamp: {
                    gte: new Date(cohortDate.setHours(0, 0, 0, 0)),
                    lte: new Date(cohortDate.setHours(23, 59, 59, 999))
                }
            }
        });

        // Check how many of them left
        const cohortDiscordIds = cohortJoins.map(j => j.discordId);

        const cohortLeaves = await prisma.memberActivity.findMany({
            where: {
                eventType: { in: ['LEAVE', 'KICK', 'BAN'] },
                discordId: { in: cohortDiscordIds }
            }
        });

        const leftDiscordIds = new Set(cohortLeaves.map(l => l.discordId));
        const stillActive = cohortJoins.filter(j => !leftDiscordIds.has(j.discordId));

        const retentionRate = cohortJoins.length > 0
            ? (stillActive.length / cohortJoins.length) * 100
            : 0;

        return {
            cohortDate: cohortDate.toISOString().split('T')[0],
            totalJoined: cohortJoins.length,
            stillActive: stillActive.length,
            left: cohortLeaves.length,
            retentionRate: parseFloat(retentionRate.toFixed(2)),
            members: stillActive.map(m => ({
                discordId: m.discordId,
                username: m.username,
                joinedAt: m.timestamp
            }))
        };
    }

    // ============================================
    // REPEAT CUSTOMER RATE KPI
    // ============================================

    async getRepeatCustomerRate(query: RepeatCustomerQueryDto): Promise<RepeatCustomerResponse> {
        try {
            const { period, startDate, endDate, minOrderValue, includeAllStatuses } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            const customers = await this.userService.getUsersWithOrdersForKPI({
                startDate: gte,
                endDate: lte,
                minOrderValue,
                includeAllStatuses
            });

            const customersWithOrders = customers.filter(c => c.customerOrders.length > 0);

            const summary = this.calculateRepeatCustomerSummary(customersWithOrders, period || 'all', gte, lte);
            const distribution = this.calculateOrderDistribution(customersWithOrders);
            const topCustomers = this.getTopCustomers(customersWithOrders, 20);
            const cohortAnalysis = await this.getCohortRetention({ startDate: gte, endDate: lte, minOrderValue, includeAllStatuses });
            const timeAnalysis = this.calculateTimeMetrics(customersWithOrders);

            return {
                summary,
                distribution,
                topCustomers,
                cohortAnalysis,
                timeAnalysis
            };

        } catch (error) {
            logger.error("[KPI] Failed to calculate repeat customer rate:", error);
            throw error;
        }
    }

    // ============================================
    // PRIVATE HELPER METHODS FOR REPEAT CUSTOMERS
    // ============================================

    private calculateRepeatCustomerSummary(customers: any[], period: string, gte: Date | undefined, lte: Date | undefined) {
        const totalCustomers = customers.length;
        const repeatCustomers = customers.filter(c => c.customerOrders.length > 1);
        const oneTimeCustomers = totalCustomers - repeatCustomers.length;

        const totalOrders = customers.reduce((sum, c) => sum + c.customerOrders.length, 0);
        const totalRevenue = customers.reduce((sum, c) =>
            sum + c.customerOrders.reduce((orderSum: number, o: any) =>
                orderSum + parseFloat(o.orderValue.toString()), 0
            ), 0
        );

        const repeatCustomerRevenue = repeatCustomers.reduce((sum, c) =>
            sum + c.customerOrders.reduce((orderSum: number, o: any) =>
                orderSum + parseFloat(o.orderValue.toString()), 0
            ), 0
        );

        return {
            period,
            startDate: gte || null,
            endDate: lte || null,
            totalCustomers,
            oneTimeCustomers,
            repeatCustomers: repeatCustomers.length,
            repeatCustomerRate: totalCustomers > 0
                ? parseFloat(((repeatCustomers.length / totalCustomers) * 100).toFixed(2))
                : 0,
            averageOrdersPerCustomer: totalCustomers > 0
                ? parseFloat((totalOrders / totalCustomers).toFixed(2))
                : 0,
            averageCustomerLifetimeValue: totalCustomers > 0
                ? parseFloat((totalRevenue / totalCustomers).toFixed(2))
                : 0,
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            repeatCustomerRevenue: parseFloat(repeatCustomerRevenue.toFixed(2)),
            repeatCustomerRevenuePercentage: totalRevenue > 0
                ? parseFloat(((repeatCustomerRevenue / totalRevenue) * 100).toFixed(2))
                : 0
        };
    }

    private calculateOrderDistribution(customers: any[]) {
        const oneOrder = customers.filter(c => c.customerOrders.length === 1).length;
        const twoOrders = customers.filter(c => c.customerOrders.length === 2).length;
        const threeToFive = customers.filter(c => c.customerOrders.length >= 3 && c.customerOrders.length <= 5).length;
        const sixToTen = customers.filter(c => c.customerOrders.length >= 6 && c.customerOrders.length <= 10).length;
        const elevenPlus = customers.filter(c => c.customerOrders.length >= 11).length;

        const total = customers.length || 1; // Avoid division by zero

        return {
            oneOrder: {
                count: oneOrder,
                percentage: parseFloat(((oneOrder / total) * 100).toFixed(2))
            },
            twoOrders: {
                count: twoOrders,
                percentage: parseFloat(((twoOrders / total) * 100).toFixed(2))
            },
            threeToFive: {
                count: threeToFive,
                percentage: parseFloat(((threeToFive / total) * 100).toFixed(2))
            },
            sixToTen: {
                count: sixToTen,
                percentage: parseFloat(((sixToTen / total) * 100).toFixed(2))
            },
            elevenPlus: {
                count: elevenPlus,
                percentage: parseFloat(((elevenPlus / total) * 100).toFixed(2))
            }
        };
    }

    private getTopCustomers(customers: any[], limit: number = 20) {
        return customers
            .map(customer => {
                const orders = customer.customerOrders;
                const totalSpent = orders.reduce((sum: number, o: any) => sum + parseFloat(o.orderValue.toString()), 0);
                const firstOrder = orders[0];
                const lastOrder = orders[orders.length - 1];
                const daysSinceLastOrder = Math.floor(
                    (Date.now() - new Date(lastOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24)
                );

                return {
                    userId: customer.id,
                    username: customer.username || customer.fullname,
                    discordUsername: customer.discordUsername,
                    discordDisplayName: customer.discordDisplayName,
                    orderCount: orders.length,
                    totalSpent: parseFloat(totalSpent.toFixed(2)),
                    averageOrderValue: parseFloat((totalSpent / orders.length).toFixed(2)),
                    firstOrderDate: firstOrder.createdAt,
                    lastOrderDate: lastOrder.createdAt,
                    daysSinceLastOrder,
                    loyaltyTier: customer.loyaltyTier
                        ? `${customer.loyaltyTier.emoji} ${customer.loyaltyTier.name}`
                        : null
                };
            })
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, limit);
    }

    private async getCohortRetention(filter: { startDate?: Date; endDate?: Date; minOrderValue?: number; includeAllStatuses?: boolean }) {
        const customers = await this.userService.getUsersWithOrdersForKPI(filter);

        // Group by cohort month
        const cohortMap = new Map<string, { total: number; repeat: number }>();

        customers.forEach(customer => {
            if (customer.customerOrders.length === 0) return;

            const cohortMonth = customer.customerOrders[0].createdAt
                .toISOString()
                .substring(0, 7); // "2025-01"

            if (!cohortMap.has(cohortMonth)) {
                cohortMap.set(cohortMonth, { total: 0, repeat: 0 });
            }

            const cohort = cohortMap.get(cohortMonth)!;
            cohort.total++;
            if (customer.customerOrders.length > 1) {
                cohort.repeat++;
            }
        });

        return Array.from(cohortMap.entries())
            .map(([month, data]) => ({
                cohortMonth: month,
                customersAcquired: data.total,
                repeatCustomers: data.repeat,
                retentionRate: data.total > 0
                    ? parseFloat(((data.repeat / data.total) * 100).toFixed(2))
                    : 0
            }))
            .sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));
    }

    private calculateTimeMetrics(customers: any[]) {
        const repeatCustomers = customers.filter(c => c.customerOrders.length > 1);

        if (repeatCustomers.length === 0) {
            return {
                averageDaysBetweenOrders: 0,
                medianDaysBetweenOrders: 0,
                repeatPurchaseVelocity: "N/A"
            };
        }

        // Calculate days between each consecutive order
        const daysBetweenOrders: number[] = [];

        repeatCustomers.forEach(customer => {
            const orders = customer.customerOrders;
            for (let i = 1; i < orders.length; i++) {
                const daysDiff = Math.floor(
                    (new Date(orders[i].createdAt).getTime() -
                     new Date(orders[i - 1].createdAt).getTime()) /
                    (1000 * 60 * 60 * 24)
                );
                daysBetweenOrders.push(daysDiff);
            }
        });

        const avgDays = daysBetweenOrders.reduce((sum, d) => sum + d, 0) / daysBetweenOrders.length;
        const sortedDays = daysBetweenOrders.sort((a, b) => a - b);
        const medianDays = sortedDays[Math.floor(sortedDays.length / 2)] || 0;

        let velocity = "Medium";
        if (avgDays < 30) velocity = "Fast";
        else if (avgDays > 90) velocity = "Slow";

        return {
            averageDaysBetweenOrders: parseFloat(avgDays.toFixed(1)),
            medianDaysBetweenOrders: medianDays,
            repeatPurchaseVelocity: velocity
        };
    }

    private calculateDateRange(period?: string, startDate?: string, endDate?: string) {
        const now = new Date();
        let gte: Date | undefined;
        let lte: Date | undefined = endDate ? new Date(endDate) : undefined;

        if (startDate) {
            gte = new Date(startDate);
        } else if (period) {
            switch (period) {
                case 'yearly':
                    gte = new Date(now.getFullYear(), 0, 1);
                    break;
                case 'quarterly':
                    const currentQuarter = Math.floor(now.getMonth() / 3);
                    gte = new Date(now.getFullYear(), currentQuarter * 3, 1);
                    break;
                case 'monthly':
                    gte = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                default: // 'all'
                    gte = undefined;
            }
        }

        return { gte, lte };
    }

    async getSupportResponseTime(query: SupportResponseQueryDto): Promise<SupportResponseResponse> {
        try {
            const { period, startDate, endDate, ticketType, supportUserId, slaTargetMinutes } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            const tickets = await this.ticketService.getTicketsWithFirstResponseForKPI({
                startDate: gte,
                endDate: lte,
                ticketType,
                supportUserId
            });

            const ticketsWithResponse = tickets
                .filter(t => t.messages.length > 0)
                .map(ticket => {
                    const firstMessage = ticket.messages[0];
                    const responseTimeMs = firstMessage.createdAt.getTime() - ticket.createdAt.getTime();
                    const responseTimeMinutes = responseTimeMs / (1000 * 60);

                    return {
                        ticketId: ticket.id,
                        ticketNumber: ticket.ticketNumber,
                        ticketType: ticket.ticketType,
                        ticketCreatedAt: ticket.createdAt,
                        firstResponseAt: firstMessage.createdAt,
                        responseTimeMinutes,
                        respondedBySupportId: firstMessage.author.id,
                        respondedBySupportName: firstMessage.author.username || firstMessage.author.fullname,
                        respondedBySupportDiscordUsername: firstMessage.author.discordUsername,
                        withinSLA: responseTimeMinutes <= (slaTargetMinutes || 15)
                    };
                });

            const ticketsWithoutResponse = tickets
                .filter(t => t.messages.length === 0)
                .map(ticket => ({
                    ticketId: ticket.id,
                    ticketNumber: ticket.ticketNumber,
                    ticketType: ticket.ticketType,
                    ticketCreatedAt: ticket.createdAt,
                    firstResponseAt: null,
                    responseTimeMinutes: null,
                    respondedBySupportId: null,
                    respondedBySupportName: null,
                    withinSLA: false
                }));

            // Calculate summary metrics
            const summary = this.calculateSupportResponseSummary(
                ticketsWithResponse,
                ticketsWithoutResponse,
                period || 'monthly',
                gte,
                lte,
                slaTargetMinutes || 15
            );

            // Calculate distribution
            const distribution = this.calculateResponseTimeDistribution(ticketsWithResponse);

            // Get slowest responses (top 10)
            const slowestResponses = [...ticketsWithResponse]
                .sort((a, b) => (b.responseTimeMinutes || 0) - (a.responseTimeMinutes || 0))
                .slice(0, 10);

            // Calculate support agent performance
            const supportAgentPerformance = this.calculateSupportAgentPerformance(
                ticketsWithResponse,
                slaTargetMinutes || 15
            );

            // Calculate response time by ticket type
            const responseByTicketType = this.calculateResponseByTicketType(
                ticketsWithResponse,
                slaTargetMinutes || 15
            );

            // Calculate response time by day of week
            const responseByDay = this.calculateResponseByDay(ticketsWithResponse);

            return {
                summary,
                distribution,
                ticketsWithoutResponse: ticketsWithoutResponse.slice(0, 20), // Limit to 20
                slowestResponses,
                supportAgentPerformance,
                responseByTicketType,
                responseByDay
            };

        } catch (error) {
            logger.error("[KPI] Failed to calculate support response time:", error);
            throw error;
        }
    }

    // ============================================
    // PRIVATE HELPER METHODS FOR SUPPORT RESPONSE
    // ============================================

    private calculateSupportResponseSummary(
        ticketsWithResponse: any[],
        ticketsWithoutResponse: any[],
        period: string,
        gte: Date | undefined,
        lte: Date | undefined,
        slaTargetMinutes: number
    ) {
        const totalTickets = ticketsWithResponse.length + ticketsWithoutResponse.length;
        const responseTimes = ticketsWithResponse.map(t => t.responseTimeMinutes);

        // Calculate average
        const averageResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
            : 0;

        // Calculate median
        const sortedTimes = [...responseTimes].sort((a, b) => a - b);
        const medianResponseTime = sortedTimes.length > 0
            ? sortedTimes[Math.floor(sortedTimes.length / 2)]
            : 0;

        // Calculate SLA compliance
        const ticketsWithinSLA = ticketsWithResponse.filter(t => t.withinSLA).length;
        const slaComplianceRate = ticketsWithResponse.length > 0
            ? (ticketsWithinSLA / ticketsWithResponse.length) * 100
            : 0;

        // Fastest and slowest
        const fastestResponse = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
        const slowestResponse = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

        return {
            period,
            startDate: gte || null,
            endDate: lte || null,
            totalTickets,
            ticketsWithResponse: ticketsWithResponse.length,
            ticketsWithoutResponse: ticketsWithoutResponse.length,
            averageResponseTimeMinutes: parseFloat(averageResponseTime.toFixed(2)),
            medianResponseTimeMinutes: parseFloat(medianResponseTime.toFixed(2)),
            slaTargetMinutes,
            slaComplianceRate: parseFloat(slaComplianceRate.toFixed(2)),
            fastestResponseMinutes: parseFloat(fastestResponse.toFixed(2)),
            slowestResponseMinutes: parseFloat(slowestResponse.toFixed(2))
        };
    }

    private calculateResponseTimeDistribution(tickets: any[]) {
        const total = tickets.length || 1;

        const under5 = tickets.filter(t => t.responseTimeMinutes < 5).length;
        const min5to15 = tickets.filter(t => t.responseTimeMinutes >= 5 && t.responseTimeMinutes < 15).length;
        const min15to30 = tickets.filter(t => t.responseTimeMinutes >= 15 && t.responseTimeMinutes < 30).length;
        const min30to60 = tickets.filter(t => t.responseTimeMinutes >= 30 && t.responseTimeMinutes < 60).length;
        const over1hour = tickets.filter(t => t.responseTimeMinutes >= 60 && t.responseTimeMinutes < 240).length;
        const over4hours = tickets.filter(t => t.responseTimeMinutes >= 240).length;

        return {
            under5min: {
                count: under5,
                percentage: parseFloat(((under5 / total) * 100).toFixed(2))
            },
            min5to15: {
                count: min5to15,
                percentage: parseFloat(((min5to15 / total) * 100).toFixed(2))
            },
            min15to30: {
                count: min15to30,
                percentage: parseFloat(((min15to30 / total) * 100).toFixed(2))
            },
            min30to60: {
                count: min30to60,
                percentage: parseFloat(((min30to60 / total) * 100).toFixed(2))
            },
            over1hour: {
                count: over1hour,
                percentage: parseFloat(((over1hour / total) * 100).toFixed(2))
            },
            over4hours: {
                count: over4hours,
                percentage: parseFloat(((over4hours / total) * 100).toFixed(2))
            }
        };
    }

    private calculateSupportAgentPerformance(tickets: any[], slaTargetMinutes: number) {
        // Group tickets by support agent
        const agentMap = new Map<number, any[]>();

        tickets.forEach(ticket => {
            const agentId = ticket.respondedBySupportId;
            if (!agentMap.has(agentId)) {
                agentMap.set(agentId, []);
            }
            agentMap.get(agentId)!.push(ticket);
        });

        // Calculate metrics for each agent
        return Array.from(agentMap.entries()).map(([agentId, agentTickets]) => {
            const responseTimes = agentTickets.map(t => t.responseTimeMinutes);
            const sortedTimes = [...responseTimes].sort((a, b) => a - b);

            const avgTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
            const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
            const withinSLA = agentTickets.filter(t => t.withinSLA).length;
            const slaRate = (withinSLA / agentTickets.length) * 100;

            return {
                supportUserId: agentId,
                supportName: agentTickets[0].respondedBySupportName,
                discordUsername: agentTickets[0].respondedBySupportDiscordUsername,
                ticketsResponded: agentTickets.length,
                averageResponseTimeMinutes: parseFloat(avgTime.toFixed(2)),
                medianResponseTimeMinutes: parseFloat(medianTime.toFixed(2)),
                slaComplianceRate: parseFloat(slaRate.toFixed(2)),
                fastestResponseMinutes: parseFloat(Math.min(...responseTimes).toFixed(2)),
                slowestResponseMinutes: parseFloat(Math.max(...responseTimes).toFixed(2))
            };
        }).sort((a, b) => a.averageResponseTimeMinutes - b.averageResponseTimeMinutes);
    }

    private calculateResponseByTicketType(tickets: any[], slaTargetMinutes: number) {
        // Group by ticket type
        const typeMap = new Map<string, any[]>();

        tickets.forEach(ticket => {
            if (!typeMap.has(ticket.ticketType)) {
                typeMap.set(ticket.ticketType, []);
            }
            typeMap.get(ticket.ticketType)!.push(ticket);
        });

        return Array.from(typeMap.entries()).map(([type, typeTickets]) => {
            const responseTimes = typeTickets.map(t => t.responseTimeMinutes);
            const sortedTimes = [...responseTimes].sort((a, b) => a - b);

            const avgTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
            const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
            const withinSLA = typeTickets.filter(t => t.withinSLA).length;
            const slaRate = (withinSLA / typeTickets.length) * 100;

            return {
                ticketType: type,
                ticketCount: typeTickets.length,
                averageResponseTimeMinutes: parseFloat(avgTime.toFixed(2)),
                medianResponseTimeMinutes: parseFloat(medianTime.toFixed(2)),
                slaComplianceRate: parseFloat(slaRate.toFixed(2))
            };
        }).sort((a, b) => b.ticketCount - a.ticketCount);
    }

    private calculateResponseByDay(tickets: any[]) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayMap = new Map<number, any[]>();

        tickets.forEach(ticket => {
            const day = ticket.ticketCreatedAt.getDay();
            if (!dayMap.has(day)) {
                dayMap.set(day, []);
            }
            dayMap.get(day)!.push(ticket);
        });

        return Array.from(dayMap.entries()).map(([day, dayTickets]) => {
            const responseTimes = dayTickets.map(t => t.responseTimeMinutes);
            const avgTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;

            return {
                dayOfWeek: dayNames[day],
                ticketCount: dayTickets.length,
                averageResponseTimeMinutes: parseFloat(avgTime.toFixed(2))
            };
        }).sort((a, b) => dayNames.indexOf(a.dayOfWeek) - dayNames.indexOf(b.dayOfWeek));
    }

    async getTicketToOrderConversion(query: TicketConversionQueryDto): Promise<TicketConversionResponse> {
        try {
            const { period, startDate, endDate, ticketType } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            const tickets = await this.ticketService.getTicketsWithOrdersForKPI({
                startDate: gte,
                endDate: lte,
                ticketType
            });

            const ticketsWithOrders = tickets.filter(t => t.orders.length > 0);
            const ticketsWithoutOrders = tickets.filter(t => t.orders.length === 0);

            const conversions = ticketsWithOrders.map(ticket => {
                const order = ticket.orders[0];
                const conversionTimeMs = order.createdAt.getTime() - ticket.createdAt.getTime();
                const conversionTimeMinutes = conversionTimeMs / (1000 * 60);

                return {
                    ticketId: ticket.id,
                    ticketNumber: ticket.ticketNumber,
                    ticketType: ticket.ticketType,
                    ticketCreatedAt: ticket.createdAt,
                    orderId: order.id,
                    orderCreatedAt: order.createdAt,
                    conversionTimeMinutes,
                    serviceName: order.service?.name || null
                };
            });

            const summary = this.calculateConversionSummary(tickets.length, conversions, period || 'monthly', gte, lte);
            const distribution = this.calculateConversionDistribution(conversions);
            const conversionByTicketType = this.calculateConversionByTicketType(tickets);
            const conversionByService = this.calculateConversionByService(conversions);

            const fastest = [...conversions].sort((a, b) => a.conversionTimeMinutes - b.conversionTimeMinutes).slice(0, 10);
            const slowest = [...conversions].sort((a, b) => b.conversionTimeMinutes - a.conversionTimeMinutes).slice(0, 10);

            const unconverted = ticketsWithoutOrders.slice(0, 20).map(t => ({
                ticketId: t.id,
                ticketNumber: t.ticketNumber,
                ticketType: t.ticketType,
                createdAt: t.createdAt
            }));

            return {
                summary,
                distribution,
                conversionByTicketType,
                conversionByService,
                fastestConversions: fastest,
                slowestConversions: slowest,
                unconvertedTickets: unconverted
            };

        } catch (error) {
            logger.error("[KPI] Failed to calculate ticket-to-order conversion:", error);
            throw error;
        }
    }

    private calculateConversionSummary(totalTickets: number, conversions: any[], period: string, gte: Date | undefined, lte: Date | undefined) {
        const ticketsWithOrders = conversions.length;
        const ticketsWithoutOrders = totalTickets - ticketsWithOrders;
        const conversionRate = totalTickets > 0 ? (ticketsWithOrders / totalTickets) * 100 : 0;

        const conversionTimes = conversions.map(c => c.conversionTimeMinutes).sort((a, b) => a - b);
        const averageConversionMinutes = conversionTimes.length > 0
            ? conversionTimes.reduce((sum, t) => sum + t, 0) / conversionTimes.length
            : 0;

        const medianConversionMinutes = conversionTimes.length > 0
            ? conversionTimes[Math.floor(conversionTimes.length / 2)]
            : 0;

        const fastestConversionMinutes = conversionTimes.length > 0 ? conversionTimes[0] : 0;
        const slowestConversionMinutes = conversionTimes.length > 0 ? conversionTimes[conversionTimes.length - 1] : 0;

        return {
            period,
            startDate: gte || null,
            endDate: lte || null,
            totalTickets,
            ticketsWithOrders,
            ticketsWithoutOrders,
            conversionRate: parseFloat(conversionRate.toFixed(2)),
            averageConversionMinutes: parseFloat(averageConversionMinutes.toFixed(2)),
            medianConversionMinutes: parseFloat(medianConversionMinutes.toFixed(2)),
            fastestConversionMinutes: parseFloat(fastestConversionMinutes.toFixed(2)),
            slowestConversionMinutes: parseFloat(slowestConversionMinutes.toFixed(2))
        };
    }

    private calculateConversionDistribution(conversions: any[]) {
        const under5min = conversions.filter(c => c.conversionTimeMinutes < 5);
        const min5to15 = conversions.filter(c => c.conversionTimeMinutes >= 5 && c.conversionTimeMinutes < 15);
        const min15to30 = conversions.filter(c => c.conversionTimeMinutes >= 15 && c.conversionTimeMinutes < 30);
        const min30to60 = conversions.filter(c => c.conversionTimeMinutes >= 30 && c.conversionTimeMinutes < 60);
        const over1hour = conversions.filter(c => c.conversionTimeMinutes >= 60 && c.conversionTimeMinutes < 1440);
        const over1day = conversions.filter(c => c.conversionTimeMinutes >= 1440);

        const total = conversions.length || 1;

        return {
            under5min: { count: under5min.length, percentage: parseFloat(((under5min.length / total) * 100).toFixed(1)) },
            min5to15: { count: min5to15.length, percentage: parseFloat(((min5to15.length / total) * 100).toFixed(1)) },
            min15to30: { count: min15to30.length, percentage: parseFloat(((min15to30.length / total) * 100).toFixed(1)) },
            min30to60: { count: min30to60.length, percentage: parseFloat(((min30to60.length / total) * 100).toFixed(1)) },
            over1hour: { count: over1hour.length, percentage: parseFloat(((over1hour.length / total) * 100).toFixed(1)) },
            over1day: { count: over1day.length, percentage: parseFloat(((over1day.length / total) * 100).toFixed(1)) }
        };
    }

    private calculateConversionByTicketType(tickets: any[]) {
        const typeMap = new Map<string, { total: number; converted: number; times: number[] }>();

        tickets.forEach(ticket => {
            if (!typeMap.has(ticket.ticketType)) {
                typeMap.set(ticket.ticketType, { total: 0, converted: 0, times: [] });
            }

            const typeData = typeMap.get(ticket.ticketType)!;
            typeData.total++;

            if (ticket.orders.length > 0) {
                typeData.converted++;
                const conversionTimeMs = ticket.orders[0].createdAt.getTime() - ticket.createdAt.getTime();
                typeData.times.push(conversionTimeMs / (1000 * 60));
            }
        });

        return Array.from(typeMap.entries()).map(([ticketType, data]) => {
            const sortedTimes = data.times.sort((a, b) => a - b);
            const avgTime = data.times.length > 0 ? data.times.reduce((sum, t) => sum + t, 0) / data.times.length : 0;
            const medianTime = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length / 2)] : 0;

            return {
                ticketType,
                ticketCount: data.total,
                conversionRate: parseFloat(((data.converted / data.total) * 100).toFixed(2)),
                avgConversionMinutes: parseFloat(avgTime.toFixed(2)),
                medianConversionMinutes: parseFloat(medianTime.toFixed(2))
            };
        }).sort((a, b) => b.ticketCount - a.ticketCount);
    }

    private calculateConversionByService(conversions: any[]) {
        const serviceMap = new Map<string, { name: string; times: number[] }>();

        conversions.forEach(conversion => {
            if (!conversion.serviceName) return;

            const serviceId = conversion.orderId;
            if (!serviceMap.has(conversion.serviceName)) {
                serviceMap.set(conversion.serviceName, { name: conversion.serviceName, times: [] });
            }

            serviceMap.get(conversion.serviceName)!.times.push(conversion.conversionTimeMinutes);
        });

        return Array.from(serviceMap.entries()).map(([serviceName, data]) => {
            const avgTime = data.times.reduce((sum, t) => sum + t, 0) / data.times.length;

            return {
                serviceId: serviceName,
                serviceName,
                orderCount: data.times.length,
                avgConversionMinutes: parseFloat(avgTime.toFixed(2))
            };
        }).sort((a, b) => b.orderCount - a.orderCount);
    }

    async getPeakTicketTimes(query: any): Promise<any> {
        try {
            const { period, startDate, endDate, ticketType } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            const tickets = await this.ticketService.getTicketsForPeakTimesKPI({
                startDate: gte,
                endDate: lte,
                ticketType
            });

            const hourlyDistribution = this.calculateHourlyDistribution(tickets);
            const dailyDistribution = this.calculateDailyDistribution(tickets);
            const peakTimesByType = this.calculatePeakTimesByType(tickets);
            const summary = this.calculatePeakTimesSummary(
                tickets.length,
                hourlyDistribution,
                dailyDistribution,
                period || 'monthly',
                gte,
                lte
            );

            return {
                summary,
                hourlyDistribution,
                dailyDistribution,
                peakTimesByType
            };

        } catch (error) {
            logger.error("[KPI] Failed to calculate peak ticket times:", error);
            throw error;
        }
    }

    private calculateHourlyDistribution(tickets: any[]) {
        const hourCounts = new Array(24).fill(0);

        tickets.forEach(ticket => {
            const hour = ticket.createdAt.getHours();
            hourCounts[hour]++;
        });

        const total = tickets.length || 1;

        return hourCounts.map((count, hour) => ({
            hour,
            count,
            percentage: parseFloat(((count / total) * 100).toFixed(1))
        }));
    }

    private calculateDailyDistribution(tickets: any[]) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayCounts = new Array(7).fill(0);

        tickets.forEach(ticket => {
            const dayOfWeek = ticket.createdAt.getDay();
            dayCounts[dayOfWeek]++;
        });

        const total = tickets.length || 1;

        return dayCounts.map((count, dayOfWeek) => ({
            dayOfWeek,
            dayName: dayNames[dayOfWeek],
            count,
            percentage: parseFloat(((count / total) * 100).toFixed(1))
        }));
    }

    private calculatePeakTimesByType(tickets: any[]) {
        const typeMap = new Map<string, { hours: number[]; days: number[] }>();

        tickets.forEach(ticket => {
            if (!typeMap.has(ticket.ticketType)) {
                typeMap.set(ticket.ticketType, { hours: [], days: [] });
            }

            const typeData = typeMap.get(ticket.ticketType)!;
            typeData.hours.push(ticket.createdAt.getHours());
            typeData.days.push(ticket.createdAt.getDay());
        });

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        return Array.from(typeMap.entries()).map(([ticketType, data]) => {
            const hourCounts = new Array(24).fill(0);
            data.hours.forEach(h => hourCounts[h]++);
            const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

            const dayCounts = new Array(7).fill(0);
            data.days.forEach(d => dayCounts[d]++);
            const peakDayIndex = dayCounts.indexOf(Math.max(...dayCounts));

            return {
                ticketType,
                peakHour,
                peakDay: dayNames[peakDayIndex],
                count: data.hours.length
            };
        }).sort((a, b) => b.count - a.count);
    }

    private calculatePeakTimesSummary(
        totalTickets: number,
        hourlyDistribution: any[],
        dailyDistribution: any[],
        period: string,
        gte: Date | undefined,
        lte: Date | undefined
    ) {
        const peakHourData = [...hourlyDistribution].sort((a, b) => b.count - a.count)[0];
        const lowestHourData = [...hourlyDistribution].sort((a, b) => a.count - b.count)[0];
        const peakDayData = [...dailyDistribution].sort((a, b) => b.count - a.count)[0];
        const quietestDayData = [...dailyDistribution].sort((a, b) => a.count - b.count)[0];

        return {
            period,
            startDate: gte || null,
            endDate: lte || null,
            totalTickets,
            peakHour: peakHourData.hour,
            peakHourCount: peakHourData.count,
            lowestHour: lowestHourData.hour,
            lowestHourCount: lowestHourData.count,
            peakDay: peakDayData.dayName,
            peakDayCount: peakDayData.count,
            quietestDay: quietestDayData.dayName,
            quietestDayCount: quietestDayData.count
        };
    }

    async getSupportReplySpeed(query: any): Promise<any> {
        try {
            const { period, startDate, endDate, ticketType } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            const messages = await this.ticketService.getTicketMessagesForReplySpeedKPI({
                startDate: gte,
                endDate: lte,
                ticketType
            });

            const replies = this.calculateReplies(messages);
            const summary = this.calculateReplySpeedSummary(messages, replies, period || 'monthly', gte, lte);
            const distribution = this.calculateReplySpeedDistribution(replies);
            const replySpeedByTicketType = this.calculateReplySpeedByTicketType(messages, replies);
            const replySpeedByAgent = this.calculateReplySpeedByAgent(replies);
            const slowestReplies = this.calculateSlowestReplies(replies);

            return {
                summary,
                distribution,
                replySpeedByTicketType,
                replySpeedByAgent,
                slowestReplies
            };

        } catch (error) {
            logger.error("[KPI] Failed to calculate support reply speed:", error);
            throw error;
        }
    }

    private calculateReplies(messages: any[]) {
        const replies: any[] = [];
        const ticketGroups = new Map<string, any[]>();

        messages.forEach(msg => {
            if (!ticketGroups.has(msg.ticketId)) {
                ticketGroups.set(msg.ticketId, []);
            }
            ticketGroups.get(msg.ticketId)!.push(msg);
        });

        ticketGroups.forEach((msgs, ticketId) => {
            for (let i = 0; i < msgs.length - 1; i++) {
                const current = msgs[i];
                const isCustomerMessage = current.author.discordRole === 'customer';

                if (isCustomerMessage) {
                    const nextReply = msgs.slice(i + 1).find(m => m.author.discordRole !== 'customer');

                    if (nextReply) {
                        const replyTimeMs = nextReply.createdAt.getTime() - current.createdAt.getTime();
                        const replyTimeMinutes = replyTimeMs / (1000 * 60);

                        replies.push({
                            ticketId,
                            ticketNumber: current.ticket.ticketNumber,
                            ticketType: current.ticket.ticketType,
                            customerMessage: current.content,
                            supportReply: nextReply.content,
                            replyTimeMinutes,
                            agentId: nextReply.author.id,
                            agentName: nextReply.author.fullname,
                            createdAt: nextReply.createdAt
                        });
                    }
                }
            }
        });

        return replies;
    }

    private calculateReplySpeedSummary(messages: any[], replies: any[], period: string, gte: Date | undefined, lte: Date | undefined) {
        const customerMessages = messages.filter(m => m.author.discordRole === 'customer');
        const supportReplies = messages.filter(m => m.author.discordRole !== 'customer');
        const messagesWithoutReply = customerMessages.length - replies.length;

        const replyTimes = replies.map(r => r.replyTimeMinutes).sort((a, b) => a - b);
        const averageReplyMinutes = replyTimes.length > 0
            ? replyTimes.reduce((sum, t) => sum + t, 0) / replyTimes.length
            : 0;

        const medianReplyMinutes = replyTimes.length > 0
            ? replyTimes[Math.floor(replyTimes.length / 2)]
            : 0;

        const fastestReplyMinutes = replyTimes.length > 0 ? replyTimes[0] : 0;
        const slowestReplyMinutes = replyTimes.length > 0 ? replyTimes[replyTimes.length - 1] : 0;

        return {
            period,
            startDate: gte || null,
            endDate: lte || null,
            totalCustomerMessages: customerMessages.length,
            totalSupportReplies: supportReplies.length,
            messagesWithoutReply,
            averageReplyMinutes: parseFloat(averageReplyMinutes.toFixed(2)),
            medianReplyMinutes: parseFloat(medianReplyMinutes.toFixed(2)),
            fastestReplyMinutes: parseFloat(fastestReplyMinutes.toFixed(2)),
            slowestReplyMinutes: parseFloat(slowestReplyMinutes.toFixed(2))
        };
    }

    private calculateReplySpeedDistribution(replies: any[]) {
        const under5min = replies.filter(r => r.replyTimeMinutes < 5);
        const min5to15 = replies.filter(r => r.replyTimeMinutes >= 5 && r.replyTimeMinutes < 15);
        const min15to30 = replies.filter(r => r.replyTimeMinutes >= 15 && r.replyTimeMinutes < 30);
        const min30to60 = replies.filter(r => r.replyTimeMinutes >= 30 && r.replyTimeMinutes < 60);
        const hour1to6 = replies.filter(r => r.replyTimeMinutes >= 60 && r.replyTimeMinutes < 360);
        const over6hours = replies.filter(r => r.replyTimeMinutes >= 360);

        const total = replies.length || 1;

        return {
            under5min: { count: under5min.length, percentage: parseFloat(((under5min.length / total) * 100).toFixed(1)) },
            min5to15: { count: min5to15.length, percentage: parseFloat(((min5to15.length / total) * 100).toFixed(1)) },
            min15to30: { count: min15to30.length, percentage: parseFloat(((min15to30.length / total) * 100).toFixed(1)) },
            min30to60: { count: min30to60.length, percentage: parseFloat(((min30to60.length / total) * 100).toFixed(1)) },
            hour1to6: { count: hour1to6.length, percentage: parseFloat(((hour1to6.length / total) * 100).toFixed(1)) },
            over6hours: { count: over6hours.length, percentage: parseFloat(((over6hours.length / total) * 100).toFixed(1)) }
        };
    }

    private calculateReplySpeedByTicketType(messages: any[], replies: any[]) {
        const typeMap = new Map<string, number[]>();

        replies.forEach(reply => {
            if (!typeMap.has(reply.ticketType)) {
                typeMap.set(reply.ticketType, []);
            }
            typeMap.get(reply.ticketType)!.push(reply.replyTimeMinutes);
        });

        return Array.from(typeMap.entries()).map(([ticketType, times]) => {
            const avgReplyMinutes = times.reduce((sum, t) => sum + t, 0) / times.length;
            return {
                ticketType,
                avgReplyMinutes: parseFloat(avgReplyMinutes.toFixed(2)),
                replyCount: times.length
            };
        }).sort((a, b) => b.replyCount - a.replyCount);
    }

    private calculateReplySpeedByAgent(replies: any[]) {
        const agentMap = new Map<number, { name: string; times: number[] }>();

        replies.forEach(reply => {
            if (!agentMap.has(reply.agentId)) {
                agentMap.set(reply.agentId, { name: reply.agentName, times: [] });
            }
            agentMap.get(reply.agentId)!.times.push(reply.replyTimeMinutes);
        });

        return Array.from(agentMap.entries()).map(([agentId, data]) => {
            const avgReplyMinutes = data.times.reduce((sum, t) => sum + t, 0) / data.times.length;
            return {
                agentId: agentId.toString(),
                agentName: data.name,
                avgReplyMinutes: parseFloat(avgReplyMinutes.toFixed(2)),
                totalReplies: data.times.length
            };
        }).sort((a, b) => b.totalReplies - a.totalReplies);
    }

    private calculateSlowestReplies(replies: any[]) {
        return [...replies]
            .sort((a, b) => b.replyTimeMinutes - a.replyTimeMinutes)
            .slice(0, 10)
            .map(r => ({
                ticketId: r.ticketId,
                ticketNumber: r.ticketNumber,
                customerMessage: r.customerMessage.substring(0, 100),
                supportReply: r.supportReply.substring(0, 100),
                replyTimeMinutes: parseFloat(r.replyTimeMinutes.toFixed(2)),
                agentName: r.agentName,
                createdAt: r.createdAt
            }));
    }

    async getOrderIssues(query: any): Promise<any> {
        try {
            const { period, startDate, endDate, status, priority } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            const issues = await this.orderService.getOrderIssuesForKPI({
                startDate: gte,
                endDate: lte,
                status,
                priority
            });

            const totalOrders = await prisma.order.count({
                where: {
                    createdAt: gte || lte
                        ? {
                            ...(gte && { gte }),
                            ...(lte && { lte })
                          }
                        : undefined
                }
            });

            const summary = this.calculateOrderIssuesSummary(issues, totalOrders, period || 'monthly', gte, lte);
            const statusDistribution = this.calculateIssueStatusDistribution(issues);
            const priorityDistribution = this.calculateIssuePriorityDistribution(issues);
            const issuesByService = this.calculateIssuesByService(issues);
            const resolutionPerformance = this.calculateIssueResolutionPerformance(issues);
            const unresolvedIssues = this.calculateUnresolvedIssues(issues);

            return {
                summary,
                statusDistribution,
                priorityDistribution,
                issuesByService,
                resolutionPerformance,
                unresolvedIssues
            };

        } catch (error) {
            logger.error("[KPI] Failed to calculate order issues:", error);
            throw error;
        }
    }

    private calculateOrderIssuesSummary(issues: any[], totalOrders: number, period: string, gte: Date | undefined, lte: Date | undefined) {
        const openIssues = issues.filter(i => i.status === 'OPEN' || i.status === 'IN_REVIEW').length;
        const resolvedIssues = issues.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED').length;

        const resolutionTimes = issues
            .filter(i => i.resolvedAt)
            .map(i => {
                const timeMs = new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime();
                return timeMs / (1000 * 60);
            })
            .sort((a, b) => a - b);

        const averageResolutionMinutes = resolutionTimes.length > 0
            ? resolutionTimes.reduce((sum, t) => sum + t, 0) / resolutionTimes.length
            : 0;

        const medianResolutionMinutes = resolutionTimes.length > 0
            ? resolutionTimes[Math.floor(resolutionTimes.length / 2)]
            : 0;

        const issueRate = totalOrders > 0 ? (issues.length / totalOrders) * 100 : 0;

        return {
            period,
            startDate: gte || null,
            endDate: lte || null,
            totalIssues: issues.length,
            openIssues,
            resolvedIssues,
            averageResolutionMinutes: parseFloat(averageResolutionMinutes.toFixed(2)),
            medianResolutionMinutes: parseFloat(medianResolutionMinutes.toFixed(2)),
            issueRate: parseFloat(issueRate.toFixed(2))
        };
    }

    private calculateIssueStatusDistribution(issues: any[]) {
        const statusMap = new Map<string, number>();

        issues.forEach(issue => {
            const count = statusMap.get(issue.status) || 0;
            statusMap.set(issue.status, count + 1);
        });

        const total = issues.length || 1;

        return Array.from(statusMap.entries()).map(([status, count]) => ({
            status,
            count,
            percentage: parseFloat(((count / total) * 100).toFixed(1))
        })).sort((a, b) => b.count - a.count);
    }

    private calculateIssuePriorityDistribution(issues: any[]) {
        const priorityMap = new Map<string, number>();

        issues.forEach(issue => {
            const count = priorityMap.get(issue.priority) || 0;
            priorityMap.set(issue.priority, count + 1);
        });

        const total = issues.length || 1;

        return Array.from(priorityMap.entries()).map(([priority, count]) => ({
            priority,
            count,
            percentage: parseFloat(((count / total) * 100).toFixed(1))
        })).sort((a, b) => b.count - a.count);
    }

    private calculateIssuesByService(issues: any[]) {
        const serviceMap = new Map<string, { name: string; issues: number; orders: Set<string> }>();

        issues.forEach(issue => {
            const serviceId = issue.order.serviceId;
            const serviceName = issue.order.service?.name || 'Unknown';

            if (!serviceMap.has(serviceId)) {
                serviceMap.set(serviceId, {
                    name: serviceName,
                    issues: 0,
                    orders: new Set()
                });
            }

            const serviceData = serviceMap.get(serviceId)!;
            serviceData.issues++;
            serviceData.orders.add(issue.orderId);
        });

        return Array.from(serviceMap.entries()).map(([serviceId, data]) => {
            const issueRate = data.orders.size > 0 ? (data.issues / data.orders.size) * 100 : 0;
            return {
                serviceId,
                serviceName: data.name,
                issueCount: data.issues,
                issueRate: parseFloat(issueRate.toFixed(2))
            };
        }).sort((a, b) => b.issueCount - a.issueCount);
    }

    private calculateIssueResolutionPerformance(issues: any[]) {
        const resolverMap = new Map<number, { name: string; times: number[] }>();

        issues.forEach(issue => {
            if (issue.resolvedAt && issue.resolvedBy) {
                const resolverId = issue.resolvedBy.id;
                const resolverName = issue.resolvedBy.fullname;

                if (!resolverMap.has(resolverId)) {
                    resolverMap.set(resolverId, { name: resolverName, times: [] });
                }

                const timeMs = new Date(issue.resolvedAt).getTime() - new Date(issue.createdAt).getTime();
                const timeMinutes = timeMs / (1000 * 60);
                resolverMap.get(resolverId)!.times.push(timeMinutes);
            }
        });

        return Array.from(resolverMap.entries()).map(([resolverId, data]) => {
            const avgResolutionMinutes = data.times.reduce((sum, t) => sum + t, 0) / data.times.length;
            return {
                resolverName: data.name,
                resolvedCount: data.times.length,
                avgResolutionMinutes: parseFloat(avgResolutionMinutes.toFixed(2))
            };
        }).sort((a, b) => b.resolvedCount - a.resolvedCount);
    }

    private calculateUnresolvedIssues(issues: any[]) {
        return issues
            .filter(i => i.status === 'OPEN' || i.status === 'IN_REVIEW')
            .slice(0, 20)
            .map(i => {
                const ageMs = Date.now() - new Date(i.createdAt).getTime();
                const ageInDays = ageMs / (1000 * 60 * 60 * 24);

                return {
                    issueId: i.id,
                    orderId: i.order.orderNumber,
                    priority: i.priority,
                    issueDescription: i.issueDescription.substring(0, 150),
                    reportedBy: i.reportedBy.fullname,
                    createdAt: i.createdAt,
                    ageInDays: parseFloat(ageInDays.toFixed(1))
                };
            })
            .sort((a, b) => b.ageInDays - a.ageInDays);
    }

    // ============================================
    // SERVICE REQUEST MEASUREMENT KPI
    // ============================================

    async getServiceRequestMetrics(query: any): Promise<any> {
        try {
            const { period, startDate, endDate } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            // Get all service tickets in period
            const tickets = await prisma.ticket.findMany({
                where: {
                    ticketType: {
                        in: ['PURCHASE_SERVICES_OSRS', 'PURCHASE_SERVICES_RS3']
                    },
                    createdAt: { gte, lte }
                },
                include: {
                    service: {
                        select: {
                            id: true,
                            name: true,
                            category: { select: { id: true, name: true } }
                        }
                    }
                }
            });

            // Calculate summary
            const summary = this.calculateServiceRequestSummary(tickets, period || 'monthly', gte, lte);

            // Calculate service performance
            const servicePerformance = this.calculateServicePerformance(tickets);

            // Calculate category performance
            const categoryPerformance = this.calculateCategoryPerformance(tickets);

            return {
                summary,
                servicePerformance,
                categoryPerformance
            };

        } catch (error) {
            logger.error("[KPI] Failed to get service request metrics:", error);
            throw error;
        }
    }

    private calculateServiceRequestSummary(tickets: any[], period: string, gte: Date | null | undefined, lte: Date | null | undefined) {
        const totalServiceTickets = tickets.length;
        const ticketsWithService = tickets.filter(t => t.serviceId !== null).length;
        const convertedTickets = tickets.filter(t => t.convertedToOrder).length;
        const conversionRate = ticketsWithService > 0
            ? parseFloat(((convertedTickets / ticketsWithService) * 100).toFixed(2))
            : 0;

        // Calculate average time to convert
        const convertedWithTime = tickets.filter(t => t.convertedToOrder && t.conversionAt);
        const avgTimeToConvertMinutes = convertedWithTime.length > 0
            ? convertedWithTime.reduce((sum, t) => {
                const timeMs = new Date(t.conversionAt).getTime() - new Date(t.createdAt).getTime();
                return sum + (timeMs / (1000 * 60));
              }, 0) / convertedWithTime.length
            : 0;

        return {
            period,
            startDate: gte,
            endDate: lte,
            totalServiceTickets,
            ticketsWithService,
            convertedTickets,
            conversionRate,
            avgTimeToConvertMinutes: parseFloat(avgTimeToConvertMinutes.toFixed(2))
        };
    }

    private calculateServicePerformance(tickets: any[]) {
        const serviceMap = new Map<string, any>();

        tickets.forEach(ticket => {
            if (!ticket.serviceId) return;

            const serviceId = ticket.serviceId;
            if (!serviceMap.has(serviceId)) {
                serviceMap.set(serviceId, {
                    serviceId,
                    serviceName: ticket.service?.name || 'Unknown',
                    categoryName: ticket.service?.category?.name || 'Unknown',
                    inquiries: 0,
                    conversions: 0,
                    conversionTimes: []
                });
            }

            const stat = serviceMap.get(serviceId);
            stat.inquiries++;

            if (ticket.convertedToOrder) {
                stat.conversions++;

                if (ticket.conversionAt) {
                    const timeMs = new Date(ticket.conversionAt).getTime() - new Date(ticket.createdAt).getTime();
                    stat.conversionTimes.push(timeMs / (1000 * 60));
                }
            }
        });

        return Array.from(serviceMap.values())
            .map(stat => ({
                serviceId: stat.serviceId,
                serviceName: stat.serviceName,
                categoryName: stat.categoryName,
                inquiries: stat.inquiries,
                conversions: stat.conversions,
                conversionRate: parseFloat(((stat.conversions / stat.inquiries) * 100).toFixed(2)),
                avgTimeToConvertMinutes: stat.conversionTimes.length > 0
                    ? parseFloat((stat.conversionTimes.reduce((a: number, b: number) => a + b, 0) / stat.conversionTimes.length).toFixed(2))
                    : 0
            }))
            .sort((a: any, b: any) => b.inquiries - a.inquiries);
    }

    private calculateCategoryPerformance(tickets: any[]) {
        const categoryMap = new Map<string, any>();

        tickets.forEach(ticket => {
            if (!ticket.service?.category) return;

            const categoryId = ticket.service.category.id;
            const categoryName = ticket.service.category.name;

            if (!categoryMap.has(categoryId)) {
                categoryMap.set(categoryId, {
                    categoryId,
                    categoryName,
                    inquiries: 0,
                    conversions: 0
                });
            }

            const stat = categoryMap.get(categoryId);
            stat.inquiries++;
            if (ticket.convertedToOrder) {
                stat.conversions++;
            }
        });

        return Array.from(categoryMap.values())
            .map(stat => ({
                categoryId: stat.categoryId,
                categoryName: stat.categoryName,
                inquiries: stat.inquiries,
                conversions: stat.conversions,
                conversionRate: parseFloat(((stat.conversions / stat.inquiries) * 100).toFixed(2))
            }))
            .sort((a, b) => b.inquiries - a.inquiries);
    }

    // ============================================
    // SERVICE REQUEST CONVERSION RATE KPI (Option 1: Quick Win)
    // ============================================

    async getServiceRequestConversion(query: any): Promise<any> {
        try {
            const { period, startDate, endDate } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            // Get all service-related tickets in the period
            const tickets = await prisma.ticket.findMany({
                where: {
                    ticketType: {
                        in: ['PURCHASE_SERVICES_OSRS', 'PURCHASE_SERVICES_RS3']
                    },
                    serviceId: { not: null },
                    createdAt: gte || lte ? { gte, lte } : undefined
                },
                include: {
                    service: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            category: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    },
                    category: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    orders: {
                        select: {
                            id: true,
                            orderNumber: true,
                            orderValue: true,
                            createdAt: true
                        }
                    }
                }
            });

            const summary = this.calculateServiceConversionSummary(tickets, period || 'monthly', gte, lte);
            const serviceBreakdown = this.calculateServiceConversionBreakdown(tickets);
            const categoryBreakdown = this.calculateCategoryConversionBreakdown(tickets);
            const conversionTimeline = this.calculateConversionTimeline(tickets);
            const topConvertingServices = this.getTopConvertingServices(tickets);
            const lowConvertingServices = this.getLowConvertingServices(tickets);

            return {
                summary,
                serviceBreakdown,
                categoryBreakdown,
                conversionTimeline,
                topConvertingServices,
                lowConvertingServices
            };

        } catch (error) {
            logger.error("[KPI] Failed to calculate service request conversion:", error);
            throw error;
        }
    }

    private calculateServiceConversionSummary(tickets: any[], period: string, gte: Date | undefined, lte: Date | undefined) {
        const totalTickets = tickets.length;
        const convertedTickets = tickets.filter(t => t.convertedToOrder).length;
        const unconvertedTickets = totalTickets - convertedTickets;

        const conversionRate = totalTickets > 0
            ? (convertedTickets / totalTickets) * 100
            : 0;

        // Calculate total revenue from converted tickets
        const totalRevenue = tickets
            .filter(t => t.convertedToOrder && t.orders.length > 0)
            .reduce((sum, t) => {
                const orderValue = t.orders.reduce((oSum: number, o: any) =>
                    oSum + parseFloat(o.orderValue.toString()), 0);
                return sum + orderValue;
            }, 0);

        // Calculate average conversion time (ticket creation to order creation)
        const conversionTimes = tickets
            .filter(t => t.convertedToOrder && t.conversionAt)
            .map(t => {
                const timeMs = new Date(t.conversionAt).getTime() - new Date(t.createdAt).getTime();
                return timeMs / (1000 * 60); // Convert to minutes
            });

        const avgConversionTimeMinutes = conversionTimes.length > 0
            ? conversionTimes.reduce((sum, time) => sum + time, 0) / conversionTimes.length
            : 0;

        return {
            period,
            startDate: gte || null,
            endDate: lte || null,
            totalServiceRequests: totalTickets,
            convertedToOrders: convertedTickets,
            unconvertedRequests: unconvertedTickets,
            conversionRate: parseFloat(conversionRate.toFixed(2)),
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            averageOrderValue: convertedTickets > 0
                ? parseFloat((totalRevenue / convertedTickets).toFixed(2))
                : 0,
            avgConversionTimeMinutes: parseFloat(avgConversionTimeMinutes.toFixed(2))
        };
    }

    private calculateServiceConversionBreakdown(tickets: any[]) {
        const serviceMap = new Map<string, any>();

        tickets.forEach(ticket => {
            if (!ticket.serviceId || !ticket.service) return;

            const serviceId = ticket.serviceId;
            if (!serviceMap.has(serviceId)) {
                serviceMap.set(serviceId, {
                    serviceId,
                    serviceName: ticket.service.name,
                    categoryName: ticket.service.category?.name || 'Unknown',
                    requests: 0,
                    conversions: 0,
                    revenue: 0,
                    conversionTimes: []
                });
            }

            const stats = serviceMap.get(serviceId)!;
            stats.requests++;

            if (ticket.convertedToOrder) {
                stats.conversions++;

                // Add revenue
                const orderRevenue = ticket.orders.reduce((sum: number, o: any) =>
                    sum + parseFloat(o.orderValue.toString()), 0);
                stats.revenue += orderRevenue;

                // Track conversion time
                if (ticket.conversionAt) {
                    const timeMs = new Date(ticket.conversionAt).getTime() - new Date(ticket.createdAt).getTime();
                    stats.conversionTimes.push(timeMs / (1000 * 60));
                }
            }
        });

        return Array.from(serviceMap.values())
            .map(stats => ({
                serviceId: stats.serviceId,
                serviceName: stats.serviceName,
                categoryName: stats.categoryName,
                requests: stats.requests,
                conversions: stats.conversions,
                conversionRate: parseFloat(((stats.conversions / stats.requests) * 100).toFixed(2)),
                revenue: parseFloat(stats.revenue.toFixed(2)),
                avgOrderValue: stats.conversions > 0
                    ? parseFloat((stats.revenue / stats.conversions).toFixed(2))
                    : 0,
                avgConversionTimeMinutes: stats.conversionTimes.length > 0
                    ? parseFloat((stats.conversionTimes.reduce((a: number, b: number) => a + b, 0) / stats.conversionTimes.length).toFixed(2))
                    : 0
            }))
            .sort((a, b) => b.requests - a.requests);
    }

    private calculateCategoryConversionBreakdown(tickets: any[]) {
        const categoryMap = new Map<string, any>();

        tickets.forEach(ticket => {
            const categoryId = ticket.service?.category?.id || ticket.categoryId;
            const categoryName = ticket.service?.category?.name || ticket.category?.name || 'Unknown';

            if (!categoryId) return;

            if (!categoryMap.has(categoryId)) {
                categoryMap.set(categoryId, {
                    categoryId,
                    categoryName,
                    requests: 0,
                    conversions: 0,
                    revenue: 0
                });
            }

            const stats = categoryMap.get(categoryId)!;
            stats.requests++;

            if (ticket.convertedToOrder) {
                stats.conversions++;
                const orderRevenue = ticket.orders.reduce((sum: number, o: any) =>
                    sum + parseFloat(o.orderValue.toString()), 0);
                stats.revenue += orderRevenue;
            }
        });

        return Array.from(categoryMap.values())
            .map(stats => ({
                categoryId: stats.categoryId,
                categoryName: stats.categoryName,
                requests: stats.requests,
                conversions: stats.conversions,
                conversionRate: parseFloat(((stats.conversions / stats.requests) * 100).toFixed(2)),
                revenue: parseFloat(stats.revenue.toFixed(2))
            }))
            .sort((a, b) => b.requests - a.requests);
    }

    private calculateConversionTimeline(tickets: any[]) {
        // Group by date to show conversion trends over time
        const dateMap = new Map<string, { requests: number; conversions: number }>();

        tickets.forEach(ticket => {
            const dateKey = ticket.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD

            if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, { requests: 0, conversions: 0 });
            }

            const stats = dateMap.get(dateKey)!;
            stats.requests++;
            if (ticket.convertedToOrder) {
                stats.conversions++;
            }
        });

        return Array.from(dateMap.entries())
            .map(([date, stats]) => ({
                date,
                requests: stats.requests,
                conversions: stats.conversions,
                conversionRate: parseFloat(((stats.conversions / stats.requests) * 100).toFixed(2))
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    private getTopConvertingServices(tickets: any[]) {
        const serviceMap = new Map<string, any>();

        tickets.forEach(ticket => {
            if (!ticket.serviceId || !ticket.service) return;

            const serviceId = ticket.serviceId;
            if (!serviceMap.has(serviceId)) {
                serviceMap.set(serviceId, {
                    serviceId,
                    serviceName: ticket.service.name,
                    requests: 0,
                    conversions: 0
                });
            }

            const stats = serviceMap.get(serviceId)!;
            stats.requests++;
            if (ticket.convertedToOrder) {
                stats.conversions++;
            }
        });

        return Array.from(serviceMap.values())
            .filter(stats => stats.requests >= 3) // At least 3 requests for statistical relevance
            .map(stats => ({
                serviceId: stats.serviceId,
                serviceName: stats.serviceName,
                requests: stats.requests,
                conversions: stats.conversions,
                conversionRate: parseFloat(((stats.conversions / stats.requests) * 100).toFixed(2))
            }))
            .sort((a, b) => b.conversionRate - a.conversionRate)
            .slice(0, 10);
    }

    private getLowConvertingServices(tickets: any[]) {
        const serviceMap = new Map<string, any>();

        tickets.forEach(ticket => {
            if (!ticket.serviceId || !ticket.service) return;

            const serviceId = ticket.serviceId;
            if (!serviceMap.has(serviceId)) {
                serviceMap.set(serviceId, {
                    serviceId,
                    serviceName: ticket.service.name,
                    requests: 0,
                    conversions: 0
                });
            }

            const stats = serviceMap.get(serviceId)!;
            stats.requests++;
            if (ticket.convertedToOrder) {
                stats.conversions++;
            }
        });

        return Array.from(serviceMap.values())
            .filter(stats => stats.requests >= 5) // At least 5 requests for statistical relevance
            .map(stats => ({
                serviceId: stats.serviceId,
                serviceName: stats.serviceName,
                requests: stats.requests,
                conversions: stats.conversions,
                conversionRate: parseFloat(((stats.conversions / stats.requests) * 100).toFixed(2))
            }))
            .sort((a, b) => a.conversionRate - b.conversionRate) // Sort by lowest conversion rate
            .slice(0, 10);
    }

    // ============================================
    // WORKER PERFORMANCE METRICS KPI
    // ============================================

    async getWorkerPerformance(query: any): Promise<any> {
        try {
            const { period, startDate, endDate } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            // Use existing orderService.getOrders() method
            const { list: orders } = await this.orderService.getOrders({
                startDate: gte?.toISOString(),
                endDate: lte?.toISOString(),
                page: 1,
                limit: 999999, // Get all orders for the period
                search: '',
                order: 'DESC'
            });

            // Filter orders with workers
            const workerOrders = orders.filter((o: any) => o.workerId !== null);

            // Calculate worker stats
            const workerStats = this.calculateWorkerStats(workerOrders);

            // Summary
            const summary = {
                period: period || 'monthly',
                startDate: gte || null,
                endDate: lte || null,
                totalWorkers: workerStats.length,
                totalOrdersProcessed: workerOrders.length,
                totalRevenue: parseFloat(workerStats.reduce((sum, w) => sum + w.revenue, 0).toFixed(2)),
                avgCompletionTime: workerStats.length > 0
                    ? parseFloat((workerStats.reduce((sum, w) => sum + w.avgCompletionMinutes, 0) / workerStats.length).toFixed(2))
                    : 0
            };

            return { summary, workerStats };

        } catch (error) {
            logger.error("[KPI] Failed to calculate worker performance:", error);
            throw error;
        }
    }

    private calculateWorkerStats(orders: any[]) {
        const workerMap = new Map<number, any>();

        orders.forEach(order => {
            if (!order.workerId) return;

            if (!workerMap.has(order.workerId)) {
                workerMap.set(order.workerId, {
                    workerId: order.workerId,
                    workerName: order.worker?.fullname || 'Unknown',
                    discordUsername: order.worker?.username || null,
                    orders: []
                });
            }

            workerMap.get(order.workerId)!.orders.push(order);
        });

        return Array.from(workerMap.values()).map(workerData => {
            const { workerId, workerName, discordUsername, orders } = workerData;

            const completed = orders.filter((o: any) => o.status === 'COMPLETED');
            const active = orders.filter((o: any) =>
                ['PENDING', 'IN_PROGRESS'].includes(o.status)
            );

            // Calculate avg completion time
            const completionTimes = completed
                .filter((o: any) => o.completedAt && o.startedAt)
                .map((o: any) => {
                    const start = new Date(o.startedAt).getTime();
                    const end = new Date(o.completedAt).getTime();
                    return (end - start) / (1000 * 60); // minutes
                });

            const avgCompletionTime = completionTimes.length > 0
                ? completionTimes.reduce((a: number, b: number) => a + b, 0) / completionTimes.length
                : 0;

            // Calculate revenue
            const revenue = completed.reduce((sum: number, o: any) =>
                sum + parseFloat(o.orderValue?.toString() || '0'), 0
            );

            // Success rate
            const total = orders.length;
            const successRate = total > 0 ? (completed.length / total) * 100 : 0;

            return {
                workerId,
                workerName,
                discordUsername,
                totalOrders: total,
                completedOrders: completed.length,
                activeOrders: active.length,
                avgCompletionMinutes: parseFloat(avgCompletionTime.toFixed(2)),
                revenue: parseFloat(revenue.toFixed(2)),
                successRate: parseFloat(successRate.toFixed(2)),
                avgOrderValue: completed.length > 0
                    ? parseFloat((revenue / completed.length).toFixed(2))
                    : 0
            };
        }).filter(w => w.totalOrders > 0)
          .sort((a, b) => b.completedOrders - a.completedOrders);
    }

    // ============================================
    // WORKER ISSUE TRACKING KPI
    // ============================================

    async getWorkerIssueTracking(query: any): Promise<any> {
        const { period, startDate, endDate } = query;
        const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

        // Use existing orderService.getOrders() method to get all orders with issues
        const { list: orders } = await this.orderService.getOrders({
            startDate: gte?.toISOString(),
            endDate: lte?.toISOString(),
            page: 1,
            limit: 999999,
            search: '',
            order: 'DESC'
        });

        // Get all issues for these orders
        const orderIds = orders.map((o: any) => o.id);
        const issues = await prisma.orderIssue.findMany({
            where: {
                orderId: { in: orderIds },
                createdAt: gte && lte ? { gte, lte } : undefined
            },
            include: {
                order: {
                    include: {
                        worker: true,
                        customer: true,
                        service: true
                    }
                },
                reportedBy: true,
                resolvedBy: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Calculate summary
        const summary = {
            totalIssues: issues.length,
            openIssues: issues.filter(i => i.status === 'OPEN').length,
            inReviewIssues: issues.filter(i => i.status === 'IN_REVIEW').length,
            resolvedIssues: issues.filter(i => i.status === 'RESOLVED').length,
            closedIssues: issues.filter(i => i.status === 'CLOSED').length,
            urgentIssues: issues.filter(i => i.priority === 'URGENT').length,
            highPriorityIssues: issues.filter(i => i.priority === 'HIGH').length,
            totalWorkers: new Set(issues.map(i => i.order.workerId).filter(Boolean)).size,
            avgIssuesPerWorker: 0,
            avgResolutionTimeHours: 0
        };

        // Calculate average resolution time
        const resolvedIssues = issues.filter(i => i.resolvedAt);
        if (resolvedIssues.length > 0) {
            const totalResolutionTime = resolvedIssues.reduce((sum, issue) => {
                const created = new Date(issue.createdAt).getTime();
                const resolved = new Date(issue.resolvedAt!).getTime();
                return sum + (resolved - created);
            }, 0);
            summary.avgResolutionTimeHours = parseFloat(
                ((totalResolutionTime / resolvedIssues.length) / (1000 * 60 * 60)).toFixed(2)
            );
        }

        // Group issues by worker
        const workerIssueStats = this.calculateWorkerIssueStats(issues);

        if (workerIssueStats.length > 0) {
            summary.avgIssuesPerWorker = parseFloat(
                (summary.totalIssues / workerIssueStats.length).toFixed(2)
            );
        }

        return {
            summary,
            workerStats: workerIssueStats,
            recentIssues: issues.slice(0, 10).map(issue => ({
                issueId: issue.id,
                orderId: issue.orderId,
                workerName: issue.order.worker?.username || 'Unassigned',
                workerId: issue.order.workerId,
                serviceName: issue.order.service?.name || 'Unknown',
                description: issue.issueDescription,
                status: issue.status,
                priority: issue.priority,
                reportedBy: issue.reportedBy.username,
                resolvedBy: issue.resolvedBy?.username || null,
                createdAt: issue.createdAt,
                resolvedAt: issue.resolvedAt,
                resolutionTimeHours: issue.resolvedAt
                    ? parseFloat(
                        ((new Date(issue.resolvedAt).getTime() - new Date(issue.createdAt).getTime()) /
                        (1000 * 60 * 60)).toFixed(2)
                    )
                    : null
            }))
        };
    }

    private calculateWorkerIssueStats(issues: any[]): any[] {
        // Group issues by worker
        const workerMap = new Map<string, any[]>();

        issues.forEach(issue => {
            if (!issue.order.workerId) return;

            const workerId = issue.order.workerId.toString();
            if (!workerMap.has(workerId)) {
                workerMap.set(workerId, []);
            }
            workerMap.get(workerId)!.push(issue);
        });

        // Calculate stats for each worker
        return Array.from(workerMap.entries()).map(([workerId, workerIssues]) => {
            const worker = workerIssues[0].order.worker;

            const openIssues = workerIssues.filter(i => i.status === 'OPEN');
            const resolvedIssues = workerIssues.filter(i => i.status === 'RESOLVED');
            const urgentIssues = workerIssues.filter(i => i.priority === 'URGENT');
            const highIssues = workerIssues.filter(i => i.priority === 'HIGH');

            // Calculate average resolution time for this worker
            let avgResolutionHours = 0;
            const resolvedWithTime = workerIssues.filter(i => i.resolvedAt);
            if (resolvedWithTime.length > 0) {
                const totalTime = resolvedWithTime.reduce((sum, issue) => {
                    const created = new Date(issue.createdAt).getTime();
                    const resolved = new Date(issue.resolvedAt).getTime();
                    return sum + (resolved - created);
                }, 0);
                avgResolutionHours = parseFloat(
                    ((totalTime / resolvedWithTime.length) / (1000 * 60 * 60)).toFixed(2)
                );
            }

            // Calculate issue rate (issues per order)
            const totalOrders = workerIssues[0].order.worker?.workerOrders?.length || 1;
            const issueRate = parseFloat(((workerIssues.length / totalOrders) * 100).toFixed(2));

            return {
                workerId: parseInt(workerId),
                workerName: worker?.username || 'Unknown',
                discordUsername: worker?.discordUsername || 'Unknown',
                totalIssues: workerIssues.length,
                openIssues: openIssues.length,
                resolvedIssues: resolvedIssues.length,
                urgentIssues: urgentIssues.length,
                highPriorityIssues: highIssues.length,
                avgResolutionHours,
                issueRate,
                lastIssueDate: workerIssues[0].createdAt
            };
        }).sort((a, b) => b.totalIssues - a.totalIssues);
    }

    // ============================================
    // ORDER COMPLETION TIME KPI
    // ============================================

    async getOrderCompletionTime(query: any): Promise<any> {
        const { period, startDate, endDate } = query;
        const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

        // Use existing orderService.getOrders() method
        const { list: orders } = await this.orderService.getOrders({
            status: OrderStatus.COMPLETED,
            startDate: gte?.toISOString(),
            endDate: lte?.toISOString(),
            page: 1,
            limit: 999999,
            search: '',
            order: 'DESC'
        });

        // Filter only completed orders with timing data
        const completedOrders = orders.filter((o: any) => o.startedAt && o.completedAt);

        // Calculate summary statistics
        const summary = {
            totalCompletedOrders: completedOrders.length,
            ordersWithEstimates: completedOrders.filter((o: any) => o.estimatedCompletionHours).length,
            avgActualHours: 0,
            avgEstimatedHours: 0,
            avgEfficiency: 0,
            onTimeOrders: 0,
            earlyOrders: 0,
            lateOrders: 0,
            onTimeRate: 0
        };

        // Calculate averages
        if (completedOrders.length > 0) {
            const totalActualHours = completedOrders.reduce((sum: number, o: any) => {
                if (!o.actualCompletionHours) {
                    const start = new Date(o.startedAt).getTime();
                    const end = new Date(o.completedAt).getTime();
                    return sum + ((end - start) / (1000 * 60 * 60));
                }
                return sum + parseFloat(o.actualCompletionHours.toString());
            }, 0);
            summary.avgActualHours = parseFloat((totalActualHours / completedOrders.length).toFixed(2));
        }

        // Calculate efficiency metrics for orders with estimates
        const ordersWithEstimates = completedOrders.filter((o: any) => o.estimatedCompletionHours);
        if (ordersWithEstimates.length > 0) {
            const totalEstimated = ordersWithEstimates.reduce((sum: number, o: any) =>
                sum + parseFloat(o.estimatedCompletionHours.toString()), 0
            );
            summary.avgEstimatedHours = parseFloat((totalEstimated / ordersWithEstimates.length).toFixed(2));

            const totalEfficiency = ordersWithEstimates.reduce((sum: number, o: any) => {
                if (o.completionEfficiency) {
                    return sum + parseFloat(o.completionEfficiency.toString());
                }
                return sum;
            }, 0);
            summary.avgEfficiency = parseFloat((totalEfficiency / ordersWithEstimates.length).toFixed(2));

            summary.onTimeOrders = ordersWithEstimates.filter((o: any) => {
                const eff = parseFloat((o.completionEfficiency || 0).toString());
                return eff >= 90 && eff <= 110;
            }).length;

            summary.earlyOrders = ordersWithEstimates.filter((o: any) => {
                const eff = parseFloat((o.completionEfficiency || 0).toString());
                return eff > 110;
            }).length;

            summary.lateOrders = ordersWithEstimates.filter((o: any) => {
                const eff = parseFloat((o.completionEfficiency || 0).toString());
                return eff < 90;
            }).length;

            summary.onTimeRate = parseFloat(
                ((summary.onTimeOrders + summary.earlyOrders) / ordersWithEstimates.length * 100).toFixed(2)
            );
        }

        const serviceBreakdown = this.calculateServiceCompletionBreakdown(completedOrders);
        const workerBreakdown = this.calculateWorkerCompletionBreakdown(completedOrders);

        const sortedByTime = [...completedOrders].sort((a, b) => {
            const aTime = a.actualCompletionHours || 0;
            const bTime = b.actualCompletionHours || 0;
            return parseFloat(aTime.toString()) - parseFloat(bTime.toString());
        });

        const fastest10 = sortedByTime.slice(0, 10).map(o => ({
            orderId: o.id,
            orderNumber: o.orderNumber,
            serviceName: o.service?.name || 'Unknown',
            workerName: o.worker?.username || 'Unknown',
            actualHours: o.actualCompletionHours ? parseFloat(o.actualCompletionHours.toString()).toFixed(2) : 'N/A',
            estimatedHours: o.estimatedCompletionHours ? parseFloat(o.estimatedCompletionHours.toString()).toFixed(2) : 'N/A',
            efficiency: o.completionEfficiency ? parseFloat(o.completionEfficiency.toString()).toFixed(2) : 'N/A',
            completedAt: o.completedAt
        }));

        const slowest10 = sortedByTime.slice(-10).reverse().map(o => ({
            orderId: o.id,
            orderNumber: o.orderNumber,
            serviceName: o.service?.name || 'Unknown',
            workerName: o.worker?.username || 'Unknown',
            actualHours: o.actualCompletionHours ? parseFloat(o.actualCompletionHours.toString()).toFixed(2) : 'N/A',
            estimatedHours: o.estimatedCompletionHours ? parseFloat(o.estimatedCompletionHours.toString()).toFixed(2) : 'N/A',
            efficiency: o.completionEfficiency ? parseFloat(o.completionEfficiency.toString()).toFixed(2) : 'N/A',
            completedAt: o.completedAt
        }));

        return {
            summary,
            serviceBreakdown,
            workerBreakdown,
            fastest: fastest10,
            slowest: slowest10
        };
    }

    private calculateServiceCompletionBreakdown(orders: any[]): any[] {
        const serviceMap = new Map<string, any[]>();

        orders.forEach(order => {
            const serviceId = order.serviceId || 'unknown';
            if (!serviceMap.has(serviceId)) {
                serviceMap.set(serviceId, []);
            }
            serviceMap.get(serviceId)!.push(order);
        });

        return Array.from(serviceMap.entries()).map(([serviceId, serviceOrders]) => {
            const totalActual = serviceOrders.reduce((sum, o) => {
                const actual = o.actualCompletionHours || 0;
                return sum + parseFloat(actual.toString());
            }, 0);

            const avgActual = serviceOrders.length > 0 ? totalActual / serviceOrders.length : 0;

            const ordersWithEstimates = serviceOrders.filter(o => o.estimatedCompletionHours);
            let avgEstimated = 0;
            let avgEfficiency = 0;

            if (ordersWithEstimates.length > 0) {
                const totalEstimated = ordersWithEstimates.reduce((sum, o) =>
                    sum + parseFloat(o.estimatedCompletionHours.toString()), 0
                );
                avgEstimated = totalEstimated / ordersWithEstimates.length;

                const totalEfficiency = ordersWithEstimates.reduce((sum, o) => {
                    const eff = o.completionEfficiency || 0;
                    return sum + parseFloat(eff.toString());
                }, 0);
                avgEfficiency = totalEfficiency / ordersWithEstimates.length;
            }

            return {
                serviceId,
                serviceName: serviceOrders[0].service?.name || 'Unknown',
                totalOrders: serviceOrders.length,
                avgActualHours: parseFloat(avgActual.toFixed(2)),
                avgEstimatedHours: parseFloat(avgEstimated.toFixed(2)),
                avgEfficiency: parseFloat(avgEfficiency.toFixed(2))
            };
        }).sort((a, b) => b.totalOrders - a.totalOrders);
    }

    private calculateWorkerCompletionBreakdown(orders: any[]): any[] {
        const workerMap = new Map<number, any[]>();

        orders.forEach(order => {
            if (!order.workerId) return;

            const workerId = order.workerId;
            if (!workerMap.has(workerId)) {
                workerMap.set(workerId, []);
            }
            workerMap.get(workerId)!.push(order);
        });

        return Array.from(workerMap.entries()).map(([workerId, workerOrders]) => {
            const totalActual = workerOrders.reduce((sum, o) => {
                const actual = o.actualCompletionHours || 0;
                return sum + parseFloat(actual.toString());
            }, 0);

            const avgActual = workerOrders.length > 0 ? totalActual / workerOrders.length : 0;

            const ordersWithEstimates = workerOrders.filter(o => o.estimatedCompletionHours);
            let avgEfficiency = 0;
            let onTimeCount = 0;

            if (ordersWithEstimates.length > 0) {
                const totalEfficiency = ordersWithEstimates.reduce((sum, o) => {
                    const eff = o.completionEfficiency || 0;
                    return sum + parseFloat(eff.toString());
                }, 0);
                avgEfficiency = totalEfficiency / ordersWithEstimates.length;

                onTimeCount = ordersWithEstimates.filter(o => {
                    const eff = parseFloat((o.completionEfficiency || 0).toString());
                    return eff >= 90;
                }).length;
            }

            return {
                workerId,
                workerName: workerOrders[0].worker?.username || 'Unknown',
                discordUsername: workerOrders[0].worker?.discordUsername || 'Unknown',
                totalOrders: workerOrders.length,
                avgActualHours: parseFloat(avgActual.toFixed(2)),
                avgEfficiency: parseFloat(avgEfficiency.toFixed(2)),
                onTimeRate: ordersWithEstimates.length > 0
                    ? parseFloat((onTimeCount / ordersWithEstimates.length * 100).toFixed(2))
                    : 0
            };
        }).sort((a, b) => a.avgActualHours - b.avgActualHours);
    }

    // ============================================
    // REVENUE, EXPENSES & NET PROFIT KPI
    // ============================================

    async getFinancialOverview(query: any): Promise<any> {
        const { period, startDate, endDate } = query;
        const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

        // 1. Get completed orders for revenue calculation
        const { list: completedOrders } = await this.orderService.getOrders({
            status: OrderStatus.COMPLETED,
            startDate: gte?.toISOString(),
            endDate: lte?.toISOString(),
            page: 1,
            limit: 999999,
            search: '',
            order: 'DESC'
        });

        // 2. Calculate revenue metrics
        const totalRevenue = completedOrders.reduce((sum: number, order: any) =>
            sum + parseFloat(order.orderValue.toString()), 0
        );

        const workerPayouts = completedOrders.reduce((sum: number, order: any) =>
            sum + parseFloat(order.workerPayout?.toString() || '0'), 0
        );

        const supportPayouts = completedOrders.reduce((sum: number, order: any) =>
            sum + parseFloat(order.supportPayout?.toString() || '0'), 0
        );

        const grossProfit = completedOrders.reduce((sum: number, order: any) =>
            sum + parseFloat(order.systemPayout?.toString() || '0'), 0
        );

        // 3. Get operational expenses
        const operationalExpenses = await prisma.operationalExpense.findMany({
            where: {
                date: { gte, lte }
            },
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true,
                        discordUsername: true
                    }
                }
            },
            orderBy: { date: 'desc' }
        });

        const totalOperationalExpenses = operationalExpenses.reduce((sum, expense) =>
            sum + parseFloat(expense.amount.toString()), 0
        );

        // 4. Calculate net profit
        const totalExpenses = workerPayouts + supportPayouts + totalOperationalExpenses;
        const netProfit = totalRevenue - totalExpenses;
        const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
        const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

        // 5. Group expenses by category
        const expensesByCategory = operationalExpenses.reduce((acc, expense) => {
            const category = expense.category;
            if (!acc[category]) {
                acc[category] = {
                    category,
                    total: 0,
                    count: 0,
                    items: []
                };
            }
            acc[category].total += parseFloat(expense.amount.toString());
            acc[category].count += 1;
            acc[category].items.push({
                id: expense.id,
                amount: parseFloat(expense.amount.toString()),
                description: expense.description,
                date: expense.date,
                reference: expense.reference,
                createdBy: expense.creator.username
            });
            return acc;
        }, {} as Record<string, any>);

        // 6. Revenue breakdown by service
        const revenueByService = this.calculateRevenueByService(completedOrders);

        // 7. Get system wallet balance
        const systemWallet = await prisma.systemWallet.findUnique({
            where: { id: 'system-wallet' }
        });

        // 8. Monthly trend (if period is long enough)
        const monthlyTrend = gte && lte ? await this.calculateMonthlyFinancialTrend(gte, lte) : [];

        // 9. Top expenses (largest 10)
        const topExpenses = operationalExpenses
            .sort((a, b) => parseFloat(b.amount.toString()) - parseFloat(a.amount.toString()))
            .slice(0, 10)
            .map(expense => ({
                id: expense.id,
                category: expense.category,
                amount: parseFloat(expense.amount.toString()),
                description: expense.description,
                date: expense.date,
                createdBy: expense.creator.username
            }));

        return {
            msg: 'Financial overview retrieved successfully',
            status: 200,
            data: {
                summary: {
                    totalRevenue,
                    totalExpenses,
                    grossProfit,
                    netProfit,
                    grossProfitMargin: parseFloat(grossProfitMargin.toFixed(2)),
                    netProfitMargin: parseFloat(netProfitMargin.toFixed(2)),
                    totalOrders: completedOrders.length,
                    avgOrderValue: totalRevenue / completedOrders.length || 0
                },
                revenue: {
                    total: totalRevenue,
                    byService: revenueByService,
                    avgOrderValue: totalRevenue / completedOrders.length || 0
                },
                expenses: {
                    workerPayouts,
                    supportPayouts,
                    operational: totalOperationalExpenses,
                    byCategory: Object.values(expensesByCategory),
                    total: totalExpenses
                },
                systemWallet: {
                    balance: parseFloat(systemWallet?.balance?.toString() || '0'),
                    currency: systemWallet?.currency || 'USD'
                },
                monthlyTrend,
                topExpenses,
                period: {
                    start: gte,
                    end: lte,
                    type: period || 'custom'
                }
            },
            error: false
        };
    }

    // Helper: Calculate revenue by service
    private calculateRevenueByService(orders: any[]): any[] {
        const serviceMap = orders.reduce((acc, order) => {
            const serviceId = order.serviceId;
            const serviceName = order.service?.name || 'Unknown Service';

            if (!acc[serviceId]) {
                acc[serviceId] = {
                    serviceId,
                    serviceName,
                    totalRevenue: 0,
                    totalOrders: 0,
                    avgOrderValue: 0
                };
            }

            acc[serviceId].totalRevenue += parseFloat(order.orderValue.toString());
            acc[serviceId].totalOrders += 1;

            return acc;
        }, {} as Record<string, any>);

        return Object.values(serviceMap).map((service: any) => ({
            ...service,
            avgOrderValue: service.totalRevenue / service.totalOrders
        })).sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    // Helper: Calculate monthly financial trend
    private async calculateMonthlyFinancialTrend(gte: Date, lte: Date): Promise<any[]> {
        const months: any[] = [];
        const current = new Date(gte);

        while (current <= lte) {
            const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
            const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);

            // Get orders for this month
            const { list: orders } = await this.orderService.getOrders({
                status: OrderStatus.COMPLETED,
                startDate: monthStart.toISOString(),
                endDate: monthEnd.toISOString(),
                page: 1,
                limit: 999999,
                search: '',
                order: 'DESC'
            });

            const revenue = orders.reduce((sum: number, o: any) => sum + parseFloat(o.orderValue.toString()), 0);
            const grossProfit = orders.reduce((sum: number, o: any) => sum + parseFloat(o.systemPayout?.toString() || '0'), 0);

            // Get operational expenses for this month
            const expenses = await prisma.operationalExpense.findMany({
                where: {
                    date: { gte: monthStart, lte: monthEnd }
                }
            });

            const operationalCost = expenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
            const netProfit = grossProfit - operationalCost;

            months.push({
                month: monthStart.toISOString().substring(0, 7), // YYYY-MM
                revenue,
                grossProfit,
                operationalExpenses: operationalCost,
                netProfit,
                orders: orders.length
            });

            current.setMonth(current.getMonth() + 1);
        }

        return months;
    }

    /**
     * KPI #3: Discord Engagement & Interaction
     * Get engagement overview with metrics and top contributors
     */
    async getDiscordEngagement(query: any): Promise<any> {
        try {
            const { period = 'monthly', startDate, endDate, limit = 10 } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            const totalEngagement = await prisma.discordEngagement.aggregate({
                where: {
                    date: {
                        gte,
                        lte,
                    },
                },
                _sum: {
                    messagesCount: true,
                    reactionsGiven: true,
                    reactionsReceived: true,
                    mentionsCount: true,
                    helpfulReactions: true,
                    voiceMinutes: true,
                    engagementScore: true,
                },
                _count: {
                    id: true,
                },
            });

            const uniqueUsers = await prisma.discordEngagement.findMany({
                where: {
                    date: {
                        gte,
                        lte,
                    },
                },
                distinct: ['discordId'],
                select: {
                    discordId: true,
                },
            });

            const topUsers = lte
                ? await prisma.$queryRaw<any[]>`
                    SELECT
                        discordId,
                        MAX(username) as username,
                        MAX(displayName) as displayName,
                        SUM(messagesCount) as totalMessages,
                        SUM(reactionsGiven) as totalReactionsGiven,
                        SUM(reactionsReceived) as totalReactionsReceived,
                        SUM(helpfulReactions) as totalHelpfulReactions,
                        SUM(engagementScore) as totalEngagementScore
                    FROM DiscordEngagement
                    WHERE date >= ${gte} AND date <= ${lte}
                    GROUP BY discordId
                    ORDER BY totalEngagementScore DESC, totalMessages DESC
                    LIMIT ${Number(limit)}
                `
                : await prisma.$queryRaw<any[]>`
                    SELECT
                        discordId,
                        MAX(username) as username,
                        MAX(displayName) as displayName,
                        SUM(messagesCount) as totalMessages,
                        SUM(reactionsGiven) as totalReactionsGiven,
                        SUM(reactionsReceived) as totalReactionsReceived,
                        SUM(helpfulReactions) as totalHelpfulReactions,
                        SUM(engagementScore) as totalEngagementScore
                    FROM DiscordEngagement
                    WHERE date >= ${gte}
                    GROUP BY discordId
                    ORDER BY totalEngagementScore DESC, totalMessages DESC
                    LIMIT ${Number(limit)}
                `;

            const dailyEngagement = await prisma.discordEngagement.groupBy({
                by: ['date'],
                where: {
                    date: {
                        gte,
                        lte,
                    },
                },
                _sum: {
                    messagesCount: true,
                    reactionsGiven: true,
                    reactionsReceived: true,
                    engagementScore: true,
                },
                orderBy: {
                    date: 'asc',
                },
            });

            const dailyTrend = dailyEngagement.map(day => ({
                date: day.date.toISOString().split('T')[0],
                messages: day._sum.messagesCount || 0,
                reactionsGiven: day._sum.reactionsGiven || 0,
                reactionsReceived: day._sum.reactionsReceived || 0,
                engagementScore: Math.round((day._sum.engagementScore || 0) * 100) / 100,
            }));

            const engagementRecords = await prisma.discordEngagement.findMany({
                where: {
                    date: {
                        gte,
                        lte,
                    },
                },
                select: {
                    channelActivity: true,
                },
            });

            const channelActivityMap: { [key: string]: number } = {};
            engagementRecords.forEach(record => {
                const activity = record.channelActivity as any;
                if (activity && typeof activity === 'object') {
                    Object.entries(activity).forEach(([channelId, count]) => {
                        channelActivityMap[channelId] = (channelActivityMap[channelId] || 0) + (count as number);
                    });
                }
            });

            // Fetch channel names from Discord bot
            let channelsData: any = { channels: [] };
            try {
                channelsData = await this.discordChannelsService.getAllChannelsStatus();
            } catch (error) {
                logger.warn("[KPI] Could not fetch channel names from Discord bot");
            }

            // Also fetch all guild channels for better channel name mapping
            try {
                const guildChannels = await this.discordChannelsService.getAllGuildChannels();
                if (guildChannels.channels && guildChannels.channels.length > 0) {
                    channelsData.channels = guildChannels.channels;
                }
            } catch (error) {
                logger.warn("[KPI] Could not fetch guild channels from Discord bot");
            }

            const channelMap = new Map(
                channelsData.channels?.map((ch: any) => [ch.id, ch.name]) || []
            );

            const topChannels = Object.entries(channelActivityMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([channelId, count]) => ({
                    channelId,
                    channelName: channelMap.get(channelId) || null,
                    messageCount: count,
                }));

            // Get active engagement ranks
            const activeRanks = await prisma.engagementRank.findMany({
                where: {
                    active: true,
                },
                orderBy: {
                    earnedAt: 'desc',
                },
                take: 20,
            });

            return {
                    period,
                    dateRange: {
                        start: gte?.toISOString().split('T')[0] || '',
                        end: lte?.toISOString().split('T')[0] || '',
                    },
                    summary: {
                        totalMessages: totalEngagement._sum.messagesCount || 0,
                        totalReactionsGiven: totalEngagement._sum.reactionsGiven || 0,
                        totalReactionsReceived: totalEngagement._sum.reactionsReceived || 0,
                        totalHelpfulReactions: totalEngagement._sum.helpfulReactions || 0,
                        totalEngagementScore: Math.round((totalEngagement._sum.engagementScore || 0) * 100) / 100,
                        activeUsers: uniqueUsers.length,
                        totalRecords: totalEngagement._count.id,
                    },
                    topUsers: topUsers.map(user => ({
                        discordId: user.discordId,
                        username: user.username,
                        displayName: user.displayName,
                        totalMessages: Number(user.totalMessages),
                        totalReactionsGiven: Number(user.totalReactionsGiven),
                        totalReactionsReceived: Number(user.totalReactionsReceived),
                        totalHelpfulReactions: Number(user.totalHelpfulReactions),
                        totalEngagementScore: Math.round(Number(user.totalEngagementScore) * 100) / 100,
                    })),
                    dailyTrend,
                    topChannels,
                    activeRanks: activeRanks.map(rank => ({
                        id: rank.id,
                        discordId: rank.discordId,
                        userId: rank.userId,
                        rank: rank.rank,
                        reason: rank.reason,
                        earnedAt: rank.earnedAt,
                    })),
            }
        } catch (error) {
            logger.error('[KPI Service] Error getting Discord engagement:', error);
            return {
                msg: 'Failed to retrieve Discord engagement data',
                status: 500,
                data: null,
                error: true,
            };
        }
    }

    /**
     * Get top engaged users
     */
    async getTopEngagedUsers(query: any): Promise<any> {
        try {
            const { period = 'monthly', startDate, endDate, limit = 10 } = query;
            const { gte, lte } = this.calculateDateRange(period, startDate, endDate);

            const topUsers = await prisma.$queryRaw<any[]>`
                SELECT
                    discordId,
                    MAX(username) as username,
                    MAX(displayName) as displayName,
                    SUM(messagesCount) as totalMessages,
                    SUM(reactionsGiven) as totalReactionsGiven,
                    SUM(reactionsReceived) as totalReactionsReceived,
                    SUM(helpfulReactions) as totalHelpfulReactions,
                    SUM(engagementScore) as totalEngagementScore,
                    COUNT(DISTINCT date) as activeDays
                FROM DiscordEngagement
                WHERE date >= ${gte} AND date <= ${lte}
                GROUP BY discordId
                ORDER BY totalEngagementScore DESC
                LIMIT ${Number(limit)}
            `;

            return topUsers.map(user => ({
                    discordId: user.discordId,
                    username: user.username,
                    displayName: user.displayName,
                    totalMessages: Number(user.totalMessages),
                    totalReactionsGiven: Number(user.totalReactionsGiven),
                    totalReactionsReceived: Number(user.totalReactionsReceived),
                    totalHelpfulReactions: Number(user.totalHelpfulReactions),
                    totalEngagementScore: Math.round(Number(user.totalEngagementScore) * 100) / 100,
                    activeDays: Number(user.activeDays),
                }))
        } catch (error) {
            logger.error('[KPI Service] Error getting top engaged users:', error);
            return {
                msg: 'Failed to retrieve top engaged users',
                status: 500,
                data: null,
                error: true,
            };
        }
    }

    /**
     * Award engagement rank to a user
     */
    async awardEngagementRank(dto: any): Promise<any> {
        try {
            const { discordId, rank, reason, userId } = dto;

            const engagementRank = await prisma.engagementRank.create({
                data: {
                    discordId,
                    userId,
                    rank,
                    reason,
                    active: true,
                },
            });


            return engagementRank
        } catch (error) {
            logger.error('[KPI Service] Error awarding engagement rank:', error);
            return {
                msg: 'Failed to award engagement rank',
                status: 500,
                data: null,
                error: true,
            };
        }
    }
}
