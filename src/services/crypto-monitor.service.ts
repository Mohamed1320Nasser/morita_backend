import { Service } from "typedi";
import { CronJob } from "cron";
import axios from "axios";
import prisma from "../common/prisma/client";
import logger from "../common/loggers";
import CryptoNotificationService from "../discord-bot/services/crypto-notification.service";

const NETWORK_API_PATHS: Record<string, string> = {
  bitcoin: "bitcoin",
  litecoin: "litecoin",
  ethereum: "ethereum",
  solana: "solana",
  ripple: "ripple",
};

@Service()
export default class CryptoMonitorService {
  private isMonitoring = false;
  private cronJob: CronJob | null = null;
  private checkIntervalMinutes: number;

  constructor(private notificationService: CryptoNotificationService) {
    // Get interval from environment variable (default: 2 minutes)
    this.checkIntervalMinutes = parseInt(
      process.env.CRYPTO_CHECK_INTERVAL_MINUTES || "2",
      10
    );

    if (this.checkIntervalMinutes < 1) {
      logger.warn(
        "[CryptoMonitor] Invalid check interval, defaulting to 2 minutes"
      );
      this.checkIntervalMinutes = 2;
    }
  }

  // Start monitoring all active wallets
  startMonitoring() {
    if (this.isMonitoring) {
      logger.warn("[CryptoMonitor] Already monitoring");
      return;
    }

    // Create cron pattern: */{interval} * * * *
    const cronPattern = `*/${this.checkIntervalMinutes} * * * *`;

    this.cronJob = new CronJob(cronPattern, async () => {
      await this.checkAllWallets();
    });

    this.cronJob.start();
    this.isMonitoring = true;
    logger.info(
      `[CryptoMonitor] ✅ Started monitoring - checking every ${this.checkIntervalMinutes} minute(s)`
    );
  }

