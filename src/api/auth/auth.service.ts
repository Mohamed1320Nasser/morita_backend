import {
    comparePassword,
    cryptPassword,
    jwtSign,
} from "../../common/helpers/hashing.helper";
import UserService from "../user/user.service";
import SessionService from "../session/session.service";
import {
    BadRequestError,
    ForbiddenError,
    HttpError,
    UnauthorizedError,
} from "routing-controllers";
import { v4 as uuid } from "uuid";
import API from "../../common/config/api.types";
import { Service } from "typedi";
import {
    ChangePasswordDto,
    RequestOTPDto,
    SetPasswordDto,
    recoverPasswordDto,
} from "./dtos";
import getLanguage, { langCode } from "../../common/language";
import prisma from "../../common/prisma/client";
import OtpRequestService from "../otpRequest/otpRequest.service ";
import MailService from "../mail/mail.service";

@Service()
export default class AuthService {
    constructor(
        private userService: UserService,
        private sessionService: SessionService,
        private otpRequestService: OtpRequestService,
        private mailService: MailService
    ) {}

    async adminLogin(
        lang: langCode,
        dashboard: boolean,
        emailorPhone: string,
        password: string,
        identifier: string,
        source: string
    ) {
        const user = await this.userService.getUserByEmailorPhone(emailorPhone);
        if (!user) throw new HttpError(401, getLanguage(lang).userNotFound);

        if (dashboard && API.Role[user.role] < API.Role.user) {
            throw new ForbiddenError();
        }

        const compare = await comparePassword(password, user.password ?? "");
        if (!compare)
            throw new HttpError(403, getLanguage(lang).passwordIsWrong);

        const newToken = uuid();

        let sessionId = 0;
        const oldSession = await this.sessionService.findUserOldSession(
            user.id,
            identifier,
            source
        );
        sessionId = oldSession?.id ? oldSession.id : 0;

        if (sessionId !== 0) {
            await this.sessionService.updateSession(sessionId, {
                token: newToken,
                expired: false,
                expired_since: null,
            });
        } else {
            const newSession = await this.sessionService.createSession(
                user.id,
                newToken,
                identifier,
                source
            );
            sessionId = newSession.id;
        }

        const API_Token: API.Token = {
            sessionId: sessionId,
            token: newToken,
        };
        return {
            login: true,
            token: await jwtSign(API_Token),
            user: {
                fullname: user.fullname,
                profile: {
                    title: user.profile?.title,
                    folder: user.profile?.folder,
                },
            },
        };
    }

    public async sendOTP(lang: langCode, data: RequestOTPDto) {
        const req = await this.otpRequestService.sendMailOtp(
            null, // No user ID for email-only OTP requests
            data.email,
            data.type
        );
        return {
            id: req.id,
            message: "OTP sent successfully to your email",
        };
    }

    public async verifyOTP(lang: langCode, requestId: string, otp: string) {
        const otpCheck = await this.otpRequestService.checkOtp(
            requestId,
            null, // No user ID for email-only OTP requests
            otp
        );

        const res = {
            right: otpCheck === "true",
            expired: otpCheck === "expired",
        };

        if (res.expired) {
            throw new BadRequestError(getLanguage(lang).otpCodeIsExpired);
        }

        if (!res.right) {
            throw new BadRequestError(getLanguage(lang).otpCodeIsWrong);
        }

        return res;
    }

    public async resendOTP(requestId: string) {
        return await this.otpRequestService.resendOtp(requestId);
    }

    async checkEmailPhone(
        lang: langCode,
        user: number = 0,
        email?: string,
        phone?: string
    ) {
        const isPhoneExists = Boolean(
            phone
                ? await prisma.user.findFirst({
                      where: {
                          phone: phone,
                          id:
                              user !== 0
                                  ? {
                                        not: user,
                                    }
                                  : undefined,
                          deletedAt: null,
                      },
                  })
                : null
        );

        const isEmailExists = Boolean(
            email
                ? await prisma.user.findFirst({
                      where: {
                          email: email,
                          id:
                              user !== 0
                                  ? {
                                        not: user,
                                    }
                                  : undefined,
                          deletedAt: null,
                      },
                  })
                : null
        );

        return {
            email: isEmailExists,
            phone: isPhoneExists,
        };
    }

