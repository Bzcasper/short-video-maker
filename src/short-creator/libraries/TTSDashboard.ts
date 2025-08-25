/**
 * TTS Performance Metrics Dashboard and Monitoring
 * Real-time monitoring and visualization of TTS provider performance
 */

import { TTSService } from './TTSService';
import { getTTSConfigManager } from './TTSConfig';
import { logger } from '../../config';

export interface DashboardMetrics {
  timestamp: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCharacters: number;
  totalAudioSeconds: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  providerBreakdown: Record<string, ProviderMetrics>;
  budgetUtilization: number;
  topLanguages: string[];
  costTrend: number[]; // Last 24 hours cost data
  latencyTrend: number[]; // Last 24 hours latency data
}

export interface ProviderMetrics {
  provider: string;
  requests: number;
  successRate: number;
  latency: number;
  cost: number;
  characters: number;
  audioSeconds: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastUsed: Date;
}

export interface Alert {
  id: string;
  type: 'budget' | 'error' | 'latency' | 'health';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
  data?: any;
}

export class TTSDashboard {
  private ttsService: TTSService;
  private configManager = getTTSConfigManager();
  private metricsHistory: DashboardMetrics[] = [];
  private activeAlerts: Alert[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(ttsService: TTSService) {
    this.ttsService = ttsService;
  }

  /**
   * Start real-time monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.checkAlerts();
    }, intervalMs);

    logger.info(`TTS Dashboard monitoring started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('TTS Dashboard monitoring stopped');
    }
  }

  /**
   * Collect current metrics
   */
  async collectMetrics(): Promise<DashboardMetrics> {
    const metrics = await this.getCurrentMetrics();
    this.metricsHistory.push(metrics);

    // Keep only last 24 hours of data (1440 minutes if collecting every minute)
    const maxHistory = 1440;
    if (this.metricsHistory.length > maxHistory) {
      this.metricsHistory = this.metricsHistory.slice(-maxHistory);
    }

    return metrics;
  }

  /**
   * Get current metrics snapshot
   */
  async getCurrentMetrics(): Promise<DashboardMetrics> {
    const providerMetrics = await this.ttsService.getProviderMetrics();
    const providerHealth = await this.ttsService.getProviderHealth();
    const totalCost = this.ttsService.getTotalCost();
    const budgetUtilization = this.ttsService.getBudgetUtilization();

    const providerBreakdown: Record<string, ProviderMetrics> = {};
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalCharacters = 0;
    let totalAudioSeconds = 0;
    let totalCostSum = 0;
    let totalLatency = 0;
    const languageCount: Record<string, number> = {};

    for (const [providerName, metrics] of providerMetrics.entries()) {
      const health = providerHealth.get(providerName);
      
      providerBreakdown[providerName] = {
        provider: providerName,
        requests: metrics.totalRequests,
        successRate: metrics.successfulRequests / metrics.totalRequests || 0,
        latency: metrics.averageLatency,
        cost: metrics.totalCost,
        characters: metrics.totalCharacters,
        audioSeconds: metrics.totalAudioSeconds,
        healthStatus: health?.status || 'unknown',
        lastUsed: new Date(), // This would ideally come from provider stats
      };

      totalRequests += metrics.totalRequests;
      successfulRequests += metrics.successfulRequests;
      failedRequests += metrics.failedRequests;
      totalCharacters += metrics.totalCharacters;
      totalAudioSeconds += metrics.totalAudioSeconds;
      totalCostSum += metrics.totalCost;
      totalLatency += metrics.averageLatency * metrics.successfulRequests;
    }

    // Calculate trends (simplified - in real implementation, this would use historical data)
    const costTrend = this.calculateCostTrend();
    const latencyTrend = this.calculateLatencyTrend();

    return {
      timestamp: new Date(),
      totalRequests,
      successfulRequests,
      failedRequests,
      totalCharacters,
      totalAudioSeconds,
      totalCost: totalCostSum,
      averageLatency: successfulRequests > 0 ? totalLatency / successfulRequests : 0,
      errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
      providerBreakdown,
      budgetUtilization,
      topLanguages: this.getTopLanguages(languageCount),
      costTrend,
      latencyTrend,
    };
  }

  /**
   * Check for alerts and trigger notifications
   */
  private checkAlerts(): void {
    const metrics = this.metricsHistory[this.metricsHistory.length - 1];
    if (!metrics) return;

    // Budget alerts
    if (metrics.budgetUtilization >= 90) {
      this.triggerAlert({
        type: 'budget',
        severity: metrics.budgetUtilization >= 100 ? 'critical' : 'high',
        message: `Budget utilization at ${metrics.budgetUtilization.toFixed(1)}%`,
        data: { utilization: metrics.budgetUtilization }
      });
    }

    // Error rate alerts
    if (metrics.errorRate >= 0.1) { // 10% error rate
      this.triggerAlert({
        type: 'error',
        severity: metrics.errorRate >= 0.3 ? 'critical' : 'medium',
        message: `High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`,
        data: { errorRate: metrics.errorRate }
      });
    }

    // Latency alerts
    if (metrics.averageLatency > 5000) { // 5 seconds
      this.triggerAlert({
        type: 'latency',
        severity: metrics.averageLatency > 10000 ? 'critical' : 'medium',
        message: `High average latency: ${metrics.averageLatency.toFixed(0)}ms`,
        data: { latency: metrics.averageLatency }
      });
    }

    // Provider health alerts
    for (const [provider, metrics] of Object.entries(metrics.providerBreakdown)) {
      if (metrics.healthStatus === 'unhealthy') {
        this.triggerAlert({
          type: 'health',
          severity: 'high',
          message: `Provider ${provider} is unhealthy`,
          data: { provider, status: metrics.healthStatus }
        });
      }
    }
  }

  /**
   * Trigger a new alert
   */
  private triggerAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): void {
    const newAlert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
      ...alert
    };

