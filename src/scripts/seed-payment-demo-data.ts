#!/usr/bin/env node

import { PrismaClient, ManualPaymentType } from "@prisma/client";
import logger from "../common/loggers";

const prisma = new PrismaClient();

// Demo crypto wallets
const demoCryptoWallets = [
    {
        name: "Bitcoin Wallet",
        currency: "BTC",
        network: "bitcoin",
        address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        isActive: true,
    },
    {
        name: "Litecoin Wallet",
        currency: "LTC",
        network: "litecoin",
        address: "LdMVDpHSgWfc3AbJ9CAAwXkqs9DWGfTaky",
        isActive: true,
    },
    {
        name: "Ethereum Wallet",
        currency: "ETH",
        network: "ethereum",
        address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
        isActive: true,
    },
    {
        name: "USDT (TRC20)",
        currency: "USDT",
        network: "tron",
        address: "TN8RtFXeQZyFHGmH1iiSRm5r4CRz1yWkCf",
        isActive: true,
    },
    {
        name: "USDC (ERC20)",
        currency: "USDC",
        network: "ethereum",
        address: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
        isActive: true,
    },
    {
        name: "Solana Wallet",
        currency: "SOL",
        network: "solana",
        address: "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
        isActive: true,
    },
];

// Demo manual payment options (all types)
const demoPaymentOptions = [
    {
        name: "PayPal",
        type: ManualPaymentType.PAYPAL,
        icon: "💳",
        details: {
            email: "payments@morita.com",
            paypalMe: "MoritaPayments",
        },
        instructions: "Send as Friends & Family to avoid fees. Include your Discord username in the note.",
        sortOrder: 1,
    },
    {
        name: "Zelle",
        type: ManualPaymentType.ZELLE,
        icon: "🏦",
        details: {
            email: "zelle@morita.com",
            phone: "+1 (555) 123-4567",
            bankName: "Chase Bank",
        },
        instructions: "Send to the email or phone number. Include your Discord username in the memo.",
        sortOrder: 2,
    },
    {
        name: "Wise (TransferWise)",
        type: ManualPaymentType.WISE,
        icon: "💸",
        details: {
            email: "wise@morita.com",
            accountHolder: "Morita Services LLC",
        },
        instructions: "Send via Wise transfer. Lower fees for international payments.",
        sortOrder: 3,
    },
    {
        name: "Revolut",
        type: ManualPaymentType.REVOLUT,
        icon: "🔄",
        details: {
            username: "@MoritaPayments",
            phone: "+44 7700 900000",
        },
        instructions: "Send via Revolut app using the username or phone number.",
        sortOrder: 4,
    },
    {
        name: "E-Transfer (Canada)",
        type: ManualPaymentType.E_TRANSFER,
        icon: "📧",
        details: {
            email: "etransfer@morita.com",
            securityQuestion: "What is the service name?",
            securityAnswer: "morita",
        },
        instructions: "For Canadian customers. Use Interac e-Transfer with the security question provided.",
        sortOrder: 5,
    },
    {
        name: "CashApp",
        type: ManualPaymentType.CASHAPP,
        icon: "💵",
        details: {
            cashtag: "$MoritaServices",
        },
        instructions: "Send via CashApp. Include your Discord username in the note.",
        sortOrder: 6,
    },
    {
        name: "Venmo",
        type: ManualPaymentType.VENMO,
        icon: "📱",
        details: {
            username: "@Morita-Services",
        },
        instructions: "Send via Venmo. Make sure to include your Discord username.",
        sortOrder: 7,
    },
    {
        name: "Bank Transfer (Wire)",
        type: ManualPaymentType.OTHER,
        icon: "🏛️",
        details: {
            customLabel: "Bank Details",
            customValue: "Contact support for bank wire details (orders over $500)",
        },
        instructions: "For large orders. Contact support to get bank wire transfer details.",
        sortOrder: 8,
    },
];

async function seedPaymentDemoData() {
    logger.info("Starting payment demo data seed...");

    try {
        // Seed Crypto Wallets
        logger.info("Seeding crypto wallets...");
        for (const wallet of demoCryptoWallets) {
            const existing = await prisma.cryptoWallet.findFirst({
                where: { address: wallet.address },
            });

            if (existing) {
                logger.info(`  Crypto wallet already exists: ${wallet.name}`);
                continue;
            }

            await prisma.cryptoWallet.create({
                data: wallet,
            });
            logger.info(`  Created crypto wallet: ${wallet.name} (${wallet.currency})`);
        }
        logger.info(`Seeded ${demoCryptoWallets.length} crypto wallets`);

        // Seed Manual Payment Options
        logger.info("Seeding manual payment options...");
        for (const option of demoPaymentOptions) {
            const existing = await prisma.manualPaymentOption.findFirst({
                where: { type: option.type },
            });

            if (existing) {
                logger.info(`  Payment option already exists: ${option.name}`);
                continue;
            }

            await prisma.manualPaymentOption.create({
                data: option,
            });
            logger.info(`  Created payment option: ${option.name} (${option.type})`);
        }
        logger.info(`Seeded ${demoPaymentOptions.length} payment options`);

        // Summary
        const walletCount = await prisma.cryptoWallet.count();
        const paymentCount = await prisma.manualPaymentOption.count();

        logger.info("=".repeat(50));
        logger.info("Payment Demo Data Seed Complete!");
        logger.info(`  Total Crypto Wallets: ${walletCount}`);
        logger.info(`  Total Payment Options: ${paymentCount}`);
        logger.info("=".repeat(50));

    } catch (error) {
        logger.error("Error seeding payment demo data:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the seed
seedPaymentDemoData()
    .then(() => {
        logger.info("Seed completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        logger.error("Seed failed:", error);
        process.exit(1);
    });
