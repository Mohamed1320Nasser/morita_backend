import {
    Middleware,
    ExpressMiddlewareInterface,
    NotFoundError,
} from "routing-controllers";
import { Service } from "typedi";
import { NextFunction, Request, Response } from "express";

@Service()
@Middleware({ type: "after" })
export class NotFoundMiddleware implements ExpressMiddlewareInterface {
    use = (req: Request, res: Response, next: NextFunction) => {
        if (!res.headersSent) {
            next(new NotFoundError("not found"));
        }
        res.end();
    };
}