    public async login(
        lang: langCode,
        email: string,
        password: string,
        identifier: string,
        source: string
    ) {
        const user = await this.userService.getUserByEmailorPhone(email);

        const compare = await comparePassword(password, user?.password ?? "");

        if (!user || !compare)
            throw new HttpError(401, getLanguage(lang).incorrectCreditentials);

        if (!user.emailIsVerified)
            throw new HttpError(401, getLanguage(lang).emailNotVerified);

        if (user.banned) {
            throw new UnauthorizedError(getLanguage(lang).userIsBanned);
        }

        let completeAuth = true;

        if (user.role.length === 0) {
            completeAuth = false;
        }

        const newToken = uuid();

        let sessionId = 0;
        const oldSession = await this.sessionService.findUserOldSession(
            user.id,
            identifier,
            source
        );
        sessionId = oldSession?.id ? oldSession.id : 0;

        if (sessionId !== 0) {
            await this.sessionService.updateSession(sessionId, {
                token: newToken,
                expired: false,
                expired_since: null,
            });
        } else {
            const newSession = await this.sessionService.createSession(
                user.id,
                newToken,
                identifier,
                source
            );
            sessionId = newSession.id;
        }

        const API_Token: API.Token = {
            sessionId: sessionId,
            token: newToken,
        };

        const res = {
            login: true,
            user: {
                fullname: user.fullname,
                role: user.role,
            },
            token: await jwtSign(API_Token),
        };
        return res;
    }

    public async recoverPassword(lang: langCode, data: recoverPasswordDto) {
        const userData = await prisma.user.findFirst({
            where: { email: data.email, deletedAt: null },
        });
        if (!userData)
            throw new BadRequestError(getLanguage(lang).userNotFound);

        const request = await prisma.otpRequest.findFirst({
            where: { id: data.requestId },
        });
        if (!request) {
            throw new BadRequestError(getLanguage(lang).otpRequestNotFound);
        }

        if (
            !request.verified ||
            request.type !== "forget_email" ||
            request.email !== data.email
        ) {
            throw new BadRequestError(getLanguage(lang).otpRequestNotVaild);
        }

        const password = await cryptPassword(data.new);

        const res = await prisma.user.update({
            where: { id: userData.id },
            data: { password: password },
        });
        return res;
    }

    public async logout(sessionId: number) {
        const res = await this.sessionService.updateSession(sessionId, {
            expired: true,
            expired_since: new Date(),
        });
        return res;
    }

    public async changePassword(
        lang: langCode,
        data: ChangePasswordDto,
        userId: number
    ) {
        const user = await prisma.user.findFirst({ where: { id: userId } });
        if (!user) throw new BadRequestError(getLanguage(lang).userNotFound);

        const compare = await comparePassword(data.old, user.password ?? "");
        if (!compare)
            throw new BadRequestError(getLanguage(lang).passwordIsWrong);

        const password = await cryptPassword(data.new);

        const res = await this.userService.updateUser(userId, {
            password: password,
        });

        // await this.sessionService.expireAllUserSessions(userId);
        return res;
    }

    public async setPassword(lang: langCode, data: SetPasswordDto) {
        if (data.password !== data.confirmPassword) {
            throw new BadRequestError(getLanguage(lang).passwordsDoNotMatch);
        }

        const user = await prisma.user.findFirst({
            where: {
                passwordSetupToken: data.token,
                passwordSetupExpiry: {
                    gt: new Date(),
                },
                deletedAt: null,
            },
        });

        if (!user) {
            throw new BadRequestError(getLanguage(lang).invalidOrExpiredToken);
        }

        const hashedPassword = await cryptPassword(data.password);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordSetupToken: null,
                passwordSetupExpiry: null,
                emailIsVerified: true,
            },
        });

        await this.mailService.sendPasswordSetupSuccess(
            user.email,
            user.fullname,
            lang
        );

        return { success: true };
    }

    public async generatePasswordSetupToken(userId: number): Promise<string> {
        const user = await prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
        });

        if (!user) {
            throw new BadRequestError("User not found");
        }

        const token = uuid();
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 48); // 48 hours expiry

        await prisma.user.update({
            where: { id: userId },
            data: {
                passwordSetupToken: token,
                passwordSetupExpiry: expiryDate,
            },
        });

        await this.mailService.sendWelcomeEmail(
            user.email,
            user.fullname,
            token,
            "en" // Default to English, can be enhanced later
        );

        return token;
    }
}
