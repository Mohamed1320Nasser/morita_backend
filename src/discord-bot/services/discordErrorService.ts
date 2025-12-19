/**
 * Discord Error Service
 *
 * Advanced error tracking, metrics, and analytics service.
 * Provides:
 * - Error statistics and metrics
 * - Error rate monitoring
 * - Alert system for error spikes
 * - Error analytics and reporting
 * - Recovery strategies
 */

import logger from '../../common/loggers';
import {
  ErrorType,
  ErrorStatus,
  ErrorSeverity,
  DiscordError,
  ErrorMetadata,
  ErrorStatistics,
} from '../types/error.types';

/**
 * Error tracking entry
 */
interface ErrorTrackingEntry {
  error: DiscordError;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  affectedUsers: Set<string>;
  interactionTypes: Set<string>;
}

/**
 * Alert configuration
 */
interface AlertConfig {
  /** Enable/disable alerts */
  enabled: boolean;

  /** Error count threshold for alert */
  errorThreshold: number;

  /** Time window in minutes */
  timeWindow: number;

  /** Alert cooldown in minutes */
  cooldown: number;
}

/**
 * Discord Error Service Class
 */
export class DiscordErrorService {
  private static instance: DiscordErrorService;

  /** Error tracking map */
  private errorTracking: Map<ErrorType, ErrorTrackingEntry> = new Map();

  /** Recent errors (last 24 hours) */
  private recentErrors: DiscordError[] = [];

  /** Maximum recent errors to keep */
  private readonly MAX_RECENT_ERRORS = 1000;

  /** Alert configuration */
  private alertConfig: AlertConfig = {
    enabled: true,
    errorThreshold: 10,
    timeWindow: 5, // minutes
    cooldown: 15, // minutes
  };

  /** Last alert timestamp by error type */
  private lastAlertTime: Map<ErrorType, Date> = new Map();

  /** Service start time */
  private startTime: Date = new Date();

  private constructor() {
    // Private constructor for singleton
    this.startCleanupJob();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DiscordErrorService {
    if (!DiscordErrorService.instance) {
      DiscordErrorService.instance = new DiscordErrorService();
    }
    return DiscordErrorService.instance;
  }

  /**
   * Track a new error
   *
   * @param error - DiscordError to track
   */
  public trackError(error: DiscordError): void {
    try {
      // Add to recent errors
      this.recentErrors.push(error);

      // Trim if exceeds max
      if (this.recentErrors.length > this.MAX_RECENT_ERRORS) {
        this.recentErrors.shift();
      }

      // Update or create tracking entry
      const existing = this.errorTracking.get(error.type);

      if (existing) {
        existing.count++;
        existing.lastSeen = error.timestamp;

        if (error.context?.userId) {
          existing.affectedUsers.add(error.context.userId);
        }

        if (error.context?.type) {
          existing.interactionTypes.add(error.context.type);
        }
      } else {
        const affectedUsers = new Set<string>();
        if (error.context?.userId) {
          affectedUsers.add(error.context.userId);
        }

        const interactionTypes = new Set<string>();
        if (error.context?.type) {
          interactionTypes.add(error.context.type);
        }

        this.errorTracking.set(error.type, {
          error,
          count: 1,
          firstSeen: error.timestamp,
          lastSeen: error.timestamp,
          affectedUsers,
          interactionTypes,
        });
      }

      // Check for alert conditions
      this.checkAlertConditions(error.type);
    } catch (trackingError) {
      logger.error('Failed to track error:', trackingError);
    }
  }

  /**
   * Get error statistics
   *
   * @param periodMinutes - Time period in minutes (default: all time)
   * @returns ErrorStatistics
   */
  public getStatistics(periodMinutes?: number): ErrorStatistics {
    const now = new Date();
    const periodStart = periodMinutes
      ? new Date(now.getTime() - periodMinutes * 60 * 1000)
      : this.startTime;

    // Filter errors by period
    const periodErrors = this.recentErrors.filter(
      (error) => error.timestamp >= periodStart
    );

    // Count by type
    const byType: Record<ErrorType, number> = {} as Record<ErrorType, number>;
    Object.values(ErrorType).forEach((type) => {
      byType[type] = 0;
    });

    // Count by severity
    const bySeverity: Record<ErrorSeverity, number> = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0,
    };

    // Count by status
    const byStatus: Record<ErrorStatus, number> = {
      [ErrorStatus.BAD_REQUEST]: 0,
      [ErrorStatus.UNAUTHORIZED]: 0,
      [ErrorStatus.FORBIDDEN]: 0,
      [ErrorStatus.NOT_FOUND]: 0,
      [ErrorStatus.CONFLICT]: 0,
      [ErrorStatus.RATE_LIMITED]: 0,
      [ErrorStatus.INTERNAL_ERROR]: 0,
      [ErrorStatus.BAD_GATEWAY]: 0,
      [ErrorStatus.SERVICE_UNAVAILABLE]: 0,
      [ErrorStatus.TIMEOUT]: 0,
    };

    // Populate counts
    periodErrors.forEach((error) => {
      byType[error.type]++;
      bySeverity[error.severity]++;
      byStatus[error.status]++;
    });

    // Calculate error rate (errors per minute)
    const periodDurationMinutes = periodMinutes || (now.getTime() - this.startTime.getTime()) / (60 * 1000);
    const errorRate = periodErrors.length / periodDurationMinutes;

    return {
      totalErrors: periodErrors.length,
      byType,
      bySeverity,
      byStatus,
      errorRate,
      period: {
        start: periodStart,
        end: now,
      },
    };
  }

