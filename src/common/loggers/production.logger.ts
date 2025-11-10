import * as path from "path";
import * as fs from "fs";
import * as winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import Environment from "../config/environment";
import AdmZip from "adm-zip";
import logger from ".";
import * as Sentry from "@sentry/node";

export default function createProductionLogger() {
    const myFormat = winston.format.combine(
        winston.format.timestamp({
            format: "HH:mm:ss",
        }),
        winston.format.json()
    );

    const getPath = (addDays: number = 0): string => {
        const d = new Date();
        addDays == 0 || d.setDate(d.getDate() + addDays);
        const [year, month, day] = [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, "0"),
            String(d.getDate()).padStart(2, "0"),
        ];
        return path.join(
            Environment.project.logsDir,
            `/${year}/${month}/${day}`
        );
    };

    const transport: DailyRotateFile = new DailyRotateFile({
        filename: "%DATE%.log",
        dirname: getPath(),
        datePattern: "YYYY-MM-DD-HH",
        maxSize: "20m",
    });

    transport.on("new", async function (file) {
        const lastDay = getPath(-1);
        const zipPath = path.join(
            path.dirname(lastDay),
            path.parse(lastDay).name + ".zip"
        );
        if (fs.existsSync(lastDay)) {
            try {
                const files = fs.readdirSync(lastDay);
                if (files.length) {
                    let zip = new AdmZip();
                    zip.addLocalFolder(lastDay);
                    fs.writeFileSync(
                        zipPath,
                        zip.toBuffer() as NodeJS.ArrayBufferView
                    );
                    await zip.writeZipPromise(zipPath);
                }
            } catch (err) {
                logger.error(err);
                Sentry.captureException(err);
            }
        }
        fs.rmSync(lastDay, { recursive: true, force: true });
    });

    return winston.createLogger({
        level: "info",
        format: myFormat,
        transports: [transport],
    });
}
