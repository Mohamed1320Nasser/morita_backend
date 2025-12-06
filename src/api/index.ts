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

        // Load default export
        if (controller.default) {
            controllers.push(controller.default);
            logger.info(
                `controller loaded: ${controller.default.name}, file: ${_path}`
            );
        }

        // Also load named exports that are controllers (routing-controllers classes)
        Object.keys(controller).forEach(key => {
            if (key !== 'default' && controller[key] && typeof controller[key] === 'function') {
                // Check if it's a controller class (has routing-controllers metadata)
                const potentialController = controller[key];
                if (potentialController.prototype && potentialController.name) {
                    controllers.push(potentialController);
                    logger.info(
                        `controller loaded (named export): ${potentialController.name}, file: ${_path}`
                    );
                }
            }
        });

        if (!controller.default && Object.keys(controller).length === 0) {
            logger.warn(
                `controller file skipped (no exports): ${_path}`
            );
        }
    }
    return controllers;
}
