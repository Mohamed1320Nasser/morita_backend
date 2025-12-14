/**
 * Seed Ticket Type Settings
 *
 * This script initializes default settings for all ticket types with grouping support
 * Run this after creating the TicketTypeSettings table
 *
 * Usage:
 *   npx ts-node src/scripts/seed-ticket-type-settings.ts
 */

import { PrismaClient, TicketType } from "@prisma/client";

const prisma = new PrismaClient();

// Shared welcome message for Services group
const SERVICES_WELCOME_MESSAGE = `🎮 **OSRS & RS3 Services You Can Trust - Quick, Secure, Professional!**

🚀 **Ready to Order? Here's the Fast Track!**

Getting started is quick and easy - follow these **5 simple steps** and we'll handle the rest!

🛒 **How It Works**

1️⃣ **Open a Ticket:** Click the button below to start your private order.
2️⃣ **Get a Quote:** Chat with {support} for a clear, competitive price.
3️⃣ **Pay Up:** Use any payment method listed on **!pm** to secure your spot.
4️⃣ **Meet Your Pro:** A vetted **worker** will be added to your ticket immediately.
5️⃣ **Done!** Your order will be completed **quickly and safely.**

✅ **Why Choose Our Team**
🔹 **100% Secure:** We use **Parsec/VPN** for safe logins.
🔹 **Keep Your Loot:** All drops and XP stay on your account. Period.
🔹 **Real Players:** Services are **100% hand-done** using **RuneLite only** - no bots.
🔹 **Stay Updated:** Get **hourly and daily progress updates.**
🔹 **Unmatched Trust:** Workers leave large **security deposits** - often worth **more than your bank!**

⚠️ **Heads Up on Pricing:**
Prices in <#SERVICE_PRICES_CHANNEL_ID> **don't include discounts.** Apply your discount manually, or open a ticket if you need help!

📜 **Terms of Service**
By creating a ticket, you automatically agree to our [Terms of Service](https://example.com/tos).`;

