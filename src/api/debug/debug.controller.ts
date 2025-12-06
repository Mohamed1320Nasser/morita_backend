import { JsonController, Get, Req } from "routing-controllers";
import { Service } from "typedi";
import { Request } from "express";
import logger from "../../common/loggers";

@JsonController("/api/debug")
@Service()
export default class DebugController {
    @Get("/whoami")
    async whoami(@Req() req: Request) {
        logger.info("[Debug] Checking user authentication");

        const token = req.headers["authorization"];

        return {
            success: true,
            data: {
                hasToken: !!token,
                token: token ? `${token.substring(0, 20)}...` : null,
                user: req.user || null,
                headers: {
                    authorization: req.headers["authorization"] ? "present" : "missing",
                },
            },
        };
    }
}
