import {
    Body,
    JsonController,
    Post,
    Req,
    UseBefore,
    CurrentUser,
    Authorized,
} from "routing-controllers";
import {
    adminLoginDto,
    adminloginResultDto,
    ChangePasswordDto,
    checkEmailDto,
    recoverPasswordDto,
    RequestOTPDto,
    ResendOTPDto,
    SetPasswordDto,
    VerifyOTPDto,
} from "./dtos";
import AuthService from "./auth.service";
import { Service } from "typedi";
import { Request } from "express";
import { v4 as uuid } from "uuid";
import { convertResponse } from "../../common/helpers/res.helper";
import API from "../../common/config/api.types";
import { rateLimiter } from "../../common/middlewares/rateLimit.middleware";

@JsonController("/auth")
@Service()
export default class AuthController {
    constructor(private authService: AuthService) {}

    @Post("/admin/login")
    async adminLogin(@Body() data: adminLoginDto, @Req() req: Request) {
        const source = req.useragent?.source || "";
        data.identifier = data.identifier || uuid() || "";
        const res = await this.authService.adminLogin(
            (req as any).lang || "en",
            true,
            data.email,
            data.password,
            data.identifier,
            source
        );
        return convertResponse(adminloginResultDto, res);
    }

    @Post("/otp/request")
    @UseBefore(rateLimiter)
    public async requestOtp(@Body() data: RequestOTPDto, @Req() req: Request) {
        const res = await this.authService.sendOTP(req.lang, data);
        return res;
    }

    @Post("/otp/verify")
    @UseBefore(rateLimiter)
    public async verifyOtp(@Body() data: VerifyOTPDto, @Req() req: Request) {
        const res = await this.authService.verifyOTP(
            req.lang,
            data.requestId,
            data.otp
        );
        return res;
    }

    @Post("/otp/resend")
    @UseBefore(rateLimiter)
    public async resendOtp(@Body() data: ResendOTPDto, @Req() req: Request) {
        const res = await this.authService.resendOTP(data.requestId);
        return res;
    }

    @Post("/logout")
    @UseBefore(rateLimiter)
    public async logout(@CurrentUser() user: API.User) {
        const res = await this.authService.logout(user.sessionId);
        return "ok";
    }

    @Post("/recover")
    public async recover(
        @Body() data: recoverPasswordDto,
        @Req() req: Request
    ) {
        const res = await this.authService.recoverPassword(req.lang, data);
        return "ok";
    }

    @Post("/check")
    public async check(@Body() data: checkEmailDto, @Req() req: Request) {
        const res = await this.authService.checkEmailPhone(
            req.lang,
            0,
            data.email,
            data.phone
        );
        return res;
    }

    @Post("/change/password")
    @UseBefore(rateLimiter)
    @Authorized(API.Role.user)
    public async changePassword(
        @Body() data: ChangePasswordDto,
        @Req() req: Request,
        @CurrentUser() user: API.User
    ) {
        const res = await this.authService.changePassword(
            req.lang,
            data,
            user.id
        );
        return "ok";
    }

    @Post("/set-password")
    public async setPassword(
        @Body() data: SetPasswordDto,
        @Req() req: Request
    ) {
        const res = await this.authService.setPassword(req.lang, data);
        return "ok";
    }
}
