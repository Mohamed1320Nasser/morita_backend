import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { Service } from "typedi";

const prisma = new PrismaClient();

@Service()
export class GoldRatesService {
    /**
     * Get current gold rates
     */
    async getRates() {
        const config = await prisma.goldRateConfig.findUnique({
            where: { id: "default" },
        });

        if (!config) {
            // Return default rates if not set
            return {
                buyRate: "0.00",
                sellRate: "0.00",
                channelId: null,
                messageId: null,
                updatedAt: new Date(),
            };
        }

        return {
            buyRate: config.buyRate.toString(),
            sellRate: config.sellRate.toString(),
            channelId: config.channelId,
            messageId: config.messageId,
            updatedAt: config.updatedAt,
        };
    }

    /**
     * Update gold rates
     */
    async updateRates(data: {
        buyRate?: number;
        sellRate?: number;
        channelId?: string;
        messageId?: string;
    }) {
        const updateData: any = {};

        if (data.buyRate !== undefined) {
            updateData.buyRate = new Decimal(data.buyRate);
        }
        if (data.sellRate !== undefined) {
            updateData.sellRate = new Decimal(data.sellRate);
        }
        if (data.channelId !== undefined) {
            updateData.channelId = data.channelId;
        }
        if (data.messageId !== undefined) {
            updateData.messageId = data.messageId;
        }

        const config = await prisma.goldRateConfig.upsert({
            where: { id: "default" },
            create: {
                id: "default",
                buyRate: new Decimal(data.buyRate || 0),
                sellRate: new Decimal(data.sellRate || 0),
                channelId: data.channelId || null,
                messageId: data.messageId || null,
            },
            update: updateData,
        });

        return {
            buyRate: config.buyRate.toString(),
            sellRate: config.sellRate.toString(),
            channelId: config.channelId,
            messageId: config.messageId,
            updatedAt: config.updatedAt,
        };
    }

    /**
     * Calculate price with upcharge for a payment method
     */
    calculatePriceWithUpcharge(baseRate: number, upchargePercent: number): number {
        const upcharge = baseRate * (upchargePercent / 100);
        return baseRate + upcharge;
    }

    /**
     * Get all payment methods with calculated rates
     */
    async getAllPaymentMethodsWithRates() {
        const rates = await this.getRates();
        const buyRate = parseFloat(rates.buyRate);
        const sellRate = parseFloat(rates.sellRate);

        // Get crypto wallets
        const cryptoWallets = await prisma.cryptoWallet.findMany({
            where: { isActive: true },
            orderBy: { currency: "asc" },
        });

        // Get manual payment options
        const manualPayments = await prisma.manualPaymentOption.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
        });

        // Calculate rates for crypto
        const cryptoRates = cryptoWallets.map((wallet) => ({
            id: wallet.id,
            name: wallet.name,
            currency: wallet.currency,
            network: wallet.network,
            type: "crypto" as const,
            upchargePercent: parseFloat(wallet.upchargePercent.toString()),
            buyRate: this.calculatePriceWithUpcharge(buyRate, parseFloat(wallet.upchargePercent.toString())),
            sellRate: this.calculatePriceWithUpcharge(sellRate, parseFloat(wallet.upchargePercent.toString())),
        }));

        // Calculate rates for manual payments
        const manualRates = manualPayments.map((payment) => ({
            id: payment.id,
            name: payment.name,
            icon: payment.icon || "💳",
            type: "manual" as const,
            upchargePercent: parseFloat(payment.upchargePercent.toString()),
            buyRate: this.calculatePriceWithUpcharge(buyRate, parseFloat(payment.upchargePercent.toString())),
            sellRate: this.calculatePriceWithUpcharge(sellRate, parseFloat(payment.upchargePercent.toString())),
        }));

        return {
            baseBuyRate: buyRate,
            baseSellRate: sellRate,
            crypto: cryptoRates,
            manual: manualRates,
        };
    }
}
