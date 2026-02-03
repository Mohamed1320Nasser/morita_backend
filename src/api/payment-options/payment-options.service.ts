import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { BadRequestError, NotFoundError } from "routing-controllers";
import logger from "../../common/loggers";
import { ManualPaymentType } from "@prisma/client";
import axios from "axios";

// Default icons for each payment type
const DEFAULT_ICONS: Record<ManualPaymentType, string> = {
    PAYPAL: "💳",
    ZELLE: "🏦",
    WISE: "💸",
    REVOLUT: "🔄",
    E_TRANSFER: "📧",
    CASHAPP: "💵",
    VENMO: "📱",
    OTHER: "💰",
};

// Required fields for each payment type
const PAYMENT_TYPE_FIELDS: Record<ManualPaymentType, { required: string[]; optional: string[] }> = {
    PAYPAL: { required: ["email"], optional: ["paypalMe"] },
    ZELLE: { required: [], optional: ["email", "phone", "bankName"] }, // At least one of email/phone required
    WISE: { required: ["email"], optional: ["accountHolder"] },
    REVOLUT: { required: [], optional: ["username", "phone"] }, // At least one required
    E_TRANSFER: { required: ["email"], optional: ["securityQuestion", "securityAnswer"] },
    CASHAPP: { required: ["cashtag"], optional: [] },
    VENMO: { required: ["username"], optional: [] },
    OTHER: { required: ["customLabel", "customValue"], optional: [] },
};

@Service()
export default class PaymentOptionsService {
    constructor() {}

    // ==================== Payment Options CRUD ====================

    async getAllPaymentOptions() {
        const options = await prisma.manualPaymentOption.findMany({
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        });
        return options;
    }

    async getActivePaymentOptions() {
        const options = await prisma.manualPaymentOption.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        });
        return options;
    }

    async getPaymentOptionById(id: string) {
        const option = await prisma.manualPaymentOption.findUnique({ where: { id } });
        if (!option) {
            throw new NotFoundError("Payment option not found");
        }
        return option;
    }

    async createPaymentOption(data: {
        name: string;
        type: ManualPaymentType;
        icon?: string;
        details: Record<string, any>;
        instructions?: string;
        upchargePercent?: number;
    }) {
        // Validate details based on type
        this.validateDetails(data.type, data.details);

        // Get max sort order
        const maxOrder = await prisma.manualPaymentOption.aggregate({
            _max: { sortOrder: true },
        });

        const option = await prisma.manualPaymentOption.create({
            data: {
                name: data.name,
                type: data.type,
                icon: data.icon || DEFAULT_ICONS[data.type],
                details: data.details,
                instructions: data.instructions,
                sortOrder: (maxOrder._max.sortOrder || 0) + 1,
                upchargePercent: data.upchargePercent || 0,
            },
        });

        logger.info(`[PaymentOptions] Created payment option: ${option.name} (${option.type})`);
        return option;
    }

    async updatePaymentOption(
        id: string,
        data: {
            name?: string;
            type?: ManualPaymentType;
            icon?: string;
            details?: Record<string, any>;
            instructions?: string;
            isActive?: boolean;
            sortOrder?: number;
            upchargePercent?: number;
        }
    ) {
        const existing = await this.getPaymentOptionById(id);

        // Validate details if updating
        if (data.details) {
            const type = data.type || existing.type;
            this.validateDetails(type, data.details);
        }

        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.type !== undefined) updateData.type = data.type;
        if (data.icon !== undefined) updateData.icon = data.icon;
        if (data.details !== undefined) updateData.details = data.details;
        if (data.instructions !== undefined) updateData.instructions = data.instructions;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
        if (data.upchargePercent !== undefined) updateData.upchargePercent = data.upchargePercent;

        const option = await prisma.manualPaymentOption.update({
            where: { id },
            data: updateData,
        });

        logger.info(`[PaymentOptions] Updated payment option: ${option.name}`);
        return option;
    }

    async deletePaymentOption(id: string) {
        await this.getPaymentOptionById(id); // Check exists

        await prisma.manualPaymentOption.delete({ where: { id } });
        logger.info(`[PaymentOptions] Deleted payment option: ${id}`);
        return { success: true };
    }

    async reorderPaymentOptions(orders: { id: string; sortOrder: number }[]) {
        const updates = orders.map((order) =>
            prisma.manualPaymentOption.update({
                where: { id: order.id },
                data: { sortOrder: order.sortOrder },
            })
        );

        await prisma.$transaction(updates);
        logger.info(`[PaymentOptions] Reordered ${orders.length} payment options`);
        return { success: true };
    }

    // ==================== Discord Config ====================

    async getDiscordConfig() {
        let config = await prisma.paymentDiscordConfig.findUnique({
            where: { id: "default" },
        });

        // Create default config if doesn't exist
        if (!config) {
            config = await prisma.paymentDiscordConfig.create({
                data: { id: "default" },
            });
        }

        return config;
    }

    async updateDiscordConfig(data: {
        title?: string;
        description?: string;
        color?: string;
        bannerUrl?: string;
        thumbnailUrl?: string;
        cryptoButtonLabel?: string;
        cryptoButtonStyle?: string;
        paymentButtonLabel?: string;
        paymentButtonStyle?: string;
        footerText?: string;
    }) {
        // Ensure config exists
        await this.getDiscordConfig();

        const config = await prisma.paymentDiscordConfig.update({
            where: { id: "default" },
            data,
        });

        logger.info(`[PaymentOptions] Updated Discord config`);
        return config;
    }

    // ==================== Helpers ====================

    private validateDetails(type: ManualPaymentType, details: Record<string, any>) {
        const fields = PAYMENT_TYPE_FIELDS[type];

        // Check required fields
        for (const field of fields.required) {
            if (!details[field] || (typeof details[field] === "string" && !details[field].trim())) {
                throw new BadRequestError(`Field "${field}" is required for ${type}`);
            }
        }

        // Special validation for types that need at least one of multiple fields
        if (type === "ZELLE") {
            if (!details.email && !details.phone) {
                throw new BadRequestError("Zelle requires either email or phone number");
            }
        }

        if (type === "REVOLUT") {
            if (!details.username && !details.phone) {
                throw new BadRequestError("Revolut requires either username or phone number");
            }
        }
    }

    // Get payment type info (for frontend)
    getPaymentTypes() {
        return Object.entries(PAYMENT_TYPE_FIELDS).map(([type, fields]) => ({
            type,
            icon: DEFAULT_ICONS[type as ManualPaymentType],
            requiredFields: fields.required,
            optionalFields: fields.optional,
        }));
    }

    // ==================== Publish to Discord ====================

    async publishToDiscord() {
        const botApiUrl = process.env.BOT_API_URL || "http://localhost:3002";

        try {
            const response = await axios.post(`${botApiUrl}/discord/channels/publish/payments`, {
                clearAllMessages: false,
            });

            if (!response.data.success) {
                throw new BadRequestError(response.data.error || "Failed to publish to Discord");
            }

            logger.info("[PaymentOptions] Published payment message to Discord");

            return {
                success: true,
                message: "Payment message published to Discord successfully",
            };
        } catch (error: any) {
            logger.error("[PaymentOptions] Failed to publish to Discord:", error.message);

            if (error.response?.data?.error) {
                throw new BadRequestError(error.response.data.error);
            }

            throw new BadRequestError(error.message || "Failed to publish to Discord");
        }
    }
}
