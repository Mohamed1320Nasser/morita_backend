import { Service } from "typedi";
import nodemailer from "nodemailer";
import { BadRequestError } from "routing-controllers";
import SessionService from "../session/session.service";
import prisma from "../../common/prisma/client";
import { nodemailerConfig } from "../../common/config/nodemailer.config";
import logger from "../../common/loggers";
import { isEmail } from "class-validator";

@Service()
export default class MailService {
    constructor(private sessionService: SessionService) {}

    public async sendOtp(email: string, otpCode: string) {
        if (!isEmail(email)) throw new BadRequestError("Invalid email");
        const subject = `Your One-Time Password (OTP) - ICV`;
        const content = `
            <div class="content">
                <h6>Hello,</h6>
                <p>You have requested a One-Time Password (OTP) for your ICV account.</p>
                <div style="
                    background: #f8f9fa;
                    border: 2px solid #1D4A9A;
                    border-radius: 8px;
                    padding: 20px;
                    text-align: center;
                    margin: 20px 0;
                    font-family: 'Courier New', monospace;
                ">
                    <h2 style="
                        color: #1D4A9A;
                        font-size: 32px;
                        letter-spacing: 8px;
                        margin: 0;
                        font-weight: bold;
                    ">${otpCode}</h2>
                </div>
                <p><strong>Important Security Information:</strong></p>
                <ul style="color: #666; line-height: 1.6;">
                    <li>This OTP is valid for <strong>5 minutes</strong> only</li>
                    <li>Do not share this code with anyone</li>
                    <li>ICV will never ask for your OTP via phone or email</li>
                    <li>If you didn't request this OTP, please ignore this email</li>
                </ul>
                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                    For security reasons, this OTP will expire automatically. If you need a new OTP, please request one from the application.
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <h6 style="color: #1D4A9A;">ICV Security Team</h6>
            </div>
        `;
        await this.sendMail(email, subject, content);
    }

    public async sendConfigurationMessage(email: string) {
        const subject = `Password Reset for ICV Account`;
        const content = `
            <div class="content">
                <h6>Hello,</h6>
                <p>We are writing to confirm that your password has been successfully reset for your ICV account.</p>
                <p>If you did not request this password reset or if you have any concerns regarding the security of your ICV account, please do not hesitate to contact our support team immediately.</p>
                <h6>ICV Customer Support Team</h6>
                <h6>ICV Team</h6>
            </div>
        `;
        await this.sendMail(email, subject, content);
    }

    public async sendWelcomeEmail(
        email: string,
        fullname: string,
        token: string,
        lang: string = "en"
    ) {
        // Generate setup URL internally
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const setupUrl = `${frontendUrl}/set-password?token=${token}`;
        const isArabic = lang === "ar";
        const subject = isArabic
            ? "مرحباً بك في ICV - إعداد كلمة المرور"
            : "Welcome to ICV - Set Up Your Password";

        const content = `
            <div class="content" dir="${isArabic ? "rtl" : "ltr"}">
                <h6>${isArabic ? `مرحباً ${fullname}،` : `Hello ${fullname},`}</h6>
                <p>${
                    isArabic
                        ? "مرحباً بك في منصة ICV! نحن سعداء لانضمامك إلينا."
                        : "Welcome to ICV platform! We are excited to have you join us."
                }</p>
                <p>${
                    isArabic
                        ? "لإكمال إعداد حسابك، يرجى النقر على الزر أدناه لتعيين كلمة المرور الخاصة بك."
                        : "To complete your account setup, please click the button below to set up your password."
                }</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${setupUrl}" style="
                        background: linear-gradient(135deg, #1D4A9A 0%, #1ABAEC 100%);
                        color: white;
                        padding: 15px 30px;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: 600;
                        display: inline-block;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    ">${isArabic ? "إعداد كلمة المرور" : "Set Up Password"}</a>
                </div>
                <p style="color: #666; font-size: 14px;">${
                    isArabic
                        ? "هذا الرابط صالح لمدة 24 ساعة فقط. إذا لم تطلب هذا الرابط، يرجى تجاهل هذه الرسالة."
                        : "This link is valid for 24 hours only. If you did not request this link, please ignore this message."
                }</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <h6 style="color: #1D4A9A;">${isArabic ? "فريق دعم عملاء ICV" : "ICV Customer Support Team"}</h6>
            </div>
        `;
        await this.sendMail(email, subject, content);
    }

