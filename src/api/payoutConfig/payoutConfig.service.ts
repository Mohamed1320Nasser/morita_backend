import { Service } from "typedi";
import { CreatePayoutConfigDto } from "./dtos";
import { Decimal } from "@prisma/client/runtime/library";
import prisma from "../../common/prisma/client";

@Service()
export default class PayoutConfigService {
    async getActive() {
        const config = await prisma.payoutConfig.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });

        return config;
    }

    async getAll() {
        const configs = await prisma.payoutConfig.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                creator: {
                    select: {
                        id: true,
                        username: true,
                        fullname: true,
                        discordDisplayName: true
                    }
                },
                updater: {
                    select: {
                        id: true,
                        username: true,
                        fullname: true,
                        discordDisplayName: true
                    }
                }
            }
        });

        return configs;
    }

    async upsert(data: CreatePayoutConfigDto, userId: number) {
        const total = data.workerPercentage + data.supportPercentage + data.systemPercentage;
        if (total !== 100) {
            throw new Error("Percentages must sum to 100");
        }

        await prisma.payoutConfig.updateMany({
            where: { isActive: true },
            data: { isActive: false, updatedBy: userId }
        });

        const newConfig = await prisma.payoutConfig.create({
            data: {
                workerPercentage: new Decimal(data.workerPercentage),
                supportPercentage: new Decimal(data.supportPercentage),
                systemPercentage: new Decimal(data.systemPercentage),
                isActive: true,
                createdBy: userId,
                updatedBy: userId
            }
        });

        return newConfig;
    }

    async toggleActive(id: string) {
        const config = await prisma.payoutConfig.findUnique({
            where: { id }
        });

        if (!config) {
            throw new Error("Config not found");
        }

        const updated = await prisma.payoutConfig.update({
            where: { id },
            data: { isActive: !config.isActive }
        });

        return updated;
    }

    async getPayoutPercentagesAsDecimals() {
        const config = await this.getActive();

        if (!config) {
            return {
                workerPercentage: new Decimal(80),
                supportPercentage: new Decimal(5),
                systemPercentage: new Decimal(15)
            };
        }

        return {
            workerPercentage: config.workerPercentage,
            supportPercentage: config.supportPercentage,
            systemPercentage: config.systemPercentage
        };
    }
}