    // Check if similar alert already exists
    const existingAlert = this.activeAlerts.find(a => 
      a.type === newAlert.type && 
      a.message === newAlert.message && 
      !a.resolved
    );

    if (!existingAlert) {
      this.activeAlerts.push(newAlert);
      logger.warn('TTS Dashboard Alert triggered', { alert: newAlert });
      
      // TODO: Send notification (email, Slack, etc.)
      this.sendNotification(newAlert);
    }
  }

  /**
   * Send alert notification (placeholder for actual implementation)
   */
  private sendNotification(alert: Alert): void {
    // Implementation would integrate with notification services
    // For now, just log to console
    console.log(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      logger.info('TTS Dashboard Alert resolved', { alertId });
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.activeAlerts.filter(alert => !alert.resolved);
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(hours: number = 24): DashboardMetrics[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metricsHistory.filter(metric => metric.timestamp >= cutoff);
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): any {
    const metrics = this.metricsHistory[this.metricsHistory.length - 1];
    if (!metrics) return null;

    return {
      summary: {
        totalRequests: metrics.totalRequests,
        successRate: ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1) + '%',
        averageLatency: metrics.averageLatency.toFixed(0) + 'ms',
        totalCost: '$' + metrics.totalCost.toFixed(2),
        budgetUtilization: metrics.budgetUtilization.toFixed(1) + '%',
        errorRate: (metrics.errorRate * 100).toFixed(1) + '%'
      },
      providers: metrics.providerBreakdown,
      alerts: this.getActiveAlerts().length,
      recommendations: this.generateRecommendations(metrics)
    };
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(metrics: DashboardMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.budgetUtilization >= 80) {
      recommendations.push('Consider enabling cost optimization mode or increasing budget');
    }

    if (metrics.errorRate >= 0.05) {
      recommendations.push('Investigate high error rates - check provider status and credentials');
    }

    if (metrics.averageLatency > 3000) {
      recommendations.push('High latency detected - consider using faster providers or optimizing requests');
    }

    // Check if any provider is significantly underutilized but healthy
    const healthyProviders = Object.values(metrics.providerBreakdown)
      .filter(p => p.healthStatus === 'healthy' && p.requests === 0);
    
    if (healthyProviders.length > 0) {
      recommendations.push(`Underutilized healthy providers: ${healthyProviders.map(p => p.provider).join(', ')}`);
    }

    return recommendations;
  }

  /**
   * Calculate cost trend (simplified)
   */
  private calculateCostTrend(): number[] {
    // In real implementation, this would analyze historical cost data
    // For now, return mock data
    return Array.from({ length: 24 }, (_, i) => 
      Math.random() * 10 + (i > 12 ? 15 : 5) // Simulate daily pattern
    );
  }

  /**
   * Calculate latency trend (simplified)
   */
  private calculateLatencyTrend(): number[] {
    // In real implementation, this would analyze historical latency data
    return Array.from({ length: 24 }, (_, i) => 
      Math.random() * 500 + (i > 18 ? 1000 : 200) // Simulate peak hours
    );
  }

  /**
   * Get top languages from usage
   */
  private getTopLanguages(languageCount: Record<string, number>): string[] {
    // This would normally analyze actual language usage data
    // For now, return common languages
    return ['en', 'es', 'fr', 'de', 'ja', 'zh'].slice(0, 5);
  }

  /**
   * Export dashboard data for external visualization
   */
  exportData(): any {
    return {
      metrics: this.metricsHistory,
      alerts: this.activeAlerts,
      config: this.configManager.getConfig(),
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance
let dashboardInstance: TTSDashboard | null = null;

export function getTTSDashboard(ttsService?: TTSService): TTSDashboard {
  if (!dashboardInstance) {
    if (!ttsService) {
      throw new Error('TTS Service instance required for dashboard initialization');
    }
    dashboardInstance = new TTSDashboard(ttsService);
  }
  return dashboardInstance;
}

export function initializeTTSDashboard(ttsService: TTSService): TTSDashboard {
  dashboardInstance = new TTSDashboard(ttsService);
  return dashboardInstance;
}