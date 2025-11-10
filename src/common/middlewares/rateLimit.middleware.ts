import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { HttpError } from "routing-controllers";

export const rateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    validate: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => req.headers["x-forwarded-for"] as string,
    handler: (req, res, next) => {
        const remainingTime = req.rateLimit.resetTime - Date.now();
        const hoursRemaining = Math.floor(remainingTime / (60 * 60 * 1000));
        const minutesRemaining = Math.floor(
            (remainingTime % (60 * 60 * 1000)) / (60 * 1000)
        );
        const secondsRemaining = Math.floor(
            (remainingTime % (60 * 1000)) / 1000
        );

        const errorMessage = `Too many requests from this IP: ${req.headers["x-forwarded-for"]}. Please wait ${hoursRemaining} hours, ${minutesRemaining} minutes, and ${secondsRemaining} seconds.`;

        throw new HttpError(429, errorMessage);
    },
});
