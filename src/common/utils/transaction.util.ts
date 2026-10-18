import { Prisma } from "@prisma/client";
import prisma from "../prisma/client";
import logger from "../loggers";
import { TRANSACTION_CONFIG } from "../constants/security.constants";

/**
 * Database Transaction Utilities
 * Provides safe, consistent transaction handling with proper isolation levels
 */

export type TransactionClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export type TransactionCallback<T> = (tx: TransactionClient) => Promise<T>;

/**
 * Execute operation within a database transaction
 * Uses Serializable isolation level to prevent race conditions
 */
export async function withTransaction<T>(
    callback: TransactionCallback<T>,
    options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
    }
): Promise<T> {
    const startTime = Date.now();

    try {
        const result = await prisma.$transaction(async (tx) => {
            return await callback(tx as TransactionClient);
        }, {
            maxWait: options?.maxWait || TRANSACTION_CONFIG.MAX_WAIT_MS,
            timeout: options?.timeout || TRANSACTION_CONFIG.TIMEOUT_MS,
            isolationLevel: options?.isolationLevel || Prisma.TransactionIsolationLevel.Serializable,
        });

        const duration = Date.now() - startTime;
        logger.debug(`[Transaction] Completed successfully in ${duration}ms`);

        return result;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[Transaction] Failed after ${duration}ms:`, error);
        throw error;
    }
}

export async function withTransactionBatch<T>(
    operations: TransactionCallback<any>[],
    options?: Parameters<typeof withTransaction>[1]
): Promise<T[]> {
    return withTransaction(async (tx) => {
        const results: any[] = [];

        for (const operation of operations) {
            const result = await operation(tx);
            results.push(result);
        }

        return results;
    }, options);
}

/**
 * Retry transaction on deadlock/serialization failure
 */
export async function withTransactionRetry<T>(
    callback: TransactionCallback<T>,
    maxRetries: number = 3,
    options?: Parameters<typeof withTransaction>[1]
): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await withTransaction(callback, options);
        } catch (error: any) {
            lastError = error;

            // Check if error is retryable (deadlock, serialization failure)
            const isRetryable =
                error?.code === "P2034" || // Transaction conflict
                error?.code === "40001" || // Serialization failure
                error?.code === "40P01" || // Deadlock detected
                error?.message?.includes("deadlock") ||
                error?.message?.includes("serialization");

            if (!isRetryable || attempt === maxRetries) {
                throw error;
            }

            // Exponential backoff
            const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
            logger.warn(`[Transaction] Retrying transaction (attempt ${attempt}/${maxRetries}) after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Lock wallet row for update (prevents concurrent balance modifications)
 * Uses raw query for row-level locking
 */
export async function lockWalletForUpdate(
    tx: TransactionClient,
    walletId: string
): Promise<any> {
    // Use raw query to lock the row
    const result = await tx.$queryRaw`
        SELECT * FROM \`Wallet\`
        WHERE id = ${walletId}
        FOR UPDATE
    `;

    if (!Array.isArray(result) || result.length === 0) {
        throw new Error(`Wallet ${walletId} not found`);
    }

    return result[0];
}

/**
 * Safely increment/decrement wallet balance within transaction
 * Prevents race conditions
 */
export async function updateWalletBalance(
    tx: TransactionClient,
    walletId: string,
    balanceChange: number,
    pendingBalanceChange?: number,
    depositChange?: number
): Promise<any> {
    // Lock wallet first
    await lockWalletForUpdate(tx, walletId);

    // Update with atomic increment/decrement
    const updateData: any = {};

    if (balanceChange !== 0) {
        updateData.balance = {
            [balanceChange > 0 ? "increment" : "decrement"]: Math.abs(balanceChange)
        };
    }

    if (pendingBalanceChange !== undefined && pendingBalanceChange !== 0) {
        updateData.pendingBalance = {
            [pendingBalanceChange > 0 ? "increment" : "decrement"]: Math.abs(pendingBalanceChange)
        };
    }

    if (depositChange !== undefined && depositChange !== 0) {
        updateData.deposit = {
            [depositChange > 0 ? "increment" : "decrement"]: Math.abs(depositChange)
        };
    }

    return await tx.wallet.update({
        where: { id: walletId },
        data: updateData
    });
}

/**
 * Check wallet balance with lock (for atomic balance checks)
 *
 * @param walletType - 'customer' checks only available balance, 'worker' checks deposit + balance (eligibility)
 */
export async function checkWalletBalanceWithLock(
    tx: TransactionClient,
    walletId: string,
    requiredAmount: number,
    walletType: 'customer' | 'worker' = 'customer'
): Promise<{ sufficient: boolean; available: number; wallet: any }> {
    const wallet = await lockWalletForUpdate(tx, walletId);

    const balance = typeof wallet.balance === 'object'
        ? parseFloat(wallet.balance.toString())
        : wallet.balance;
    const deposit = typeof wallet.deposit === 'object'
        ? parseFloat(wallet.deposit.toString())
        : wallet.deposit;

    // pendingBalance only mirrors money already taken out of balance/deposit
    // for open orders, so subtracting it again would count every lock twice.
    let availableAmount: number;

    if (walletType === 'worker') {
        // Worker: Check deposit + balance (total eligibility for job claiming)
        availableAmount = deposit + balance;
    } else {
        // Customer: Check only balance
        availableAmount = balance;
    }

    const sufficient = availableAmount >= requiredAmount;

    return {
        sufficient,
        available: availableAmount,
        wallet
    };
}

/**
 * Smart deduction for workers: deducts from balance first, then from deposit if needed
 * This prevents negative balance by using worker deposit as available funds
 *
 * Record depositBefore/depositAfter on the lock transaction: releaseWorkerDeposit
 * reads them to return each part to where it came from.
 *
 * @returns { fromBalance, fromDeposit, depositBefore, depositAfter }
 */
export async function deductFromWorkerWallet(
    tx: TransactionClient,
    walletId: string,
    requiredAmount: number,
    addToPending: number = 0
): Promise<{ fromBalance: number; fromDeposit: number; depositBefore: number; depositAfter: number }> {
    const wallet = await lockWalletForUpdate(tx, walletId);

    const balance = typeof wallet.balance === 'object'
        ? parseFloat(wallet.balance.toString())
        : wallet.balance;
    const deposit = typeof wallet.deposit === 'object'
        ? parseFloat(wallet.deposit.toString())
        : wallet.deposit;

    // Balance is already net of earlier locks (see checkWalletBalanceWithLock)
    const availableBalance = Math.max(0, balance);

    let fromBalance = 0;
    let fromDeposit = 0;

    if (availableBalance >= requiredAmount) {
        // Can deduct fully from balance
        fromBalance = requiredAmount;
    } else {
        // Need to use deposit
        fromBalance = availableBalance;
        fromDeposit = Number((requiredAmount - availableBalance).toFixed(8));

        if (deposit < fromDeposit) {
            throw new Error(
                `Insufficient funds. Need $${requiredAmount}, have $${availableBalance} in balance and $${deposit} in deposit.`
            );
        }
    }

    // Apply the deductions
    const updateData: any = {};

    if (fromBalance > 0) {
        updateData.balance = {
            decrement: fromBalance
        };
    }

    if (fromDeposit > 0) {
        updateData.deposit = {
            decrement: fromDeposit
        };
    }

    if (addToPending > 0) {
        updateData.pendingBalance = {
            increment: addToPending
        };
    }

    await tx.wallet.update({
        where: { id: walletId },
        data: updateData
    });

    return {
        fromBalance,
        fromDeposit,
        depositBefore: deposit,
        depositAfter: Number((deposit - fromDeposit).toFixed(8)),
    };
}

/**
 * How much of a worker's lock on this order was taken from their deposit (the
 * rest came from balance). New locks record depositBefore/depositAfter; older
 * ones only have the split in their notes ("X from balance, Y from deposit").
 */
async function lockedFromDeposit(
    tx: TransactionClient,
    walletId: string,
    orderId: string,
    amount: number
): Promise<number> {
    const lock = await tx.walletTransaction.findFirst({
        where: {
            walletId,
            orderId,
            type: "PAYMENT",
            amount: { lt: 0 },
            // "Deposit locked" (create), "Worker deposit locked" (claim / replacement)
            OR: [
                { reference: { contains: "Deposit locked" } },
                { reference: { contains: "deposit locked" } },
            ],
        },
        orderBy: { createdAt: "desc" },
        select: { depositBefore: true, depositAfter: true, notes: true },
    });

    let fromDeposit = 0;
    if (lock?.depositBefore != null && lock?.depositAfter != null) {
        fromDeposit = parseFloat(lock.depositBefore.toString()) - parseFloat(lock.depositAfter.toString());
    } else {
        const match = lock?.notes?.match(/([\d.]+) from deposit/);
        if (match) fromDeposit = parseFloat(match[1]);
    }

    if (!Number.isFinite(fromDeposit)) return 0;
    return Number(Math.min(Math.max(fromDeposit, 0), amount).toFixed(8));
}

/**
 * Returns a worker's locked order deposit: the part taken from their deposit
 * goes back to deposit, the rest to balance, and the lock leaves pendingBalance.
 */
export async function releaseWorkerDeposit(
    tx: TransactionClient,
    walletId: string,
    orderId: string,
    amount: number
): Promise<{
    toBalance: number;
    toDeposit: number;
    balanceBefore: number;
    balanceAfter: number;
    depositBefore: number;
    depositAfter: number;
}> {
    const wallet = await lockWalletForUpdate(tx, walletId);
    const balanceBefore = parseFloat(wallet.balance.toString());
    const depositBefore = parseFloat(wallet.deposit.toString());

    const toDeposit = await lockedFromDeposit(tx, walletId, orderId, amount);
    const toBalance = Number((amount - toDeposit).toFixed(8));

    await updateWalletBalance(tx, walletId, toBalance, -amount, toDeposit);

    return {
        toBalance,
        toDeposit,
        balanceBefore,
        balanceAfter: Number((balanceBefore + toBalance).toFixed(8)),
        depositBefore,
        depositAfter: Number((depositBefore + toDeposit).toFixed(8)),
    };
}

/**
 * Execute operation with distributed lock (using database)
 * Prevents concurrent execution of the same operation
 */
export async function withDistributedLock<T>(
    lockKey: string,
    callback: () => Promise<T>,
    ttlSeconds: number = 30
): Promise<T> {
    const lockId = `lock:${lockKey}`;
    const acquired = await acquireLock(lockId, ttlSeconds);

    if (!acquired) {
        throw new Error(`Failed to acquire lock for ${lockKey}`);
    }

    try {
        return await callback();
    } finally {
        await releaseLock(lockId);
    }
}

/**
 * Acquire distributed lock
 */
async function acquireLock(lockId: string, ttlSeconds: number): Promise<boolean> {
    try {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

        await prisma.$executeRaw`
            INSERT INTO \`Lock\` (id, \`expiresAt\`)
            VALUES (${lockId}, ${expiresAt})
            ON DUPLICATE KEY UPDATE id = id
        `;

        // Check if we got the lock
        const lock = await prisma.$queryRaw<any[]>`
            SELECT id FROM \`Lock\`
            WHERE id = ${lockId} AND \`expiresAt\` > NOW()
        `;

        return lock.length > 0;
    } catch (error) {
        logger.error(`[Lock] Failed to acquire lock ${lockId}:`, error);
        return false;
    }
}

/**
 * Release distributed lock
 */
async function releaseLock(lockId: string): Promise<void> {
    try {
        await prisma.$executeRaw`
            DELETE FROM \`Lock\` WHERE id = ${lockId}
        `;
    } catch (error) {
        logger.error(`[Lock] Failed to release lock ${lockId}:`, error);
    }
}

/**
 * Cleanup expired locks (should be run periodically)
 */
export async function cleanupExpiredLocks(): Promise<number> {
    try {
        const result = await prisma.$executeRaw`
            DELETE FROM \`Lock\` WHERE \`expiresAt\` < NOW()
        `;
        return Number(result);
    } catch (error) {
        logger.error("[Lock] Failed to cleanup expired locks:", error);
        return 0;
    }
}