    public async sendPasswordSetupSuccess(
        email: string,
        fullname: string,
        lang: string = "en"
    ) {
        const isArabic = lang === "ar";
        const subject = isArabic
            ? "تم إعداد كلمة المرور بنجاح - ICV"
            : "Password Set Up Successfully - ICV";

        const content = `
            <div class="content" dir="${isArabic ? "rtl" : "ltr"}">
                <h6>${isArabic ? `مرحباً ${fullname}،` : `Hello ${fullname},`}</h6>
                <p>${
                    isArabic
                        ? "تم إعداد كلمة المرور الخاصة بحسابك في ICV بنجاح!"
                        : "Your ICV account password has been set up successfully!"
                }</p>
                <p>${
                    isArabic
                        ? "يمكنك الآن تسجيل الدخول إلى حسابك باستخدام بريدك الإلكتروني وكلمة المرور الجديدة."
                        : "You can now log in to your account using your email and new password."
                }</p>
                <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0; color: #155724;">${
                        isArabic
                            ? "✅ تم تأكيد إعداد كلمة المرور بنجاح"
                            : "✅ Password setup confirmed successfully"
                    }</p>
                </div>
                <p>${
                    isArabic
                        ? "إذا كان لديك أي أسئلة أو تحتاج إلى مساعدة، لا تتردد في الاتصال بفريق الدعم."
                        : "If you have any questions or need assistance, please don't hesitate to contact our support team."
                }</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <h6 style="color: #1D4A9A;">${isArabic ? "فريق دعم عملاء ICV" : "ICV Customer Support Team"}</h6>
            </div>
        `;
        await this.sendMail(email, subject, content);
    }

    public async sendMailToUser(
        userId: number,
        msg_ar: string,
        msg_en: string,
        data?: string
    ) {
        const user = await prisma.user.findFirst({
            where: { id: userId, banned: false },
        });

        if (!user || !user.email) {
            throw new BadRequestError("User not found");
        }

        const userLang = await this.sessionService.getPreferredLanguage(userId);
        const langCode = userLang?.langCode || "en";

        let msg =
            langCode == "ar"
                ? {
                      subject: `رسالة من ICV`,
                      content: `
                <div class="content">
                    <h6>مرحبا</h6>
                    <p>${msg_ar}</p>
                    <h6>فريق دعم عملاء ICV</h6>
                </div>
            `,
                  }
                : {
                      subject: `ICV Message`,
                      content: `
                <div class="content">
                    <h6>Hello</h6>
                    <p>${msg_en}</p>
                    <h6>ICV Customer Support Team</h6>
                </div>
            `,
                  };
        if (data) {
            msg.content += `
                <div class="data">
                    <p>reason: ${data}</p>
                </div>
            `;
        }
        await this.sendMail(user.email, msg.subject, msg.content);
    }

    private async sendMail(
        to: string,
        subject: string,
        content: string
    ): Promise<void> {
        try {
            const transporter = nodemailer.createTransport(nodemailerConfig);
            const info = await transporter.sendMail({
                from: `"ICV" <no-reply@ICV.net>`,
                to,
                subject,
                html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ICV Email</title>
                    <link rel="preconnect" href="https://fonts.googleapis.com">
                    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700&display=swap" rel="stylesheet">
                    <style>
                        body {
                        background-color: #f8f9fa;
                            font-family: 'Poppins', sans-serif;
                        margin: 0;
                        padding: 20px;
                        line-height: 1.6;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 0 auto;
                        background: #ffffff;
                        border-radius: 10px;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        overflow: hidden;
                    }
                    .header {
                        background: linear-gradient(135deg, #1D4A9A 0%, #1ABAEC 100%);
                        padding: 30px;
                            text-align: center;
                    }
                    .logo {
                        color: white;
                        font-size: 28px;
                        font-weight: 600;
                            margin: 0;
                        }
                    .content {
                        padding: 40px 30px;
                        color: #333;
                    }
                    .content h6 {
                        font-size: 18px;
                        font-weight: 500;
                        margin: 0 0 20px 0;
                        color: #1D4A9A;
                    }
                    .content p {
                            font-size: 16px;
                            margin: 15px 0;
                        color: #555;
                    }
                    .footer {
                        background: #f8f9fa;
                        padding: 20px 30px;
                        text-align: center;
                        border-top: 1px solid #eee;
                    }
                    .footer p {
                        margin: 0;
                        font-size: 14px;
                        color: #666;
                    }
                    @media (max-width: 600px) {
                        .email-container {
                            margin: 10px;
                            border-radius: 5px;
                        }
                        .content {
                            padding: 20px;
                        }
                        }
                    </style>
                </head>
                <body>
                <div class="email-container">
                    <div class="header">
                        <h1 class="logo">ICV</h1>
                    </div>
                    ${content}
                    <div class="footer">
                        <p>&copy; 2024 ICV. All rights reserved.</p>
                    </div>
                </div>
                </body>
                </html>
        `,
            });

            await transporter.close();
            logger.info(`Email sent: ${info.messageId}`);
        } catch (error) {
            logger.error(`Error sending email: ${error}`);
            throw new Error(`Failed to send email: ${error}`);
        }
    }
}