// Default settings for each ticket type
const TICKET_TYPE_SETTINGS = [
    // ========== SERVICES GROUP ==========
    {
        ticketType: TicketType.PURCHASE_SERVICES_OSRS,
        groupKey: "services",
        buttonLabel: "OSRS Services",
        buttonColor: "green",
        displayOrder: 1,
        welcomeTitle: "🎮 OSRS Service Request",
        welcomeMessage: SERVICES_WELCOME_MESSAGE,
        embedColor: "5865F2",
        customFields: {
            fields: [
                {
                    id: "service_description",
                    label: "What service do you need?",
                    type: "textarea",
                    required: true,
                    placeholder: "e.g., 1-99 Sailing, Quest Cape, Raids, etc.",
                    maxLength: 1000,
                },
                {
                    id: "osrs_username",
                    label: "OSRS Username",
                    type: "text",
                    required: false,
                    placeholder: "Your in-game username",
                    maxLength: 50,
                },
                {
                    id: "additional_notes",
                    label: "Additional Notes (Optional)",
                    type: "textarea",
                    required: false,
                    placeholder: "Any special requirements or details...",
                    maxLength: 500,
                },
            ],
        },
    },
    {
        ticketType: TicketType.PURCHASE_SERVICES_RS3,
        groupKey: "services",
        buttonLabel: "RS3 Services",
        buttonColor: "blue",
        displayOrder: 2,
        welcomeTitle: "🎮 RS3 Service Request",
        welcomeMessage: SERVICES_WELCOME_MESSAGE,
        embedColor: "5865F2",
        customFields: {
            fields: [
                {
                    id: "service_description",
                    label: "What service do you need?",
                    type: "textarea",
                    required: true,
                    placeholder: "e.g., 1-99 Archaeology, Quest completion, etc.",
                    maxLength: 1000,
                },
                {
                    id: "rs3_username",
                    label: "RS3 Username",
                    type: "text",
                    required: false,
                    placeholder: "Your in-game username",
                    maxLength: 50,
                },
                {
                    id: "additional_notes",
                    label: "Additional Notes (Optional)",
                    type: "textarea",
                    required: false,
                    placeholder: "Any special requirements...",
                    maxLength: 500,
                },
            ],
        },
    },

    // ========== BUY GOLD GROUP ==========
    {
        ticketType: TicketType.BUY_GOLD_OSRS,
        groupKey: "buy-gold",
        buttonLabel: "OSRS Gold",
        buttonColor: "green",
        displayOrder: 1,
        welcomeTitle: "💰 Buy OSRS Gold",
        welcomeMessage: `Hello {customer}!

Welcome to your OSRS gold purchase ticket. Our team ({support}) will process your order shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Amount of gold you want to purchase (in millions)
• Your OSRS username
• Preferred delivery method (Trade, Drop Party, etc.)
• World and location for delivery

Once we confirm the details and receive payment, we'll deliver your gold quickly and safely!`,
        embedColor: "F1C40F",
        customFields: {
            fields: [
                {
                    id: "gold_amount",
                    label: "How much gold do you need? (in millions)",
                    type: "number",
                    required: true,
                    placeholder: "e.g., 100 (for 100M)",
                    min: 1,
                    max: 100000,
                },
                {
                    id: "delivery_method",
                    label: "Preferred Delivery Method",
                    type: "text",
                    required: false,
                    placeholder: "F2P, P2P, Drop Trading, POH, etc.",
                    maxLength: 100,
                },
                {
                    id: "osrs_username",
                    label: "OSRS Username",
                    type: "text",
                    required: true,
                    placeholder: "Your in-game username",
                    maxLength: 50,
                },
                {
                    id: "additional_notes",
                    label: "Additional Notes (Optional)",
                    type: "textarea",
                    required: false,
                    placeholder: "Any special requirements...",
                    maxLength: 500,
                },
            ],
        },
    },
    {
        ticketType: TicketType.BUY_GOLD_RS3,
        groupKey: "buy-gold",
        buttonLabel: "RS3 Gold",
        buttonColor: "blue",
        displayOrder: 2,
        welcomeTitle: "💰 Buy RS3 Gold",
        welcomeMessage: `Hello {customer}!

Welcome to your RS3 gold purchase ticket. Our team ({support}) will process your order shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Amount of gold you want to purchase (in millions)
• Your RS3 username
• Preferred delivery method
• World and location for delivery

Once we confirm the details and receive payment, we'll deliver your gold quickly and safely!`,
        embedColor: "F1C40F",
        customFields: {
            fields: [
                {
                    id: "gold_amount",
                    label: "How much gold do you need? (in millions)",
                    type: "number",
                    required: true,
                    placeholder: "e.g., 100 (for 100M)",
                    min: 1,
                    max: 100000,
                },
                {
                    id: "delivery_method",
                    label: "Preferred Delivery Method",
                    type: "text",
                    required: false,
                    placeholder: "Trade, GE, etc.",
                    maxLength: 100,
                },
                {
                    id: "rs3_username",
                    label: "RS3 Username",
                    type: "text",
                    required: true,
                    placeholder: "Your in-game username",
                    maxLength: 50,
                },
                {
                    id: "additional_notes",
                    label: "Additional Notes (Optional)",
                    type: "textarea",
                    required: false,
                    placeholder: "Any special requirements...",
                    maxLength: 500,
                },
            ],
        },
    },

    // ========== SELL GOLD GROUP ==========
    {
        ticketType: TicketType.SELL_GOLD_OSRS,
        groupKey: "sell-gold",
        buttonLabel: "OSRS Gold",
        buttonColor: "green",
        displayOrder: 1,
        welcomeTitle: "💵 Sell OSRS Gold",
        welcomeMessage: `Hello {customer}!

Thank you for selling your OSRS gold to us. Our team ({support}) will assist you shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Amount of gold you want to sell (in millions)
• Your OSRS username
• Preferred payment method
• Payment details (PayPal email, crypto wallet, etc.)

We'll review your request and provide a quote!`,
        embedColor: "27AE60",
        customFields: {
            fields: [
                {
                    id: "gold_amount",
                    label: "How much gold do you want to sell? (in millions)",
                    type: "number",
                    required: true,
                    placeholder: "e.g., 500 (for 500M)",
                    min: 1,
                    max: 100000,
                },
                {
                    id: "payment_method",
                    label: "Preferred Payment Method",
                    type: "text",
                    required: true,
                    placeholder: "PayPal, Crypto, Bank Transfer, etc.",
                    maxLength: 100,
                },
                {
                    id: "osrs_username",
                    label: "OSRS Username",
                    type: "text",
                    required: true,
                    placeholder: "Your in-game username",
                    maxLength: 50,
                },
                {
                    id: "payment_details",
                    label: "Payment Details",
                    type: "textarea",
                    required: true,
                    placeholder: "PayPal email, crypto wallet address, etc.",
                    maxLength: 500,
                },
            ],
        },
    },
    {
        ticketType: TicketType.SELL_GOLD_RS3,
        groupKey: "sell-gold",
        buttonLabel: "RS3 Gold",
        buttonColor: "blue",
        displayOrder: 2,
        welcomeTitle: "💵 Sell RS3 Gold",
        welcomeMessage: `Hello {customer}!

Thank you for selling your RS3 gold to us. Our team ({support}) will assist you shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Amount of gold you want to sell (in millions)
• Your RS3 username
• Preferred payment method
• Payment details (PayPal email, crypto wallet, etc.)

We'll review your request and provide a quote!`,
        embedColor: "27AE60",
        customFields: {
            fields: [
                {
                    id: "gold_amount",
                    label: "How much gold do you want to sell? (in millions)",
                    type: "number",
                    required: true,
                    placeholder: "e.g., 500 (for 500M)",
                    min: 1,
                    max: 100000,
                },
                {
                    id: "payment_method",
                    label: "Preferred Payment Method",
                    type: "text",
                    required: true,
                    placeholder: "PayPal, Crypto, Bank Transfer, etc.",
                    maxLength: 100,
                },
                {
                    id: "rs3_username",
                    label: "RS3 Username",
                    type: "text",
                    required: true,
                    placeholder: "Your in-game username",
                    maxLength: 50,
                },
                {
                    id: "payment_details",
                    label: "Payment Details",
                    type: "textarea",
                    required: true,
                    placeholder: "PayPal email, crypto wallet address, etc.",
                    maxLength: 500,
                },
            ],
        },
    },

    // ========== CRYPTO SWAP (SINGLE TYPE) ==========
    {
        ticketType: TicketType.SWAP_CRYPTO,
        groupKey: "crypto-swap",
        buttonLabel: "Crypto Swap",
        buttonColor: "orange",
        displayOrder: 1,
        welcomeTitle: "🔄 Cryptocurrency Swap",
        welcomeMessage: `Hello {customer}!

Welcome to your crypto swap ticket. Our team ({support}) will process your request shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• What cryptocurrency do you want to swap FROM?
• What cryptocurrency do you want to swap TO?
• Amount you want to swap
• Your wallet address for receiving funds

We'll provide you with a competitive rate and handle your swap securely!`,
        embedColor: "E67E22",
        customFields: {
            fields: [
                {
                    id: "crypto_from",
                    label: "Cryptocurrency FROM",
                    type: "text",
                    required: true,
                    placeholder: "e.g., Bitcoin (BTC)",
                    maxLength: 50,
                },
                {
                    id: "crypto_to",
                    label: "Cryptocurrency TO",
                    type: "text",
                    required: true,
                    placeholder: "e.g., Ethereum (ETH)",
                    maxLength: 50,
                },
                {
                    id: "crypto_amount",
                    label: "Amount to Swap",
                    type: "text",
                    required: true,
                    placeholder: "e.g., 0.5 BTC",
                    maxLength: 100,
                },
                {
                    id: "wallet_address",
                    label: "Receiving Wallet Address",
                    type: "text",
                    required: true,
                    placeholder: "Your wallet address for receiving funds",
                    maxLength: 200,
                },
            ],
        },
    },

    // ========== GENERAL SUPPORT (SINGLE TYPE) ==========
    {
        ticketType: TicketType.GENERAL,
        groupKey: "general",
        buttonLabel: "General Support",
        buttonColor: "gray",
        displayOrder: 1,
        welcomeTitle: "💬 General Support Ticket",
        welcomeMessage: `Hello {customer}!

Thank you for contacting support. Our team ({support}) will assist you shortly.

**Ticket ID:** #{ticket_id}

Please describe your issue or question in detail, and we'll get back to you as soon as possible.`,
        embedColor: "95A5A6",
        customFields: {
            fields: [
                {
                    id: "subject",
                    label: "Subject",
                    type: "text",
                    required: true,
                    placeholder: "Brief description of your issue",
                    maxLength: 200,
                },
                {
                    id: "description",
                    label: "Description",
                    type: "textarea",
                    required: true,
                    placeholder: "Please provide details about your issue or question...",
                    maxLength: 2000,
                },
            ],
        },
    },
];

async function main() {
    console.log("🌱 Seeding ticket type settings...");

    for (const settings of TICKET_TYPE_SETTINGS) {
        try {
            const result = await prisma.ticketTypeSettings.upsert({
                where: { ticketType: settings.ticketType },
                update: settings,
                create: settings,
            });

            console.log(`✅ ${settings.ticketType}: ${result.welcomeTitle}`);
        } catch (error) {
            console.error(`❌ Failed to seed ${settings.ticketType}:`, error);
        }
    }

    console.log("\n✨ Seeding completed!");
}

main()
    .catch((e) => {
        console.error("❌ Error during seeding:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
