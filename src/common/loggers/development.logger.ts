import * as winston from "winston";

export default function createDevelopmentLogger() {
    const colorizer = winston.format.colorize();

    const colors = {
        error: "red",
        warn: "yellow",
        info: "green",
        http: "cyan",
        debug: "white",
    };

    colorizer.addColors(colors);

    const myFormat = winston.format.combine(
        // winston.format.colorize({
        //     all: true
        // }),
        winston.format.label({
            label: "[LOGGER]",
        }),
        winston.format.timestamp({
            format: "HH:mm:ss",
        }),
        winston.format.printf(info => {
            info.message =
                typeof info.message == "object"
                    ? JSON.stringify(info.message, null, 3)
                    : info.message;
            return colorizer.colorize(
                info.level,
                `${info.label} [${info.level.toUpperCase()}] [${info.timestamp}] ${info.message}`
            );
        })
    );

    return winston.createLogger({
        level: "debug",
        transports: [
            new winston.transports.Console({
                format: myFormat,
            }),
        ],
    });
}