  stopMonitoring() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isMonitoring = false;
      logger.info("[CryptoMonitor] ⏹️  Stopped monitoring");
    }
  }

  // Check all active wallets
  async checkAllWallets() {
    try {
      const wallets = await prisma.cryptoWallet.findMany({
        where: { isActive: true },
      });

      if (wallets.length === 0) {
        logger.debug("[CryptoMonitor] No active wallets to monitor");
        return;
      }

      logger.info(
        `[CryptoMonitor] 🔍 Checking ${wallets.length} active wallet(s)`
      );

      for (const wallet of wallets) {
        try {
          await this.checkWallet(wallet);
        } catch (error: any) {
          logger.error(
            `[CryptoMonitor] ❌ Error checking wallet ${wallet.name}:`,
            error.message
          );
        }
      }
    } catch (error: any) {
      logger.error("[CryptoMonitor] Error in checkAllWallets:", error.message);
    }
  }

  // Check a single wallet for new transactions
  private async checkWallet(wallet: any) {
    const apiPath = NETWORK_API_PATHS[wallet.network];
    if (!apiPath) {
      logger.warn(`[CryptoMonitor] Unsupported network: ${wallet.network}`);
      return;
    }

    try {
      // Get address info from Blockchair
      const response = await axios.get(
        `https://api.blockchair.com/${apiPath}/dashboards/address/${wallet.address}`,
        { timeout: 10000 }
      );

      const addressData = response.data?.data?.[wallet.address];
      if (!addressData) {
        logger.warn(`[CryptoMonitor] No data for ${wallet.name}`);
        return;
      }

      const address = addressData.address;
      const currentBalance = parseFloat(address.balance || 0);
      const transactions = addressData.transactions || [];

      // Get latest transaction
      if (transactions.length > 0) {
        const latestTxHash = transactions[0]; // Most recent transaction hash

        // Check if this is a new transaction
        if (wallet.lastTxHash !== latestTxHash) {
          logger.info(
            `[CryptoMonitor] 💰 New transaction detected for ${wallet.name}: ${latestTxHash}`
          );

          // Fetch full transaction details
          await this.processNewTransaction(wallet, latestTxHash);

          // Update wallet's last known transaction
          await prisma.cryptoWallet.update({
            where: { id: wallet.id },
            data: {
              lastTxHash: latestTxHash,
              lastBalance: currentBalance,
              lastCheckedAt: new Date(),
            },
          });
        } else {
          // No new transactions, just update check time
          await prisma.cryptoWallet.update({
            where: { id: wallet.id },
            data: {
              lastBalance: currentBalance,
              lastCheckedAt: new Date(),
            },
          });
        }
      } else {
        // No transactions at all, update check time
        await prisma.cryptoWallet.update({
          where: { id: wallet.id },
          data: {
            lastBalance: currentBalance,
            lastCheckedAt: new Date(),
          },
        });
      }
    } catch (error: any) {
      if (error.response?.status === 430) {
        logger.warn(
          "[CryptoMonitor] ⚠️  Rate limited by Blockchair, will retry next interval"
        );
      } else {
        logger.error(
          `[CryptoMonitor] Error checking wallet ${wallet.name}:`,
          error.message
        );
      }
    }
  }

  // Process a new transaction
  private async processNewTransaction(wallet: any, txHash: string) {
    try {
      // Check if we already have this transaction
      const existing = await prisma.cryptoTransaction.findUnique({
        where: { txHash },
      });

      if (existing) {
        logger.info(`[CryptoMonitor] Transaction ${txHash} already recorded`);
        return;
      }

      const apiPath = NETWORK_API_PATHS[wallet.network];

      // Get full transaction details
      const response = await axios.get(
        `https://api.blockchair.com/${apiPath}/dashboards/transaction/${txHash}`,
        { timeout: 10000 }
      );

      const txData = response.data?.data?.[txHash];
      if (!txData) {
        logger.warn(`[CryptoMonitor] No transaction data for ${txHash}`);
        return;
      }

      const transaction = txData.transaction;
      const outputs = txData.outputs || [];
      const inputs = txData.inputs || [];

      // Find output to our wallet
      let amountReceived = 0;
      let fromAddress = "";

      // Check if our wallet received funds
      for (const output of outputs) {
        if (output.recipient === wallet.address) {
          amountReceived += parseFloat(output.value || 0);
        }
      }

      // Get sender address
      if (inputs.length > 0) {
        fromAddress = inputs[0].recipient || "Unknown";
      }

      // Only process if we received funds
      if (amountReceived > 0) {
        // Convert from smallest unit (satoshi, wei, etc.)
        const decimals = this.getDecimals(wallet.network);
        const amount = amountReceived / Math.pow(10, decimals);

        // Get confirmations
        const context = response.data?.context;
        const currentBlock = context?.state || 0;
        const txBlock = transaction.block_id || 0;
        const confirmations = txBlock > 0 ? currentBlock - txBlock + 1 : 0;
        const status = confirmations >= 1 ? "confirmed" : "pending";

        // Save to database
        const savedTx = await prisma.cryptoTransaction.create({
          data: {
            walletId: wallet.id,
            txHash: txHash,
            currency: wallet.currency,
            amount: amount,
            amountUsd: parseFloat(transaction.output_total_usd || 0),
            fromAddress: fromAddress,
            toAddress: wallet.address,
            confirmations: confirmations,
            status: status,
            blockHeight: txBlock > 0 ? txBlock : null,
            transactionTime: transaction.time
              ? new Date(transaction.time)
              : null,
            notifiedDiscord: false,
          },
        });

        logger.info(
          `[CryptoMonitor] ✅ Saved transaction: ${amount} ${wallet.currency} to ${wallet.name}`
        );

        // Send Discord notification
        await this.notificationService.sendTransactionNotification(
          savedTx,
          wallet
        );

        // Mark as notified
        await prisma.cryptoTransaction.update({
          where: { id: savedTx.id },
          data: { notifiedDiscord: true },
        });
      }
    } catch (error: any) {
      logger.error(
        `[CryptoMonitor] Error processing transaction ${txHash}:`,
        error.message
      );
    }
  }

  private getDecimals(network: string): number {
    const decimals: Record<string, number> = {
      bitcoin: 8,
      litecoin: 8,
      ethereum: 18,
      solana: 9,
      ripple: 6,
    };
    return decimals[network] || 8;
  }

  // Manual check (for testing)
  async checkWalletNow(walletId: string) {
    const wallet = await prisma.cryptoWallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    await this.checkWallet(wallet);
    return { success: true, message: `Wallet ${wallet.name} checked successfully` };
  }

  // Get monitoring status
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      checkIntervalMinutes: this.checkIntervalMinutes,
      nextCheck: this.cronJob?.nextDate()?.toJSDate() || null,
    };
  }
}
