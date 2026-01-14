

import logger from '../../common/loggers';
import {
  ErrorType,
  ErrorStatus,
  ErrorSeverity,
  DiscordError,
  ErrorMetadata,
  ErrorStatistics,
} from '../types/error.types';

interface ErrorTrackingEntry {
  error: DiscordError;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  affectedUsers: Set<string>;
  interactionTypes: Set<string>;
}

interface AlertConfig {
  
  enabled: boolean;

  errorThreshold: number;

  timeWindow: number;

  cooldown: number;
}

export class DiscordErrorService {
  private static instance: DiscordErrorService;

  private errorTracking: Map<ErrorType, ErrorTrackingEntry> = new Map();

  private recentErrors: DiscordError[] = [];

  private readonly MAX_RECENT_ERRORS = 1000;

  private alertConfig: AlertConfig = {
    enabled: true,
    errorThreshold: 10,
    timeWindow: 5, 
    cooldown: 15, 
  };

  private lastAlertTime: Map<ErrorType, Date> = new Map();

  private startTime: Date = new Date();

  private constructor() {
    
    this.startCleanupJob();
  }

  public static getInstance(): DiscordErrorService {
    if (!DiscordErrorService.instance) {
      DiscordErrorService.instance = new DiscordErrorService();
    }
    return DiscordErrorService.instance;
  }

  public trackError(error: DiscordError): void {
    try {
      
      this.recentErrors.push(error);

      if (this.recentErrors.length > this.MAX_RECENT_ERRORS) {
        this.recentErrors.shift();
      }

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

      this.checkAlertConditions(error.type);
    } catch (trackingError) {
      logger.error('Failed to track error:', trackingError);
    }
  }

  public getStatistics(periodMinutes?: number): ErrorStatistics {
    const now = new Date();
    const periodStart = periodMinutes
      ? new Date(now.getTime() - periodMinutes * 60 * 1000)
      : this.startTime;

    const periodErrors = this.recentErrors.filter(
      (error) => error.timestamp >= periodStart
    );

    const byType: Record<ErrorType, number> = {} as Record<ErrorType, number>;
    Object.values(ErrorType).forEach((type) => {
      byType[type] = 0;
    });

    const bySeverity: Record<ErrorSeverity, number> = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0,
    };

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

    periodErrors.forEach((error) => {
      byType[error.type]++;
      bySeverity[error.severity]++;
      byStatus[error.status]++;
    });

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

  public getMostCommonErrors(limit: number = 10, periodMinutes?: number): Array<{
    type: ErrorType;
    count: number;
    severity: ErrorSeverity;
  }> {
    const stats = this.getStatistics(periodMinutes);

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

  public getCriticalErrors(periodMinutes: number = 60): DiscordError[] {
    return this.getErrorsBySeverity(ErrorSeverity.CRITICAL, periodMinutes);
  }

  public isErrorRateElevated(threshold: number = 5, periodMinutes: number = 5): boolean {
    const stats = this.getStatistics(periodMinutes);
    return stats.errorRate > threshold;
  }

  public configureAlerts(config: Partial<AlertConfig>): void {
    this.alertConfig = {
      ...this.alertConfig,
      ...config,
    };

    logger.info('Alert configuration updated:', this.alertConfig);
  }

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

    const errorsInWindow = this.recentErrors.filter(
      (error) => error.type === errorType && error.timestamp >= windowStart
    ).length;

    if (errorsInWindow >= this.alertConfig.errorThreshold) {
      
      const lastAlert = this.lastAlertTime.get(errorType);
      const cooldownEnd = lastAlert
        ? new Date(lastAlert.getTime() + this.alertConfig.cooldown * 60 * 1000)
        : new Date(0);

      if (now >= cooldownEnd) {
        
        this.sendAlert(errorType, errorsInWindow);
        this.lastAlertTime.set(errorType, now);
      }
    }
  }

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

  }

  public resetStatistics(): void {
    this.errorTracking.clear();
    this.recentErrors = [];
    this.lastAlertTime.clear();
    this.startTime = new Date();

    logger.info('Error statistics reset');
  }

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

  private startCleanupJob(): void {
    
    setInterval(() => {
      this.cleanupOldErrors();
    }, 60 * 60 * 1000); 
  }

  private cleanupOldErrors(): void {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); 

    const beforeCount = this.recentErrors.length;

    this.recentErrors = this.recentErrors.filter(
      (error) => error.timestamp >= cutoff
    );

    const removed = beforeCount - this.recentErrors.length;

    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} old errors`);
    }
  }

  public getHealthStatus(): {
    healthy: boolean;
    errorRate: number;
    criticalErrors: number;
    alerts: number;
  } {
    const stats = this.getStatistics(5); 
    const criticalErrors = this.getCriticalErrors(5);
    const errorRateThreshold = 5; 
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

export default DiscordErrorService.getInstance();
