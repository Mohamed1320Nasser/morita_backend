import prisma from "../common/prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Wallet reconciliation report.
 *
 * Compares each wallet's stored balance against the sum of its COMPLETED
 * transactions, and reports pendingBalance that no code path can release.
 *
 * Read-only by default. Pass --fix to release orphaned pending balance back
 * into the spendable balance (writes an ADJUSTMENT transaction for each).
 */

const APPLY = process.argv.includes("--fix");

// Deposits move the deposit column, not the balance, so their amount must be
// excluded when reconstructing balance from the ledger.
const NON_BALANCE_TYPES = ["WORKER_DEPOSIT"];

async function main() {
    const wallets = await prisma.wallet.findMany({
        include: {
            user: { select: { id: true, email: true, discordId: true } },
        },
    });

    let driftCount = 0;
    let pendingCount = 0;

    console.log(`\nChecking ${wallets.length} wallets...\n`);

    for (const wallet of wallets) {
        const transactions = await prisma.walletTransaction.findMany({
            where: { walletId: wallet.id, status: "COMPLETED" },
            select: { type: true, amount: true },
        });

        const ledger = transactions.reduce((sum, t) => {
            if (NON_BALANCE_TYPES.includes(t.type)) return sum;
            return sum.add(new Decimal(t.amount.toString()));
        }, new Decimal(0));

        const balance = new Decimal(wallet.balance.toString());
        const pending = new Decimal(wallet.pendingBalance.toString());
        const drift = balance.sub(ledger);

        const hasDrift = !drift.isZero();
        const hasPending = pending.gt(0);

        if (!hasDrift && !hasPending) continue;

        console.log(`Wallet ${wallet.id}`);
        console.log(`  user      : ${wallet.user?.email || wallet.userId}`);
        console.log(`  type      : ${wallet.walletType}`);
        console.log(`  balance   : ${balance.toFixed(2)}`);
        console.log(`  ledger    : ${ledger.toFixed(2)}`);

        if (hasDrift) {
            driftCount++;
            console.log(`  DRIFT     : ${drift.toFixed(2)}`);
        }

        if (hasPending) {
            pendingCount++;
            console.log(`  PENDING   : ${pending.toFixed(2)} (no code path releases this)`);

            if (APPLY) {
                await prisma.$transaction(async (tx) => {
                    const before = balance;
                    const after = before.add(pending);

                    await tx.wallet.update({
                        where: { id: wallet.id },
                        data: {
                            balance: { increment: pending },
                            pendingBalance: 0,
                        },
                    });

                    await tx.walletTransaction.create({
                        data: {
                            walletId: wallet.id,
                            type: "ADJUSTMENT",
                            amount: pending,
                            balanceBefore: before,
                            balanceAfter: after,
                            currency: wallet.currency,
                            status: "COMPLETED",
                            reference: "pending-balance-reconciliation",
                            notes: "Released orphaned pendingBalance to spendable balance",
                            createdById: 1,
                        },
                    });
                });

                console.log(`  -> released ${pending.toFixed(2)} to balance`);
            }
        }

        console.log("");
    }

    console.log("---");
    console.log(`wallets with drift          : ${driftCount}`);
    console.log(`wallets with stuck pending  : ${pendingCount}`);

    if (pendingCount > 0 && !APPLY) {
        console.log(`\nRun with --fix to release stuck pending balances.`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
