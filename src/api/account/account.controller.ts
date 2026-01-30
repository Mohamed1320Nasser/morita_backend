import {
    JsonController,
    Get,
    Post,
    Delete,
    Param,
    Body,
    QueryParams,
    Req,
    Put,
    UseBefore,
    CurrentUser,
    BadRequestError,
    Patch,
} from "routing-controllers";
import { Service } from "typedi";
import AccountService from "./account.service";
import { CreateAccountDto, UpdateAccountDto, GetAccountListDto, GetAccountViewListDto } from "./dtos";
import { Request } from "express";
import { upload } from "../../common/middlewares";
import { ImageMimeTypes } from "../../common/mimeTypes";
import { getFilesList } from "../../common/helpers/file.helper";
import FileService from "../file/file.service";
import API from "../../common/config/api.types";

@JsonController("/accounts")
@Service()
export default class AccountController {
    constructor(
        private accountService: AccountService,
        private fileService: FileService
    ) {}

    @Post("/")
    @UseBefore(
        upload([
            {
                maxCount: 10,
                name: "images",
                folder: "accounts",
                acceptedMimetypes: ImageMimeTypes,
            },
        ])
    )
    async createAccount(
        @CurrentUser() user: API.User,
        @Body() data: CreateAccountDto,
        @Req() req: Request
    ) {

        const images = getFilesList(req, "images");
        if (!images.length) {
            throw new BadRequestError("images is required");
        }

        for (let image of images) {
            image = image ? await this.fileService.upload(image, user.id) : image;
        }

        const account = await this.accountService.create(data, images);
        return account;
    }

    @Get("/")
    async getAccounts(@QueryParams() query: GetAccountListDto) {
        const result = await this.accountService.getList(query);
        return result;
    }

    @Get("/stats")
    async getStats() {
        const stats = await this.accountService.getStats();
        return stats;
    }

    @Get("/:id")
    async getAccount(@Param("id") id: string) {
        const account = await this.accountService.getSingle(id);
        return account;
    }

    @Patch("/:id")
    @UseBefore(
        upload([
            {
                maxCount: 10,
                name: "images",
                folder: "accounts",
                acceptedMimetypes: ImageMimeTypes,
            },
        ])
    )
    async updateAccount(
        @CurrentUser() user: API.User,
        @Param("id") id: string,
        @Body() data: UpdateAccountDto,
        @Req() req: Request
    ) {        
        const images = getFilesList(req, "images");
        for (let image of images) {
            image = image ? await this.fileService.upload(image, user.id) : image;
        }

        const account = await this.accountService.update(id, data, images);
        return account;
    }

    @Delete("/:id")
    async deleteAccount(@Param("id") id: string) {
        const result = await this.accountService.delete(id);
        return result;
    }

    @Get("/view/categories")
    async getCategories() {
        return await this.accountService.getCategoriesWithCounts();
    }

    @Get("/view/list")
    async getViewList(@QueryParams() query: GetAccountViewListDto) {
        return await this.accountService.getViewList(query);
    }

    @Get("/view/:id")
    async getViewDetail(@Param("id") id: string) {
        const account = await this.accountService.getViewDetail(id);
        if (!account) {
            throw new BadRequestError("Account not found or not available");
        }
        return account;
    }

    @Post("/reserve/:id")
    async reserveAccount(
        @Param("id") id: string,
        @Body() data: { userId?: number; discordUserId?: string; expiryMinutes?: number }
    ) {
        return await this.accountService.reserveAccount(
            id,
            data.userId,
            data.discordUserId,
            data.expiryMinutes || 30
        );
    }

    @Post("/release/:id")
    async releaseAccount(@Param("id") id: string) {
        return await this.accountService.releaseAccount(id);
    }

    @Post("/complete-sale/:id")
    async completeSale(
        @Param("id") id: string,
        @Body() data: { userId: number; orderId?: string }
    ) {
        return await this.accountService.completeSale(id, data.userId, data.orderId);
    }

    @Post("/release-expired")
    async releaseExpiredReservations() {
        return await this.accountService.releaseExpiredReservations();
    }
}