  /**
   * Get error metadata for a specific error type
   *
   * @param errorType - The error type
   * @returns ErrorMetadata or undefined
   */
  public getErrorMetadata(errorType: ErrorType): ErrorMetadata | undefined {
    const entry = this.errorTracking.get(errorType);

    if (!entry) {
      return undefined;
    }

    return {
      type: errorType,
      status: entry.error.status,
      severity: entry.error.severity,
      count: entry.count,
      firstOccurrence: entry.firstSeen,
      lastOccurrence: entry.lastSeen,
      affectedUsers: entry.affectedUsers.size,
      interactionTypes: Array.from(entry.interactionTypes),
    };
  }

  /**
   * Get most common errors
   *
   * @param limit - Number of errors to return (default: 10)
   * @param periodMinutes - Time period in minutes (default: all time)
   * @returns Array of error types sorted by frequency
   */
  public getMostCommonErrors(limit: number = 10, periodMinutes?: number): Array<{
    type: ErrorType;
    count: number;
    severity: ErrorSeverity;
  }> {
    const stats = this.getStatistics(periodMinutes);

    // Convert to array and sort by count
    const sortedErrors = Object.entries(stats.byType)
      .filter(([_, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([type, count]) => {
        const entry = this.errorTracking.get(type as ErrorType);
        return {
          type: type as ErrorType,
          count,
          severity: entry?.error.severity || ErrorSeverity.MEDIUM,
        };
      });

    return sortedErrors;
  }

  /**
   * Get errors by severity
   *
   * @param severity - Error severity level
   * @param periodMinutes - Time period in minutes (default: last 60 minutes)
   * @returns Array of errors matching severity
   */
  public getErrorsBySeverity(
    severity: ErrorSeverity,
    periodMinutes: number = 60
  ): DiscordError[] {
    const now = new Date();
    const periodStart = new Date(now.getTime() - periodMinutes * 60 * 1000);

    return this.recentErrors.filter(
      (error) => error.severity === severity && error.timestamp >= periodStart
    );
  }

  /**
   * Get critical errors
   *
   * @param periodMinutes - Time period in minutes (default: last 60 minutes)
   * @returns Array of critical errors
   */
  public getCriticalErrors(periodMinutes: number = 60): DiscordError[] {
    return this.getErrorsBySeverity(ErrorSeverity.CRITICAL, periodMinutes);
  }

  /**
   * Check if error rate is elevated
   *
   * @param threshold - Errors per minute threshold (default: 5)
   * @param periodMinutes - Time period in minutes (default: 5)
   * @returns true if error rate exceeds threshold
   */
  public isErrorRateElevated(threshold: number = 5, periodMinutes: number = 5): boolean {
    const stats = this.getStatistics(periodMinutes);
    return stats.errorRate > threshold;
  }

  /**
   * Configure alert system
   *
   * @param config - Alert configuration
   */
  public configureAlerts(config: Partial<AlertConfig>): void {
    this.alertConfig = {
      ...this.alertConfig,
      ...config,
    };

    logger.info('Alert configuration updated:', this.alertConfig);
  }

  /**
   * Check alert conditions for an error type
   *
   * @param errorType - The error type
   */
  private checkAlertConditions(errorType: ErrorType): void {
    if (!this.alertConfig.enabled) {
      return;
    }

    const entry = this.errorTracking.get(errorType);
    if (!entry) {
      return;
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - this.alertConfig.timeWindow * 60 * 1000);

    // Count errors in window
    const errorsInWindow = this.recentErrors.filter(
      (error) => error.type === errorType && error.timestamp >= windowStart
    ).length;

    // Check if threshold exceeded
    if (errorsInWindow >= this.alertConfig.errorThreshold) {
      // Check cooldown
      const lastAlert = this.lastAlertTime.get(errorType);
      const cooldownEnd = lastAlert
        ? new Date(lastAlert.getTime() + this.alertConfig.cooldown * 60 * 1000)
        : new Date(0);

      if (now >= cooldownEnd) {
        // Send alert
        this.sendAlert(errorType, errorsInWindow);
        this.lastAlertTime.set(errorType, now);
      }
    }
  }

  /**
   * Send alert for error spike
   *
   * @param errorType - The error type
   * @param count - Number of errors in window
   */
  private sendAlert(errorType: ErrorType, count: number): void {
    const entry = this.errorTracking.get(errorType);

    logger.error('🚨 ERROR SPIKE ALERT', {
      errorType,
      count,
      timeWindow: this.alertConfig.timeWindow,
      severity: entry?.error.severity,
      affectedUsers: entry?.affectedUsers.size,
      interactionTypes: Array.from(entry?.interactionTypes || []),
    });

    // Here you could also:
    // - Send Discord notification to admin channel
    // - Send email/SMS to on-call team
    // - Create incident in monitoring system
    // - Trigger auto-recovery procedures
  }

  /**
   * Reset statistics
   */
  public resetStatistics(): void {
    this.errorTracking.clear();
    this.recentErrors = [];
    this.lastAlertTime.clear();
    this.startTime = new Date();

    logger.info('Error statistics reset');
  }

  /**
   * Get summary report
   *
   * @returns Formatted summary string
   */
  public getSummaryReport(): string {
    const stats = this.getStatistics();
    const mostCommon = this.getMostCommonErrors(5);

    let report = '📊 Discord Error Service - Summary Report\n\n';
    report += `Total Errors: ${stats.totalErrors}\n`;
    report += `Error Rate: ${stats.errorRate.toFixed(2)} errors/min\n`;
    report += `Period: ${stats.period.start.toISOString()} to ${stats.period.end.toISOString()}\n\n`;

    report += '🔝 Most Common Errors:\n';
    mostCommon.forEach((error, index) => {
      report += `${index + 1}. ${error.type}: ${error.count} (${error.severity})\n`;
    });

    report += '\n📈 By Severity:\n';
    Object.entries(stats.bySeverity).forEach(([severity, count]) => {
      if (count > 0) {
        report += `  ${severity}: ${count}\n`;
      }
    });

    return report;
  }

  /**
   * Export error data for analysis
   *
   * @param periodMinutes - Time period in minutes (default: all time)
   * @returns Exportable error data
   */
  public exportData(periodMinutes?: number): {
    statistics: ErrorStatistics;
    recentErrors: DiscordError[];
    metadata: ErrorMetadata[];
  } {
    const statistics = this.getStatistics(periodMinutes);

    const now = new Date();
    const periodStart = periodMinutes
      ? new Date(now.getTime() - periodMinutes * 60 * 1000)
      : this.startTime;

    const recentErrors = this.recentErrors.filter(
      (error) => error.timestamp >= periodStart
    );

    const metadata = Array.from(this.errorTracking.values())
      .filter((entry) => entry.lastSeen >= periodStart)
      .map((entry) => ({
        type: entry.error.type,
        status: entry.error.status,
        severity: entry.error.severity,
        count: entry.count,
        firstOccurrence: entry.firstSeen,
        lastOccurrence: entry.lastSeen,
        affectedUsers: entry.affectedUsers.size,
        interactionTypes: Array.from(entry.interactionTypes),
      }));

    return {
      statistics,
      recentErrors,
      metadata,
    };
  }

  /**
   * Start cleanup job to remove old errors
   */
  private startCleanupJob(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanupOldErrors();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Clean up errors older than 24 hours
   */
  private cleanupOldErrors(): void {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    const beforeCount = this.recentErrors.length;

    // Remove old errors from recent errors
    this.recentErrors = this.recentErrors.filter(
      (error) => error.timestamp >= cutoff
    );

    const removed = beforeCount - this.recentErrors.length;

    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} old errors`);
    }
  }

  /**
   * Get health status
   *
   * @returns Health status object
   */
  public getHealthStatus(): {
    healthy: boolean;
    errorRate: number;
    criticalErrors: number;
    alerts: number;
  } {
    const stats = this.getStatistics(5); // Last 5 minutes
    const criticalErrors = this.getCriticalErrors(5);
    const errorRateThreshold = 5; // errors per minute
    const criticalErrorThreshold = 3;

    const healthy =
      stats.errorRate < errorRateThreshold &&
      criticalErrors.length < criticalErrorThreshold;

    return {
      healthy,
      errorRate: stats.errorRate,
      criticalErrors: criticalErrors.length,
      alerts: this.lastAlertTime.size,
    };
  }
}

/**
 * Export singleton instance
 */
export default DiscordErrorService.getInstance();
