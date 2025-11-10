import type SMTPTransport from "nodemailer/lib/smtp-transport";
import Environment from "./environment";

export const nodemailerConfig: SMTPTransport.Options = {
    host: Environment.Email.host,
    port: Environment.Email.port,
    secure: Environment.Email.port == 465,
    auth: {
        user: Environment.Email.user,
        pass: Environment.Email.password,
    },
};
