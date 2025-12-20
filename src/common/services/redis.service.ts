import { Service } from "typedi";
import Redis from "ioredis";
import logger from "../loggers";
import { CACHE_TTL } from "../constants/security.constants";

/**
 * Redis Service for Caching and Temporary Data Storage
 * Replaces in-memory caching for production-ready persistence
 */
@Service()
export class RedisService {
    private client: Redis | null = null;
    private isConnected: boolean = false;
    private fallbackCache: Map<string, { value: any; expiry: number }> = new Map();

    constructor() {
        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

            this.client = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                enableReadyCheck: true,
                retryStrategy(times) {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
            });

            this.client.on("connect", () => {
                logger.info("[Redis] Connected successfully");
                this.isConnected = true;
            });

            this.client.on("error", (error) => {
                logger.error("[Redis] Connection error:", error);
                this.isConnected = false;
            });

            this.client.on("close", () => {
                logger.warn("[Redis] Connection closed");
                this.isConnected = false;
            });

            // Test connection
            await this.client.ping();
        } catch (error) {
            logger.error("[Redis] Failed to initialize, falling back to in-memory cache:", error);
            this.client = null;
            this.isConnected = false;
        }
    }

    /**
     * Set a value with TTL
     */
    async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        try {
            const serialized = JSON.stringify(value);

            if (this.client && this.isConnected) {
                if (ttlSeconds) {
                    await this.client.setex(key, ttlSeconds, serialized);
                } else {
                    await this.client.set(key, serialized);
                }
            } else {
                // Fallback to in-memory
                const expiry = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : Infinity;
                this.fallbackCache.set(key, { value: serialized, expiry });

                // Auto-cleanup
                if (ttlSeconds) {
                    setTimeout(() => this.fallbackCache.delete(key), ttlSeconds * 1000);
                }
            }
        } catch (error) {
            logger.error(`[Redis] Error setting key ${key}:`, error);
            throw error;
        }
    }

    /**
     * Get a value
     */
    async get<T = any>(key: string): Promise<T | null> {
        try {
            let serialized: string | null = null;

            if (this.client && this.isConnected) {
                serialized = await this.client.get(key);
            } else {
                // Fallback to in-memory
                const cached = this.fallbackCache.get(key);
                if (cached && cached.expiry > Date.now()) {
                    serialized = cached.value;
                } else if (cached) {
                    this.fallbackCache.delete(key);
                }
            }

            if (!serialized) {
                return null;
            }

            return JSON.parse(serialized) as T;
        } catch (error) {
            logger.error(`[Redis] Error getting key ${key}:`, error);
            return null;
        }
    }

    /**
     * Delete a key
     */
    async delete(key: string): Promise<void> {
        try {
            if (this.client && this.isConnected) {
                await this.client.del(key);
            } else {
                this.fallbackCache.delete(key);
            }
        } catch (error) {
            logger.error(`[Redis] Error deleting key ${key}:`, error);
        }
    }

    /**
     * Check if key exists
     */
    async exists(key: string): Promise<boolean> {
        try {
            if (this.client && this.isConnected) {
                const result = await this.client.exists(key);
                return result === 1;
            } else {
                const cached = this.fallbackCache.get(key);
                return cached !== undefined && cached.expiry > Date.now();
            }
        } catch (error) {
            logger.error(`[Redis] Error checking existence of key ${key}:`, error);
            return false;
        }
    }

    /**
     * Increment a counter
     */
    async increment(key: string): Promise<number> {
        try {
            if (this.client && this.isConnected) {
                return await this.client.incr(key);
            } else {
                const cached = this.fallbackCache.get(key);
                const currentValue = cached ? parseInt(cached.value) : 0;
                const newValue = currentValue + 1;
                this.fallbackCache.set(key, { value: String(newValue), expiry: Infinity });
                return newValue;
            }
        } catch (error) {
            logger.error(`[Redis] Error incrementing key ${key}:`, error);
            throw error;
        }
    }

    /**
     * Set with NX (only if not exists) - for idempotency
     */
    async setNX(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
        try {
            const serialized = JSON.stringify(value);

            if (this.client && this.isConnected) {
                const result = await this.client.set(key, serialized, "NX", "EX", ttlSeconds || 86400);
                return result === "OK";
            } else {
                // Fallback to in-memory
                if (this.fallbackCache.has(key)) {
                    return false; // Already exists
                }
                const expiry = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : Infinity;
                this.fallbackCache.set(key, { value: serialized, expiry });
                return true;
            }
        } catch (error) {
            logger.error(`[Redis] Error setting NX key ${key}:`, error);
            return false;
        }
    }

    /**
     * Get multiple keys
     */
    async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
        try {
            if (this.client && this.isConnected) {
                const values = await this.client.mget(...keys);
                return values.map(v => v ? JSON.parse(v) as T : null);
            } else {
                return keys.map(key => {
                    const cached = this.fallbackCache.get(key);
                    if (cached && cached.expiry > Date.now()) {
                        return JSON.parse(cached.value) as T;
                    }
                    return null;
                });
            }
        } catch (error) {
            logger.error(`[Redis] Error getting multiple keys:`, error);
            return keys.map(() => null);
        }
    }

    /**
     * Cleanup - clear expired entries from fallback cache
     */
    private cleanupFallback(): void {
        const now = Date.now();
        for (const [key, value] of this.fallbackCache.entries()) {
            if (value.expiry <= now) {
                this.fallbackCache.delete(key);
            }
        }
    }

    /**
     * Close connection
     */
    async close(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.client = null;
            this.isConnected = false;
        }
    }

    /**
     * Helper: Store order data temporarily
     */
    async storeOrderData(key: string, data: any): Promise<void> {
        await this.set(`order:${key}`, data, CACHE_TTL.ORDER_DATA_TTL_MS / 1000);
    }

    /**
     * Helper: Get order data
     */
    async getOrderData(key: string): Promise<any | null> {
        return await this.get(`order:${key}`);
    }

    /**
     * Helper: Delete order data
     */
    async deleteOrderData(key: string): Promise<void> {
        await this.delete(`order:${key}`);
    }

    /**
     * Helper: Check idempotency key
     */
    async checkIdempotency(key: string, result: any): Promise<{ exists: boolean; result: any | null }> {
        const fullKey = `idempotency:${key}`;
        const existing = await this.get(fullKey);

        if (existing) {
            return { exists: true, result: existing };
        }

        // Store new result
        await this.set(fullKey, result, CACHE_TTL.IDEMPOTENCY_KEY_TTL_SECONDS);
        return { exists: false, result: null };
    }
}

// Create singleton instance
let redisServiceInstance: RedisService | null = null;

export function getRedisService(): RedisService {
    if (!redisServiceInstance) {
        redisServiceInstance = new RedisService();
    }
    return redisServiceInstance;
}

export default RedisService;
