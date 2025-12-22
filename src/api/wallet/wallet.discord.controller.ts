import {
    JsonController,
    Get,
    Post,
    Param,
    Body,
    QueryParams,
    UseBefore,
} from "routing-controllers";
import { Service } from "typedi";
import WalletService from "./wallet.service";
import {
    DiscordAddBalanceDto,
    GetTransactionHistoryDto,
    WalletType,
} from "./dtos";
import logger from "../../common/loggers";
import { DiscordAuthMiddleware, DiscordRateLimitMiddleware } from "../../common/middlewares/discordAuth.middleware";

// Discord Wallet Controller (for bot API calls)
// CRITICAL SECURITY: All endpoints protected with authentication
@JsonController("/discord/wallets")
@Service()
@UseBefore(DiscordAuthMiddleware) // Require API key
@UseBefore(DiscordRateLimitMiddleware) // Rate limiting
export default class DiscordWalletController {
    constructor(private walletService: WalletService) {}

    /**
     * Get wallet by Discord ID
     */
    @Get("/discord/:discordId")
    async getWalletByDiscordId(@Param("discordId") discordId: string) {
        const wallet = await this.walletService.getWalletByDiscordId(discordId);
        return {
            success: true,
            data: wallet,
        };
    }

    /**
     * Get or create wallet by Discord ID
     */
    @Post("/discord/:discordId")
    async getOrCreateWallet(
        @Param("discordId") discordId: string,
        @Body() data: { username: string; walletType?: WalletType }
    ) {
        const wallet = await this.walletService.getOrCreateWalletByDiscordId(
            discordId,
            data.username,
            data.walletType || WalletType.CUSTOMER
        );
        return {
            success: true,
            data: wallet,
        };
    }

    /**
     * Add balance to wallet (Discord command)
     */
    @Post("/add-balance")
    async addBalance(@Body({ validate: false }) data: any) {
        logger.info(
            `[Discord] Adding balance: ${JSON.stringify(data)}`
        );

        try {
            const result = await this.walletService.addBalanceByDiscord(data);

            // For WORKER_DEPOSIT, return deposit values; otherwise return balance values
            const isWorkerDeposit = data.transactionType === "WORKER_DEPOSIT";

            const responseData: any = {
                wallet: {
                    ...result.wallet,
                    balance: parseFloat(result.wallet.balance.toString()),
                    pendingBalance: parseFloat(result.wallet.pendingBalance.toString()),
                    deposit: parseFloat(result.wallet.deposit.toString()),
                },
                transaction: result.transaction,
                previousBalance: isWorkerDeposit ? (result.depositBefore || 0) : (result.balanceBefore || 0),
                newBalance: isWorkerDeposit ? (result.depositAfter || 0) : (result.balanceAfter || parseFloat(result.wallet.balance.toString())),
            };

            // Add separate deposit fields for WORKER_DEPOSIT transactions
            if (isWorkerDeposit) {
                responseData.depositBefore = result.depositBefore || 0;
                responseData.depositAfter = result.depositAfter || 0;
            }

            return {
                success: true,
                data: responseData,
            };
        } catch (error) {
            logger.error(`[Discord] Add balance error:`, error);
            throw error;
        }
    }

    /**
     * Get wallet balance by Discord ID
     */
    @Get("/balance/:discordId")
    async getBalance(@Param("discordId") discordId: string) {
        logger.info(`[getBalance] Request for discordId: ${discordId}`);
        const wallet = await this.walletService.getWalletByDiscordId(discordId);

        if (!wallet) {
            logger.warn(`[getBalance] No wallet found, returning hasWallet: false for discordId: ${discordId}`);
            return {
                success: true,
                data: {
                    balance: 0,
                    pendingBalance: 0,
                    deposit: 0,
                    currency: "USD",
                    hasWallet: false,
                },
            };
        }

        const deposit = parseFloat(wallet.deposit?.toString() || "0");
        const balance = parseFloat(wallet.balance.toString());
        const pendingBalance = parseFloat(wallet.pendingBalance.toString());
        const availableBalance = balance - pendingBalance;
        const eligibilityBalance = deposit + availableBalance;

        logger.info(`[getBalance] Wallet found for discordId: ${discordId}, returning hasWallet: true`);
        return {
            success: true,
            data: {
                walletId: wallet.id,
                balance,
                pendingBalance,
                deposit,
                availableBalance,
                eligibilityBalance,
                currency: wallet.currency,
                walletType: wallet.walletType,
                hasWallet: true,
                user: wallet.user,
            },
        };
    }

    /**
     * Get transaction history by Discord ID
     */
    @Get("/transactions/:discordId")
    async getTransactions(
        @Param("discordId") discordId: string,
        @QueryParams() query: GetTransactionHistoryDto
    ) {
        const wallet = await this.walletService.getWalletByDiscordId(discordId);

        if (!wallet) {
            return {
                success: true,
                data: {
                    list: [],
                    total: 0,
                    page: 1,
                    limit: 20,
                    totalPages: 0,
                },
            };
        }

        const result = await this.walletService.getTransactionHistory(
            wallet.id,
            query
        );

        return {
            success: true,
            data: result,
        };
    }

    /**
     * Check if user has sufficient balance
     */
    @Get("/check-balance/:discordId/:amount")
    async checkBalance(
        @Param("discordId") discordId: string,
        @Param("amount") amount: number
    ) {
        const wallet = await this.walletService.getWalletByDiscordId(discordId);

        if (!wallet) {
            return {
                success: true,
                data: {
                    hasSufficientBalance: false,
                    currentBalance: 0,
                    requiredAmount: amount,
                },
            };
        }

        const balance = parseFloat(wallet.balance.toString());
        const hasSufficientBalance = balance >= amount;

        return {
            success: true,
            data: {
                hasSufficientBalance,
                currentBalance: balance,
                requiredAmount: amount,
                shortfall: hasSufficientBalance ? 0 : amount - balance,
            },
        };
    }
}
