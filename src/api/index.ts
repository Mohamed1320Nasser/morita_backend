import path from "path";
import { getFilesByPattern } from "../common/helpers/path.helper";
import logger from "../common/loggers";

export default async function getControllers() {
    const controllers: any[] = [];
    const pattern = path.resolve(__dirname, "./**/*.controller.*");
    logger.info(`controller pattern: ${pattern}`);
    const controllersFiles = await getFilesByPattern(pattern);
    for (let index = 0; index < controllersFiles.length; index++) {
        const _path = path.resolve(__dirname, controllersFiles[index]);
        const controller = await import(_path);
        if (controller.default) {
            controllers.push(controller.default);
            logger.info(
                `controller loaded: ${controller.default.name}, file: ${_path}`
            );
        } else {
            logger.warn(
                `controller file skipped (no default export): ${_path}`
            );
        }
    }
    return controllers;
}
