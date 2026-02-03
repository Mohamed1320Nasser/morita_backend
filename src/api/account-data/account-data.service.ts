import prisma from "../../common/prisma/client";
import { encrypt, decrypt } from "../../common/utils/encryption.util";

export class AccountDataService {
    async getAccountTypes() {
        return prisma.accountTypeTemplate.findMany({
            where: { isActive: true },
            include: { questions: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
        });
    }

    async getAccountType(slug: string) {
        const template = await prisma.accountTypeTemplate.findUnique({
            where: { slug },
            include: { questions: { orderBy: { sortOrder: "asc" } } },
        });
        if (!template) throw new Error("Account type not found");
        return template;
    }

    async initDefaultTypes() {
        const existing = await prisma.accountTypeTemplate.count();
        if (existing > 0) {
            throw new Error("Account types already exist");
        }

        await prisma.accountTypeTemplate.create({
            data: {
                name: "Normal Legacy",
                slug: "normal_legacy",
                sortOrder: 1,
                questions: {
                    create: [
                        { fieldName: "username", label: "Username/Email", isRequired: true, sortOrder: 1 },
                        { fieldName: "password", label: "Password", isRequired: true, sortOrder: 2 },
                        { fieldName: "bank_pin", label: "Bank PIN", isRequired: false, sortOrder: 3 },
                        { fieldName: "bank_value", label: "Bank Value", isRequired: false, sortOrder: 4 },
                    ],
                },
            },
        });

        await prisma.accountTypeTemplate.create({
            data: {
                name: "Jagex Launcher",
                slug: "jagex_launcher",
                sortOrder: 2,
                questions: {
                    create: [
                        { fieldName: "username", label: "Username/Email", isRequired: true, sortOrder: 1 },
                        { fieldName: "password", label: "Password", isRequired: true, sortOrder: 2 },
                        { fieldName: "bank_pin", label: "Bank PIN", isRequired: false, sortOrder: 3 },
                        { fieldName: "bank_value", label: "Bank Value", isRequired: false, sortOrder: 4 },
                        { fieldName: "in_game_name", label: "In-Game Name", isRequired: false, sortOrder: 5 },
                        { fieldName: "backup_codes", label: "Backup Codes", isRequired: false, sortOrder: 6 },
                    ],
                },
            },
        });

        return { success: true };
    }

    async addAccountType(name: string) {
        const slug = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

        const existing = await prisma.accountTypeTemplate.findUnique({ where: { slug } });
        if (existing) throw new Error(`Account type with slug '${slug}' already exists`);

        const maxOrder = await prisma.accountTypeTemplate.aggregate({ _max: { sortOrder: true } });

        return prisma.accountTypeTemplate.create({
            data: {
                name,
                slug,
                sortOrder: (maxOrder._max.sortOrder || 0) + 1,
            },
        });
    }

    async addQuestion(typeSlug: string, fieldName: string, label: string, isRequired: boolean, placeholder?: string) {
        const template = await prisma.accountTypeTemplate.findUnique({ where: { slug: typeSlug } });
        if (!template) throw new Error("Account type not found");

        const maxOrder = await prisma.accountQuestion.aggregate({
            where: { templateId: template.id },
            _max: { sortOrder: true },
        });

        return prisma.accountQuestion.create({
            data: {
                templateId: template.id,
                fieldName: fieldName.toLowerCase().replace(/\s+/g, "_"),
                label,
                isRequired,
                placeholder,
                sortOrder: (maxOrder._max.sortOrder || 0) + 1,
            },
        });
    }

    async deleteAccountType(slug: string) {
        const template = await prisma.accountTypeTemplate.findUnique({ where: { slug } });
        if (!template) throw new Error("Account type not found");

        await prisma.accountTypeTemplate.delete({ where: { id: template.id } });
        return { success: true };
    }

    async getOrderAccountData(orderId: string) {
        return prisma.orderAccountData.findUnique({ where: { orderId } });
    }

    async submitAccountData(orderId: string, accountType: string, data: Record<string, string>, submittedBy: string) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true, accountData: true },
        });

        if (!order) throw new Error("Order not found");
        if (order.customer.discordId !== submittedBy) {
            throw new Error("Only the customer can submit account data");
        }
        if (order.accountData) {
            throw new Error("Account data already submitted");
        }

        const encryptedData = encrypt(JSON.stringify(data));

        return prisma.orderAccountData.create({
            data: {
                orderId,
                accountType,
                encryptedData,
                submittedBy,
            },
        });
    }

    async viewAccountData(orderId: string, viewerDiscordId: string) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: true,
                worker: true,
                support: true,
                accountData: true,
            },
        });

        if (!order) throw new Error("Order not found");
        if (!order.accountData) throw new Error("No account data submitted");
        if (order.accountData.isClaimed) {
            throw new Error(`Data already claimed by ${order.accountData.claimedByRole} on ${order.accountData.claimedAt}`);
        }

        const isWorker = order.worker?.discordId === viewerDiscordId;
        const isSupport = order.support?.discordId === viewerDiscordId;

        // Check if viewer is a staff member in database (admin role)
        const viewer = await prisma.user.findUnique({
            where: { discordId: viewerDiscordId },
        });
        const isStaff = viewer?.role === "admin";

        if (!isWorker && !isSupport && !isStaff) {
            throw new Error("Only assigned worker or support can view account data");
        }

        const decryptedData = JSON.parse(decrypt(order.accountData.encryptedData));
        const claimedByRole = isWorker ? "worker" : "support";

        await prisma.orderAccountData.update({
            where: { id: order.accountData.id },
            data: {
                isClaimed: true,
                claimedAt: new Date(),
                claimedBy: viewerDiscordId,
                claimedByRole,
            },
        });

        const template = await prisma.accountTypeTemplate.findUnique({
            where: { slug: order.accountData.accountType },
            include: { questions: true },
        });

        const fieldLabels: Record<string, string> = {};
        template?.questions.forEach((q) => {
            fieldLabels[q.fieldName] = q.label;
        });

        const fields = Object.entries(decryptedData)
            .filter(([_, value]) => value)
            .map(([key, value]) => ({
                label: fieldLabels[key] || key,
                value: value as string,
            }));

        return {
            orderNumber: order.orderNumber,
            fields,
            accountTypeName: template?.name || order.accountData.accountType,
            submittedBy: order.accountData.submittedBy,
            claimedBy: viewerDiscordId,
            claimedByRole,
        };
    }

    async canSubmitAccountData(orderId: string, discordId: string) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true, accountData: true },
        });

        if (!order) return { canSubmit: false, reason: "Order not found" };
        if (order.customer.discordId !== discordId) return { canSubmit: false, reason: "Not the customer" };
        if (order.accountData) return { canSubmit: false, reason: "Already submitted" };

        return { canSubmit: true, orderNumber: order.orderNumber };
    }

    async canViewAccountData(orderId: string, discordId: string) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { worker: true, support: true, accountData: true },
        });

        if (!order) return { canView: false, reason: "Order not found" };
        if (!order.accountData) return { canView: false, reason: "No data submitted" };
        if (order.accountData.isClaimed) {
            return {
                canView: false,
                reason: `Account data already claimed by <@${order.accountData.claimedBy}> (${order.accountData.claimedByRole}) on <t:${Math.floor(order.accountData.claimedAt!.getTime() / 1000)}:F>.`,
            };
        }

        const isWorker = order.worker?.discordId === discordId;
        const isSupport = order.support?.discordId === discordId;

        // Check if viewer is a staff member in database (admin role)
        const viewer = await prisma.user.findUnique({
            where: { discordId },
        });
        const isStaff = viewer?.role === "admin";

        if (!isWorker && !isSupport && !isStaff) {
            return { canView: false, reason: "Only the assigned worker or support can view account data." };
        }

        return { canView: true };
    }

    async getAllAccountTypesWithQuestions() {
        return prisma.accountTypeTemplate.findMany({
            include: { questions: { orderBy: { sortOrder: "asc" } } },
            orderBy: { sortOrder: "asc" },
        });
    }
}

export const accountDataService = new AccountDataService();
