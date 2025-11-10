import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { BadRequestError } from "routing-controllers";
import SessionService from "../session/session.service";
import Environment from "../../common/config/environment";
import { v4 as uuid } from "uuid";
import { OtpType } from "@prisma/client";
import MailService from "../mail/mail.service";

@Service()
export default class OtpRequestService {
    constructor(private mailService: MailService) {}

    public generateOtp(n: number): string {
        let add = 1,
            max = 12 - add;

        if (n > max) {
            return this.generateOtp(max) + this.generateOtp(n - max);
        }

        max = Math.pow(10, n + add);
        let min = max / 10; // Math.pow(10, n) basically
        let number = Math.floor(Math.random() * (max - min + 1)) + min;

        return ("" + number).substring(add);
    }

    private generateSecureOtp(length: number): string {
        // Generate cryptographically secure OTP
        const chars = "0123456789";
        let result = "";
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);

        for (let i = 0; i < length; i++) {
            result += chars[array[i] % chars.length];
        }

        return result;
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private async checkRateLimit(email: string, type: OtpType): Promise<void> {
        // Check if user has requested OTP recently (within last 1 minute)
        const recentRequest = await prisma.otpRequest.findFirst({
            where: {
                email: email,
                type: type,
                createdAt: {
                    gte: new Date(Date.now() - 60 * 1000), // 1 minute ago
                },
            },
        });

        if (recentRequest) {
            throw new BadRequestError(
                "Please wait before requesting another OTP"
            );
        }

        // Check daily limit (max 10 OTPs per email per day)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dailyCount = await prisma.otpRequest.count({
            where: {
                email: email,
                type: type,
                createdAt: {
                    gte: today,
                },
            },
        });

        if (dailyCount >= 10) {
            throw new BadRequestError(
                "Daily OTP limit exceeded. Please try again tomorrow"
            );
        }
    }

    public async sendMailOtp(
        userId: number | null,
        email: string,
        type: OtpType
    ) {
        // Validate email format
        if (!email || !this.isValidEmail(email)) {
            throw new BadRequestError("Invalid email address");
        }

        // Check rate limiting (prevent spam)
        await this.checkRateLimit(email, type);

        const otpCode = this.generateSecureOtp(6);

        await this.mailService.sendOtp(email, otpCode);

        const req = await this.createRequest(userId, otpCode, type, email);

        return req;
    }

    public async checkOtp(
        id: string,
        userId: number | null,
        otp: string
    ): Promise<"true" | "false" | "expired"> {
        // Validate input
        if (!id || !otp) {
            return "false";
        }

        const req = await prisma.otpRequest.findFirst({
            where: {
                id: id,
                userId: userId || undefined,
            },
        });

        if (!req) {
            return "false";
        }

        // Check if already verified
        if (req.verified) {
            return "expired";
        }

        // Check expiry using expiredAt field
        const currentTime = new Date();
        if (req.expiredAt < currentTime) {
            return "expired";
        }

        // Check attempt limit
        if (req.attempts >= 3) {
            return "expired";
        }

        // Verify OTP
        if (req.otp === otp) {
            await prisma.otpRequest.update({
                data: {
                    verified: true,
                },
                where: {
                    id: id,
                },
            });
            return "true";
        }

        // Increment attempts on wrong OTP
        await prisma.otpRequest.update({
            data: {
                attempts: {
                    increment: 1,
                },
            },
            where: {
                id: id,
            },
        });

        return "false";
    }

    private async createRequest(
        userId: number | null,
        otpCode: string,
        type: OtpType,
        email?: string
    ) {
        // Set expiry time (5 minutes from now)
        const expiredAt = new Date();
        expiredAt.setMinutes(expiredAt.getMinutes() + 5);

        // Check for existing unverified request
        let req = await prisma.otpRequest.findFirst({
            where: {
                OR: [
                    {
                        userId: userId || undefined,
                        type: type,
                        verified: false,
                    },
                    ...(email
                        ? [
                              {
                                  email: email,
                                  type: type,
                                  verified: false,
                              },
                          ]
                        : []),
                ],
            },
        });

        if (req) {
            // Update existing request
            req = await prisma.otpRequest.update({
                where: {
                    id: req.id,
                },
                data: {
                    otp: otpCode,
                    attempts: 0,
                    verified: false,
                    expiredAt: expiredAt,
                    createdAt: new Date(),
                },
            });
            return req;
        }

        // Create new request
        req = await prisma.otpRequest.create({
            data: {
                userId: userId || undefined,
                otp: otpCode,
                type: type,
                email: email,
                expiredAt: expiredAt,
            },
        });

        return req;
    }

    public async resendOtp(requestId: string): Promise<any> {
        // Find the existing request
        const existingReq = await prisma.otpRequest.findFirst({
            where: {
                id: requestId,
                verified: false,
            },
        });

        if (!existingReq) {
            throw new BadRequestError(
                "OTP request not found or already verified"
            );
        }

        // Check if enough time has passed since last request (1 minute)
        const timeSinceLastRequest =
            Date.now() - existingReq.createdAt.getTime();
        if (timeSinceLastRequest < 60000) {
            // 1 minute
            throw new BadRequestError(
                "Please wait before requesting another OTP"
            );
        }

        // Generate new OTP
        const newOtpCode = this.generateSecureOtp(6);

        // Update the request with new OTP
        const updatedReq = await prisma.otpRequest.update({
            where: {
                id: requestId,
            },
            data: {
                otp: newOtpCode,
                attempts: 0,
                expiredAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
                createdAt: new Date(),
            },
        });

        // Send new OTP email
        if (existingReq.email) {
            await this.mailService.sendOtp(existingReq.email, newOtpCode);
        }

        return {
            id: updatedReq.id,
            message: "New OTP sent successfully",
        };
    }
}
