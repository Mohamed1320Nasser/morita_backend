import {
    JsonController,
    Get,
    Post,
    Patch,
    Put,
    Param,
    Body,
    QueryParams,
    Authorized,
    CurrentUser,
} from "routing-controllers";
import { Service } from "typedi";
import API from "../../common/config/api.types";
import WalletService from "./wallet.service";
import {
    CreateWalletDto,
    AddBalanceDto,
    GetWalletListDto,
    GetTransactionHistoryDto,
    UpdateWalletDto,
} from "./dtos";

// Admin Wallet Controller
@JsonController("/api/admin/wallets")
@Service()
export default class WalletController {
    constructor(private walletService: WalletService) {}

    /**
     * Get all wallets (paginated)
     */
    @Get("/")
    @Authorized(API.Role.admin)
    async getWallets(@QueryParams() query: GetWalletListDto) {
        const result = await this.walletService.getWalletList(query);
        return {
            success: true,
            data: result,
        };
    }

    /**
     * Get wallet statistics - MUST be before /:id route
     */
    @Get("/stats")
    @Authorized(API.Role.admin)
    async getWalletStats() {
        const stats = await this.walletService.getWalletStats();
        return {
            success: true,
            data: stats,
        };
    }

    /**
     * Get enhanced wallet statistics for admin dashboard - MUST be before /:id route
     */
    @Get("/stats/enhanced")
    @Authorized(API.Role.admin)
    async getEnhancedWalletStats() {
        const stats = await this.walletService.getEnhancedWalletStats();
        return {
            success: true,
            data: stats,
        };
    }

    /**
     * Get system wallet - MUST be before /:id route
     */
    @Get("/system/balance")
    @Authorized(API.Role.admin)
    async getSystemWallet() {
        const systemWallet = await this.walletService.getSystemWallet();
        return {
            success: true,
            data: systemWallet,
        };
    }

    /**
     * Get wallet by user ID - MUST be before /:id route
     */
    @Get("/user/:userId")
    @Authorized(API.Role.admin)
    async getWalletByUser(@Param("userId") userId: number) {
        const wallet = await this.walletService.getWalletByUserId(userId);
        return {
            success: true,
            data: wallet,
        };
    }

    /**
     * Get wallet by ID
     */
    @Get("/:id")
    @Authorized(API.Role.admin)
    async getWallet(@Param("id") id: string) {
        const wallet = await this.walletService.getWalletById(id);
        return {
            success: true,
            data: wallet,
        };
    }

    /**
     * Create wallet for user
     */
    @Post("/")
    @Authorized(API.Role.admin)
    async createWallet(@Body() data: CreateWalletDto) {
        const wallet = await this.walletService.createWallet(data);
        return {
            success: true,
            data: wallet,
        };
    }

    /**
     * Add balance to wallet
     */
    @Post("/:id/add-balance")
    @Authorized(API.Role.admin)
    async addBalance(
        @Param("id") id: string,
        @Body() data: AddBalanceDto,
        @CurrentUser() user: any
    ) {
        const result = await this.walletService.addBalance(id, data, user.id);
        return {
            success: true,
            data: result,
        };
    }

    /**
     * Adjust balance (can be positive or negative)
     */
    @Post("/:id/adjust")
    @Authorized(API.Role.admin)
    async adjustBalance(
        @Param("id") id: string,
        @Body() data: { amount: number; reference?: string; notes?: string },
        @CurrentUser() user: any
    ) {
        const result = await this.walletService.adjustBalance(id, data, user.id);
        return {
            success: true,
            data: result,
        };
    }

    /**
     * Update wallet status (activate/deactivate)
     */
    @Put("/:id/status")
    @Authorized(API.Role.admin)
    async updateWalletStatus(
        @Param("id") id: string,
        @Body() data: { isActive: boolean }
    ) {
        const wallet = await this.walletService.updateWallet(id, { isActive: data.isActive });
        return {
            success: true,
            data: wallet,
        };
    }

    /**
     * Update wallet settings
     */
    @Patch("/:id")
    @Authorized(API.Role.admin)
    async updateWallet(@Param("id") id: string, @Body() data: UpdateWalletDto) {
        const wallet = await this.walletService.updateWallet(id, data);
        return {
            success: true,
            data: wallet,
        };
    }

    /**
     * Get transaction history for wallet
     */
    @Get("/:id/transactions")
    @Authorized(API.Role.admin)
    async getTransactions(
        @Param("id") id: string,
        @QueryParams() query: GetTransactionHistoryDto
    ) {
        const result = await this.walletService.getTransactionHistory(id, query);
        return {
            success: true,
            data: result,
        };
    }
}
