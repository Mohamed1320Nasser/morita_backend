import * as dotenv from "dotenv";
import path from "path";

export namespace Environment {
    dotenv.config();

    export namespace project {
        export const cdnDir: string =
            process.env.CDN_DIR || path.join(__dirname, "../../../photos/");
        export const logsDir: string =
            process.env.LOGS_DIR || path.join(__dirname, "../../../logs/");
        export const cdnLink: string = process.env.CDN_LINK || "http://localhost:3000/cdn";
    }

    export namespace Server {
        export const host: string = "127.0.0.1";
        export const port: string = "3000";
    }

    export namespace Email {
        export const host: string = process.env.MAIL_HOST || "";
        export const port: number = process.env.MAIL_PORT
            ? Number.parseInt(process.env.MAIL_PORT)
            : 465;
        export const user: string = process.env.MAIL_USER || "";
        export const password: string = process.env.MAIL_PASSWORD || "";
        export const email: string = process.env.EMAIL || "";
    }

    export const env = process.env.NODE_ENV || "development";
    export const jwtSecret = process.env.JWTSECRET || "secret";

    export const authorizationKey =
        process.env.AUTHORIZATION_KEY || "haconamatata_";
    let domain = process.env.DOMAIN || "";

    export const domains = [
        `https://${domain}`,
        `https://admin.${domain}`,
        `https://test.${domain}`,
        `http://localhost:3000`,
    ];

    export namespace Sentry {
        export const dsn: string = process.env.SENTRY_DSN || "";
        export const environment: string =
            process.env.SENTRY_ENVIRONMENT || "development";
    }
}

export default Environment;
