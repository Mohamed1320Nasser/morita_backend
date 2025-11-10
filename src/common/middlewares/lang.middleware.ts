import { Middleware, ExpressMiddlewareInterface } from "routing-controllers";
import { Service } from "typedi";
import { NextFunction, Response, Request } from "express";
import { type langCode, langs } from "../language";

@Service()
@Middleware({ type: "before", priority: 1 })
export class LangMiddleware implements ExpressMiddlewareInterface {
    use = async (req: Request, res: Response, next: NextFunction) => {
        if (!req.headers["accept-language"]) {
            req.headers["accept-language"] = "ar";
        }
        const l = req.headers["accept-language"].toLowerCase() || "en";
        if ((langs as unknown as any[]).includes(l)) {
            req.lang = l as langCode;
        } else {
            req.lang = "en";
        }
        next();
    };
}
