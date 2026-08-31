import "reflect-metadata";
import prisma from "../common/prisma/client";
import logger from "../common/loggers";

const APPLY = process.argv.includes("--apply");
const SKIP_BACKUP_CHECK = process.argv.includes("--i-have-a-backup");

type Step = { label: string; count: () => Promise<number>; run: () => Promise<unknown> };

const steps: Step[] = [
    {
        label: "OrderAccountData",
        count: () => prisma.orderAccountData.count(),
        run: () => prisma.orderAccountData.deleteMany({}),
    },
    {
        label: "OrderRewardClaim",
        count: () => prisma.orderRewardClaim.count(),
        run: () => prisma.orderRewardClaim.deleteMany({}),
    },
    {
        label: "OrderStatusHistory",
        count: () => prisma.orderStatusHistory.count(),
        run: () => prisma.orderStatusHistory.deleteMany({}),
    },
    {
        label: "OrderIssue",
        count: () => prisma.orderIssue.count(),
        run: () => prisma.orderIssue.deleteMany({}),
    },
    {
        label: "OrderService",
        count: () => prisma.orderService.count(),
        run: () => prisma.orderService.deleteMany({}),
    },
    {
        label: "WorkerFeedback",
        count: () => prisma.workerFeedback.count(),
        run: () => prisma.workerFeedback.deleteMany({}),
    },
    {
        label: "WalletTransaction",
        count: () => prisma.walletTransaction.count(),
        run: () => prisma.walletTransaction.deleteMany({}),
    },
    {
        label: "CryptoTransaction",
        count: () => prisma.cryptoTransaction.count(),
        run: () => prisma.cryptoTransaction.deleteMany({}),
    },
    {
        label: "Transaction",
        count: () => prisma.transaction.count(),
        run: () => prisma.transaction.deleteMany({}),
    },
    {
        label: "Order",
        count: () => prisma.order.count(),
        run: () => prisma.order.deleteMany({}),
    },
    {
        label: "TicketMessage",
        count: () => prisma.ticketMessage.count(),
        run: () => prisma.ticketMessage.deleteMany({}),
    },
    {
        label: "TicketMetadata",
        count: () => prisma.ticketMetadata.count(),
        run: () => prisma.ticketMetadata.deleteMany({}),
    },
    {
        label: "Ticket",
        count: () => prisma.ticket.count(),
        run: () => prisma.ticket.deleteMany({}),
    },
    {
        label: "ReferralReward",
        count: () => prisma.referralReward.count(),
        run: () => prisma.referralReward.deleteMany({}),
    },
    {
        label: "ReferralMilestone",
        count: () => prisma.referralMilestone.count(),
        run: () => prisma.referralMilestone.deleteMany({}),
    },
    {
        label: "Referral",
        count: () => prisma.referral.count(),
        run: () => prisma.referral.deleteMany({}),
    },
    {
        label: "DailyRewardClaim",
        count: () => prisma.dailyRewardClaim.count(),
        run: () => prisma.dailyRewardClaim.deleteMany({}),
    },
    {
        label: "DiscordInvite",
        count: () => prisma.discordInvite.count(),
        run: () => prisma.discordInvite.deleteMany({}),
    },
    {
        label: "LoyaltyTierHistory",
        count: () => prisma.loyaltyTierHistory.count(),
        run: () => prisma.loyaltyTierHistory.deleteMany({}),
    },
    {
        label: "DiscordEngagement",
        count: () => prisma.discordEngagement.count(),
        run: () => prisma.discordEngagement.deleteMany({}),
    },
    {
        label: "MemberActivity",
        count: () => prisma.memberActivity.count(),
        run: () => prisma.memberActivity.deleteMany({}),
    },
    {
        label: "MentionTracker",
        count: () => prisma.mentionTracker.count(),
        run: () => prisma.mentionTracker.deleteMany({}),
    },
];

