import prisma from "../src/common/prisma/client";
import logger from "../src/common/loggers";

async function checkWalletIntegrity() {
    console.log("🔍 Checking wallet integrity...\n");

    const walletsWithIssues = await prisma.wallet.findMany({
        where: {
            OR: [
                { balance: { lt: 0 } },
                { pendingBalance: { lt: 0 } },
                { deposit: { lt: 0 } },
            ],
        },
        include: {
            user: {
                select: {
                    id: true,
                    fullname: true,
                    username: true,
                    discordId: true,
                    role: true,
                },
            },
        },
    });

    if (walletsWithIssues.length === 0) {
        console.log("✅ No wallet integrity issues found!");
        return;
    }

    console.log(`⚠️  Found ${walletsWithIssues.length} wallet(s) with issues:\n`);

    for (const wallet of walletsWithIssues) {
        const balance = parseFloat(wallet.balance.toString());
        const pendingBalance = parseFloat(wallet.pendingBalance.toString());
        const deposit = parseFloat(wallet.deposit.toString());

        console.log(`📊 User: ${wallet.user.fullname} (@${wallet.user.username})`);
        console.log(`   Discord ID: ${wallet.user.discordId}`);
        console.log(`   Role: ${wallet.user.role}`);
        console.log(`   Balance: $${balance.toFixed(2)} ${balance < 0 ? "❌ NEGATIVE" : "✅"}`);
        console.log(`   Pending: $${pendingBalance.toFixed(2)} ${pendingBalance < 0 ? "❌ NEGATIVE" : "✅"}`);
        console.log(`   Deposit: $${deposit.toFixed(2)} ${deposit < 0 ? "❌ NEGATIVE" : "✅"}`);
        console.log(`   Eligibility: $${(deposit + balance - pendingBalance).toFixed(2)}\n`);

        const recentTransactions = await prisma.walletTransaction.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
                order: {
                    select: {
                        orderNumber: true,
                        status: true,
                    },
                },
            },
        });

        console.log(`   Recent transactions (last 5):`);
        for (const tx of recentTransactions) {
            const amount = parseFloat(tx.amount.toString());
            console.log(
                `     ${tx.type} | $${amount.toFixed(2)} | ${tx.status} | Order #${tx.order?.orderNumber || "N/A"} | ${tx.createdAt.toISOString()}`
            );
        }
        console.log("");
    }

    console.log(`\n⚠️  RECOMMENDATIONS:`);
    console.log(`1. Review the recent transactions above to identify the issue`);
    console.log(`2. Check if any orders are stuck in pending/disputed status`);
    console.log(`3. Run the fix script if you want to correct negative balances`);
    console.log(`4. Contact admin/support to manually adjust affected wallets\n`);
}

async function main() {
    try {
        await checkWalletIntegrity();
    } catch (error) {
        console.error("Error checking wallet integrity:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
