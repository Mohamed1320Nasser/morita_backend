import {
    Body,
    CurrentUser,
    Get,
    JsonController,
    Patch,
    Req,
    UseBefore,
} from "routing-controllers";
import { getSinglefile } from "../../common/helpers/file.helper";
import { ImageMimeTypes } from "../../common/mimeTypes";
import { upload } from "../../common/middlewares";
import { editProfileDto, UserProfileDto } from "./dtos";
import UserService from "./user.service";
import { Request } from "express";
import { convertResponse } from "../../common/helpers/res.helper";
import { Service } from "typedi";
import API from "../../common/config/api.types";
import FileService from "../file/file.service";

@Service()
@JsonController("/user")
export default class UserController {
    constructor(
        private userService: UserService,
        private fileService: FileService
    ) {}

    @Get("/profile")
    async getProfile(@CurrentUser() user: API.User, @Req() req: Request) {
        const profile = await this.userService.getProfileWithPermissions(
            (req as any).lang || "en",
            user.id
        );

        return profile ? convertResponse(UserProfileDto, profile) : null;
    }

    @Patch("/profile")
    @UseBefore(
        upload([
            {
                maxCount: 1,
                name: "profile",
                folder: "user/profile",
                acceptedMimetypes: ImageMimeTypes,
            },
        ])
    )
    async editProfile(
        @CurrentUser() user: API.User,
        @Body() data: editProfileDto,
        @Req() req: Request
    ) {
        let profile = getSinglefile(req, "profile");
        profile = profile
            ? await this.fileService.upload(profile, user.id)
            : profile;

        const result = await this.userService.editProfile(
            (req as any).lang || "en",
            user.id,
            data,
            profile
        );
        return "ok";
    }
}
