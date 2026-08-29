import {
    JsonController,
    Get,
    Post,
    Delete,
    Param,
    Req,
    UseBefore,
    Authorized,
    CurrentUser,
    BadRequestError,
} from "routing-controllers";
import { Service } from "typedi";
import { Request } from "express";
import BrandingService from "./branding.service";
import FileService from "../file/file.service";
import { getSinglefile } from "../../common/helpers/file.helper";
import { BrandingImageMimeTypes } from "../../common/mimeTypes";
import { upload } from "../../common/middlewares";
import API from "../../common/config/api.types";

@JsonController("/branding")
@Service()
export default class BrandingController {
    constructor(
        private brandingService: BrandingService,
        private fileService: FileService
    ) {}

    @Get("/")
    async getBranding() {
        return await this.brandingService.getAll();
    }

    @Get("/detailed")
    @Authorized(API.Role.system)
    async getDetailed() {
        return await this.brandingService.getDetailed();
    }

    @Post("/:key")
    @Authorized(API.Role.system)
    @UseBefore(
        upload([
            {
                maxCount: 1,
                name: "image",
                folder: "branding",
                acceptedMimetypes: BrandingImageMimeTypes,
            },
        ])
    )
    async upsertBranding(
        @Param("key") key: string,
        @CurrentUser() user: API.User,
        @Req() req: Request
    ) {
        let image = getSinglefile(req, "image");

        if (!image) {
            throw new BadRequestError("An image file is required");
        }

        image = await this.fileService.upload(image, user.id);

        return await this.brandingService.upsert(key, image, user.id);
    }

    @Delete("/:key")
    @Authorized(API.Role.system)
    async removeBranding(@Param("key") key: string) {
        return await this.brandingService.remove(key);
    }
}
