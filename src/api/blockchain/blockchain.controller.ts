import {
    JsonController,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import BlockchainService from "./blockchain.service";
import { CreateWalletDto, UpdateWalletDto } from "./dtos";
import API from "../../common/config/api.types";

@Service()
@JsonController("/blockchain")
export default class BlockchainController {
    constructor(private blockchainService: BlockchainService) {}

    @Get("/wallets")
    @Authorized(API.Role.system)
    async getAllWallets() {
        return this.blockchainService.getAllWallets();
    }

    @Get("/wallets/active")
    @Authorized(API.Role.system)
    async getActiveWallets() {
        return this.blockchainService.getActiveWallets();
    }

    @Get("/wallets/:id")
    @Authorized(API.Role.system)
    async getWalletById(@Param("id") id: string) {
        return this.blockchainService.getWalletById(id);
    }

    @Post("/wallets")
    @Authorized(API.Role.system)
    async createWallet(@Body() data: CreateWalletDto) {
        return this.blockchainService.createWallet(data);
    }

    @Put("/wallets/:id")
    @Authorized(API.Role.system)
    async updateWallet(@Param("id") id: string, @Body() data: UpdateWalletDto) {
        return this.blockchainService.updateWallet(id, data);
    }

    @Delete("/wallets/:id")
    @Authorized(API.Role.system)
    async deleteWallet(@Param("id") id: string) {
        return this.blockchainService.deleteWallet(id);
    }


    @Get("/verify/:currency/:txid")
    // @Authorized(API.Role.system)
    async verifyTransaction(
        @Param("currency") currency: string,
        @Param("txid") txid: string
    ) {
        return this.blockchainService.verifyTransaction(currency, txid);
    }

    @Get("/currencies")
    // @Authorized(API.Role.system)
    async getSupportedCurrencies() {
        return this.blockchainService.getSupportedCurrencies();
    }
}
