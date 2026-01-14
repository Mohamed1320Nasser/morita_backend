import { getSelectMenuResetManager } from "../services/selectMenuResetManager";
import logger from "../../common/loggers";

export class ResetManagerMonitor {
    private static monitoringInterval: NodeJS.Timeout | null = null;
    private static readonly MONITOR_INTERVAL = 60000; 

    static startMonitoring(): void {
        if (this.monitoringInterval) {
            logger.warn("[ResetManagerMonitor] Monitoring already started");
            return;
        }

        this.monitoringInterval = setInterval(() => {
            this.logHealthCheck();
        }, this.MONITOR_INTERVAL);

        logger.info(
            `[ResetManagerMonitor] Started monitoring (interval: ${this.MONITOR_INTERVAL}ms)`
        );
    }

    static stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger.info("[ResetManagerMonitor] Stopped monitoring");
        }
    }

    static logHealthCheck(): void {
        const resetManager = getSelectMenuResetManager();
        const stats = resetManager.getStats();
        const metrics = resetManager.getMetrics();

        const successRate =
            metrics.totalResets > 0
                ? ((metrics.successfulResets / metrics.totalResets) * 100).toFixed(2)
                : "N/A";

        const totalCacheRequests = metrics.cacheHits + metrics.cacheMisses;
        const cacheHitRate =
            totalCacheRequests > 0
                ? ((metrics.cacheHits / totalCacheRequests) * 100).toFixed(2)
                : "N/A";

        logger.info("[ResetManagerMonitor] Health Check", {
            pendingResets: stats.pendingResets,
            registeredMessages: stats.registeredMessages,
            activeLocks: stats.activeLocks,
            cacheAge: stats.cacheAge > 0 ? `${stats.cacheAge}ms` : "N/A",
            metrics: {
                totalResets: metrics.totalResets,
                successfulResets: metrics.successfulResets,
                failedResets: metrics.failedResets,
                successRate: `${successRate}%`,
                retries: metrics.retries,
                cacheHits: metrics.cacheHits,
                cacheMisses: metrics.cacheMisses,
                cacheHitRate: `${cacheHitRate}%`,
            },
        });

        if (metrics.totalResets > 10 && parseFloat(successRate) < 80) {
            logger.warn(
                `[ResetManagerMonitor] LOW SUCCESS RATE DETECTED: ${successRate}% (${metrics.successfulResets}/${metrics.totalResets})`
            );
        }

        if (stats.activeLocks > 5) {
            logger.warn(
                `[ResetManagerMonitor] HIGH ACTIVE LOCKS: ${stats.activeLocks} (potential deadlock)`
            );
        }

        if (stats.cacheAge > 60000) {
            logger.debug(
                `[ResetManagerMonitor] Cache is old: ${stats.cacheAge}ms`
            );
        }
    }

    static getHealthStatus(): {
        status: "healthy" | "warning" | "critical";
        message: string;
        stats: ReturnType<typeof getSelectMenuResetManager.prototype.getStats>;
    } {
        const resetManager = getSelectMenuResetManager();
        const stats = resetManager.getStats();
        const metrics = resetManager.getMetrics();

        const successRate =
            metrics.totalResets > 0
                ? (metrics.successfulResets / metrics.totalResets) * 100
                : 100;

        if (metrics.totalResets > 10 && successRate < 50) {
            return {
                status: "critical",
                message: `Critical: Success rate is ${successRate.toFixed(2)}%`,
                stats,
            };
        }

        if (metrics.totalResets > 10 && successRate < 80) {
            return {
                status: "warning",
                message: `Warning: Success rate is ${successRate.toFixed(2)}%`,
                stats,
            };
        }

        if (stats.activeLocks > 5) {
            return {
                status: "warning",
                message: `Warning: ${stats.activeLocks} active locks (potential deadlock)`,
                stats,
            };
        }

        return {
            status: "healthy",
            message: `Healthy: ${successRate.toFixed(2)}% success rate, ${metrics.totalResets} total resets`,
            stats,
        };
    }
}
