import { Request, Response, NextFunction } from "express";
import { ExpressMiddlewareInterface } from "routing-controllers";
import { Service } from "typedi";
import logger from "../loggers";
import { discordConfig } from "../../discord-bot/config/discord.config";

/**
 * Discord API Authentication Middleware
 * Verifies that requests to Discord endpoints are coming from the authorized Discord bot
 *
 * Usage:
 * @UseBefore(DiscordAuthMiddleware)
 */
@Service()
export class DiscordAuthMiddleware implements ExpressMiddlewareInterface {
    use(request: Request, response: Response, next: NextFunction): void {
        try {
            // Check for API key in headers
            const apiKey = request.headers["x-api-key"] || request.headers["authorization"];

            // Get configured bot API key from environment
            const validApiKey = discordConfig.apiAuthToken || process.env.DISCORD_BOT_API_KEY;

            // If no valid API key is configured, log critical error
            if (!validApiKey || validApiKey.length < 32) {
                logger.error("[DiscordAuth] CRITICAL: No valid Discord bot API key configured!");
                response.status(500).json({
                    success: false,
                    error: "Server configuration error",
                    message: "Discord bot authentication is not properly configured"
                });
                return;
            }

            // Verify API key
            if (!apiKey) {
                logger.warn("[DiscordAuth] Request rejected: Missing API key", {
                    ip: request.ip,
                    path: request.path,
                    method: request.method
                });

                response.status(401).json({
                    success: false,
                    error: "Unauthorized",
                    message: "API key is required for Discord endpoints"
                });
                return;
            }

            // Extract Bearer token if present
            let providedKey = apiKey;
            if (typeof apiKey === "string" && apiKey.startsWith("Bearer ")) {
                providedKey = apiKey.substring(7);
            }

            // Constant-time comparison to prevent timing attacks
            if (!this.constantTimeCompare(String(providedKey), validApiKey)) {
                logger.warn("[DiscordAuth] Request rejected: Invalid API key", {
                    ip: request.ip,
                    path: request.path,
                    method: request.method,
                    providedKeyPrefix: String(providedKey).substring(0, 8) + "..."
                });

                response.status(401).json({
                    success: false,
                    error: "Unauthorized",
                    message: "Invalid API key"
                });
                return;
            }

            // Authentication successful
            logger.debug("[DiscordAuth] Request authenticated", {
                path: request.path,
                method: request.method
            });

            next();
        } catch (error) {
            logger.error("[DiscordAuth] Authentication error:", error);
            response.status(500).json({
                success: false,
                error: "Internal server error",
                message: "Authentication check failed"
            });
        }
    }

    /**
     * Constant-time string comparison to prevent timing attacks
     */
    private constantTimeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) {
            return false;
        }

        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }

        return result === 0;
    }
}

/**
 * Optional: IP Whitelist Middleware
 * Additional security layer to restrict Discord endpoints to specific IPs
 */
@Service()
export class IPWhitelistMiddleware implements ExpressMiddlewareInterface {
    private allowedIPs: string[];

    constructor() {
        // Load allowed IPs from environment
        const ipList = process.env.DISCORD_BOT_ALLOWED_IPS || "";
        this.allowedIPs = ipList.split(",").map(ip => ip.trim()).filter(ip => ip.length > 0);

        // In development, allow localhost
        if (process.env.NODE_ENV === "development") {
            this.allowedIPs.push("127.0.0.1", "::1", "::ffff:127.0.0.1");
        }
    }

    use(request: Request, response: Response, next: NextFunction): void {
        // If no IP whitelist configured, skip this check
        if (this.allowedIPs.length === 0) {
            next();
            return;
        }

        const clientIP = request.ip || request.connection.remoteAddress || "";

        // Check if IP is whitelisted
        if (!this.allowedIPs.includes(clientIP)) {
            logger.warn("[IPWhitelist] Request rejected: IP not whitelisted", {
                ip: clientIP,
                path: request.path,
                allowedIPs: this.allowedIPs
            });

            response.status(403).json({
                success: false,
                error: "Forbidden",
                message: "IP address not authorized"
            });
            return;
        }

        next();
    }
}

/**
 * Rate Limiting Middleware for Discord Endpoints
 * Prevents abuse and DOS attacks
 */
@Service()
export class DiscordRateLimitMiddleware implements ExpressMiddlewareInterface {
    private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
    private readonly MAX_REQUESTS_PER_MINUTE = 60;
    private readonly WINDOW_MS = 60000; // 1 minute

    use(request: Request, response: Response, next: NextFunction): void {
        const identifier = this.getIdentifier(request);
        const now = Date.now();

        // Clean up old entries
        this.cleanup(now);

        // Get or create rate limit entry
        let entry = this.requestCounts.get(identifier);

        if (!entry || now > entry.resetTime) {
            // Create new entry
            entry = {
                count: 0,
                resetTime: now + this.WINDOW_MS
            };
            this.requestCounts.set(identifier, entry);
        }

        // Increment counter
        entry.count++;

        // Check if limit exceeded
        if (entry.count > this.MAX_REQUESTS_PER_MINUTE) {
            const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

            logger.warn("[RateLimit] Request rejected: Rate limit exceeded", {
                identifier,
                count: entry.count,
                limit: this.MAX_REQUESTS_PER_MINUTE,
                retryAfter
            });

            response.status(429).json({
                success: false,
                error: "Too Many Requests",
                message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
                retryAfter
            });
            return;
        }

        // Add rate limit headers
        response.setHeader("X-RateLimit-Limit", this.MAX_REQUESTS_PER_MINUTE);
        response.setHeader("X-RateLimit-Remaining", this.MAX_REQUESTS_PER_MINUTE - entry.count);
        response.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetTime / 1000));

        next();
    }

    private getIdentifier(request: Request): string {
        // Use API key as identifier if available, otherwise IP
        const apiKey = request.headers["x-api-key"] || request.headers["authorization"];
        if (apiKey) {
            return `key:${apiKey}`;
        }
        return `ip:${request.ip}`;
    }

    private cleanup(now: number): void {
        // Remove entries older than 5 minutes
        const cutoff = now - (5 * 60 * 1000);
        for (const [key, value] of this.requestCounts.entries()) {
            if (value.resetTime < cutoff) {
                this.requestCounts.delete(key);
            }
        }
    }
}
