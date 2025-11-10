import morgan from "morgan";
import Environment from "../config/environment";
import logger from "../loggers";

const stream = {
    write: (message: string) => logger.http(message.trim()),
};

const skip = () => {
    return Environment.env === "production";
};

export const morganMiddleware = morgan(
    "[:method] :url [:status] - :response-time ms",
    {
        stream,
        skip,
    }
);
