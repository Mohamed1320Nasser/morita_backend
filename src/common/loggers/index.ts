import * as winston from "winston";
import createProductionLogger from "./production.logger";
import createDevelopmentLogger from "./development.logger";
import Environment from "../config/environment";

let logger: winston.Logger;

if (Environment.env === "production") {
    logger = createProductionLogger();
} else {
    logger = createDevelopmentLogger();
}

export default logger;
