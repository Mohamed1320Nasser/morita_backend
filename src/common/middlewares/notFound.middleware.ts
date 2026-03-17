import {
    Middleware,
    ExpressMiddlewareInterface,
    NotFoundError,
} from "routing-controllers";
import { Service } from "typedi";
import { NextFunction, Request, Response } from "express";
import logger from "../loggers";

@Service()
@Middleware({ type: "after" })
export class NotFoundMiddleware implements ExpressMiddlewareInterface {
    use = (req: Request, res: Response, next: NextFunction) => {
        if (!res.headersSent) {
            // Check if this is an expected 404 (business logic, not missing route)
            const isExpected404 = this.isExpected404(req);

            if (isExpected404) {
                // For expected 404s, send response without logging error
                res.status(404).json({
                    name: "NotFoundError",
                    message: "not found"
                });
                res.end();
                return;
            }

            // For unexpected 404s (actual missing routes), log and throw error
            logger.warn(`[404] ${req.method} ${req.path} - Route not found`);
            next(new NotFoundError("not found"));
        } else {
            res.end();
        }
    };

    private isExpected404(req: Request): boolean {
        // These endpoints return 404 as part of normal business logic
        const expected404Patterns = [
            /^\/users\/discord\/\d+$/,          // GET /users/discord/{id} - user doesn't exist yet
            /^\/users\/\d+$/,                   // GET /users/{id}
            /^\/onboarding\/sessions\/\d+$/,   // GET /onboarding/sessions/{id}
        ];

        return req.method === 'GET' && expected404Patterns.some(pattern => pattern.test(req.path));
    }
}
