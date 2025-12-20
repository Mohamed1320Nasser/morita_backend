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

/**
 * Execute multiple operations in a single transaction
 * Automatically rolls back if any operation fails
 */
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
    pendingBalanceChange?: number
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

    return await tx.wallet.update({
        where: { id: walletId },
        data: updateData
    });
}

/**
 * Check wallet balance with lock (for atomic balance checks)
 */
export async function checkWalletBalanceWithLock(
    tx: TransactionClient,
    walletId: string,
    requiredAmount: number
): Promise<{ sufficient: boolean; available: number; wallet: any }> {
    const wallet = await lockWalletForUpdate(tx, walletId);

    const balance = typeof wallet.balance === 'object'
        ? parseFloat(wallet.balance.toString())
        : wallet.balance;
    const pendingBalance = typeof wallet.pendingBalance === 'object'
        ? parseFloat(wallet.pendingBalance.toString())
        : wallet.pendingBalance;

    const available = balance - pendingBalance;
    const sufficient = available >= requiredAmount;

    return {
        sufficient,
        available,
        wallet
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