async function preview() {
    const rows: Array<{ table: string; deleting: number }> = [];
    for (const step of steps) {
        rows.push({ table: step.label, deleting: await step.count() });
    }

    const wallets = await prisma.wallet.count();
    const nonZero = await prisma.wallet.count({
        where: { OR: [{ balance: { not: 0 } }, { pendingBalance: { not: 0 } }, { deposit: { not: 0 } }] },
    });
    const users = await prisma.user.count();
    const ranked = await prisma.user.count({ where: { OR: [{ loyaltyTierId: { not: null } }, { totalSpent: { not: 0 } }] } });

    console.log("\n=== DELETE ===");
    console.table(rows.filter(r => r.deleting > 0));
    const untouched = rows.filter(r => r.deleting === 0).map(r => r.table);
    if (untouched.length) console.log(`(already empty: ${untouched.join(", ")})`);

    console.log("\n=== RESET IN PLACE ===");
    console.table([
        { table: "Wallet", detail: `${nonZero} of ${wallets} wallets have a non-zero balance` },
        { table: "User", detail: `${ranked} of ${users} users have a tier or totalSpent` },
        { table: "SystemWallet", detail: "balance -> 0" },
        { table: "EngagementRank", detail: "counters -> 0" },
    ]);

    console.log("\n=== PRESERVED ===");
    console.log(
        [
            "User accounts, roles, Discord links",
            "Account + AccountImage (inventory)",
            "Service, ServiceCategory, PricingMethod, PricingModifier, MethodPrice",
            "PaymentMethod, ManualPaymentOption, CryptoWallet, GoldRateConfig",
            "LoyaltyTier definitions, reward configs, TermsOfService, onboarding questions",
            "BrandingSetting, Discord channel settings",
        ]
            .map(l => "  - " + l)
            .join("\n")
    );
}

async function apply() {
    const summary: Array<{ step: string; removed: number }> = [];

    for (const step of steps) {
        const before = await step.count();
        if (before === 0) continue;
        const result: any = await step.run();
        summary.push({ step: step.label, removed: result?.count ?? before });
        logger.info(`[Reset] ${step.label}: removed ${result?.count ?? before}`);
    }

    const wallets = await prisma.wallet.updateMany({
        data: { balance: 0, pendingBalance: 0, deposit: 0 },
    });
    summary.push({ step: "Wallet balances zeroed", removed: wallets.count });

    const usersReset = await prisma.user.updateMany({
        data: { loyaltyTierId: null, totalSpent: 0, totalReferrals: 0, referralRewards: 0 },
    });
    summary.push({ step: "User tier/spend reset", removed: usersReset.count });

    await prisma.systemWallet.updateMany({ data: { balance: 0 } });

    const ranks = await prisma.engagementRank.count();
    if (ranks > 0) {
        await prisma.engagementRank.deleteMany({});
        summary.push({ step: "EngagementRank", removed: ranks });
    }

    console.table(summary);
}

async function main() {
    const url = process.env.DATABASE_URL || "";
    const dbName = url.split("/").pop()?.split("?")[0] || "unknown";
    const host = url.replace(/\/\/[^@]*@/, "//***@").split("@").pop()?.split("/")[0] || "unknown";

    console.log(`\nDatabase: ${dbName}  @  ${host}`);
    console.log(APPLY ? "Mode: APPLY (data will be deleted)" : "Mode: DRY RUN (nothing will change)");

    await preview();

    if (!APPLY) {
        console.log("\nNothing was changed. Re-run with --apply --i-have-a-backup to execute.\n");
        return;
    }

    if (!SKIP_BACKUP_CHECK) {
        console.log("\nRefusing to run: pass --i-have-a-backup once you have taken a mysqldump.\n");
        process.exitCode = 1;
        return;
    }

    console.log("\nApplying in 10 seconds. Ctrl+C to abort.");
    await new Promise(resolve => setTimeout(resolve, 10_000));

    await apply();
    console.log("\nDone.\n");
}

main()
    .catch(error => {
        logger.error("[Reset] Failed:", error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
