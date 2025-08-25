import { EventEmitter } from "events";
import { logger } from "../logger";
import { GPUResourceManager } from "./GPUResourceManager";
import { FramePackProcessManager } from "../utils/FramePackProcess";

export interface PerformanceConfig {
  enableGPUOptimization: boolean;
  enableProcessPooling: boolean;
  enableMemoryOptimization: boolean;
  enableCaching: boolean;
  maxConcurrentJobs: number;
  adaptiveBatchSizing: boolean;
  dynamicQualityAdjustment: boolean;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  gpuUtilization: number;
  gpuMemoryUsage: number;
  activeProcesses: number;
  queueSize: number;
  averageProcessingTime: number;
  systemLoad: number;
}

export interface OptimizationRecommendation {
  type: "gpu" | "memory" | "process" | "quality" | "batch";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  action: string;
  expectedImpact: string;
}

export class PerformanceOptimizer extends EventEmitter {
  private config: PerformanceConfig;
  private gpuManager: GPUResourceManager;
  private processManager: FramePackProcessManager;
  private metricsHistory: SystemMetrics[] = [];
  private optimizationCache: Map<string, any> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(
    config: Partial<PerformanceConfig> = {},
    gpuManager: GPUResourceManager,
    processManager: FramePackProcessManager
  ) {
    super();
    
    this.config = {
      enableGPUOptimization: true,
      enableProcessPooling: true,
      enableMemoryOptimization: true,
      enableCaching: true,
      maxConcurrentJobs: 2,
      adaptiveBatchSizing: true,
      dynamicQualityAdjustment: false,
      ...config,
    };

    this.gpuManager = gpuManager;
    this.processManager = processManager;
  }

  /**
   * Initialize performance optimization
   */
  public async initialize(): Promise<void> {
    logger.info({ config: this.config }, "Initializing performance optimizer");

    // Start monitoring system metrics
    this.startMetricsMonitoring();

    // Load optimization cache if exists
    await this.loadOptimizationCache();

    logger.info("Performance optimizer initialized");
  }

  /**
   * Get current system metrics
   */
  public async getSystemMetrics(): Promise<SystemMetrics> {
    const [cpuUsage, memoryUsage] = await Promise.all([
      this.getCPUUsage(),
      this.getMemoryUsage(),
    ]);

    const gpuSummary = this.gpuManager.getResourceSummary();
    const activeProcesses = this.processManager.getActiveProcesses().length;

    const metrics: SystemMetrics = {
      cpuUsage,
      memoryUsage,
      gpuUtilization: gpuSummary.averageUtilization,
      gpuMemoryUsage: ((gpuSummary.usedMemoryMB / gpuSummary.totalMemoryMB) * 100) || 0,
      activeProcesses,
      queueSize: 0, // Would need to integrate with queue system
      averageProcessingTime: this.getAverageProcessingTime(),
      systemLoad: this.calculateSystemLoad(cpuUsage, memoryUsage, gpuSummary.averageUtilization),
    };

    return metrics;
  }

  /**
   * Analyze current performance and provide recommendations
   */
  public async analyzePerformance(): Promise<OptimizationRecommendation[]> {
    const metrics = await this.getSystemMetrics();
    const recommendations: OptimizationRecommendation[] = [];

    // GPU optimization recommendations
    if (this.config.enableGPUOptimization) {
      const gpuRecommendations = this.analyzeGPUPerformance(metrics);
      recommendations.push(...gpuRecommendations);
    }

    // Memory optimization recommendations
    if (this.config.enableMemoryOptimization) {
      const memoryRecommendations = this.analyzeMemoryPerformance(metrics);
      recommendations.push(...memoryRecommendations);
    }

    // Process optimization recommendations
    if (this.config.enableProcessPooling) {
      const processRecommendations = this.analyzeProcessPerformance(metrics);
      recommendations.push(...processRecommendations);
    }

    // Quality adjustment recommendations
    if (this.config.dynamicQualityAdjustment) {
      const qualityRecommendations = this.analyzeQualitySettings(metrics);
      recommendations.push(...qualityRecommendations);
    }

    return recommendations;
  }

  /**
   * Optimize system configuration based on current conditions
   */
  public async optimizeConfiguration(): Promise<{
    adjustedConcurrency: number;
    recommendedQuality: "fast" | "balanced" | "high";
    gpuOptimizations: string[];
    memoryOptimizations: string[];
  }> {
    const metrics = await this.getSystemMetrics();
    const optimizations = {
      adjustedConcurrency: this.config.maxConcurrentJobs,
      recommendedQuality: "balanced" as const,
      gpuOptimizations: [] as string[],
      memoryOptimizations: [] as string[],
    };

    // Adjust concurrency based on system load
    if (metrics.systemLoad > 80) {
      optimizations.adjustedConcurrency = Math.max(1, Math.floor(this.config.maxConcurrentJobs * 0.7));
      optimizations.gpuOptimizations.push("Reduced concurrency due to high system load");
    } else if (metrics.systemLoad < 40 && metrics.gpuMemoryUsage < 60) {
      optimizations.adjustedConcurrency = Math.min(4, this.config.maxConcurrentJobs + 1);
      optimizations.gpuOptimizations.push("Increased concurrency due to available resources");
    }

    // Adjust quality based on GPU performance
    if (metrics.gpuMemoryUsage > 85) {
      optimizations.recommendedQuality = "fast";
      optimizations.gpuOptimizations.push("Reduced quality to conserve GPU memory");
    } else if (metrics.gpuMemoryUsage < 50 && metrics.gpuUtilization < 60) {
      optimizations.recommendedQuality = "high";
      optimizations.gpuOptimizations.push("Increased quality due to available GPU resources");
    }

    // Memory optimizations
    if (metrics.memoryUsage > 80) {
      optimizations.memoryOptimizations.push("Enable aggressive memory cleanup");
      optimizations.memoryOptimizations.push("Reduce buffer sizes");
    }

    logger.info({ metrics, optimizations }, "Configuration optimized");
    return optimizations;
  }

  /**
   * Cache optimization results
   */
  public cacheOptimization(key: string, result: any, ttlMs: number = 300000): void {
    if (!this.config.enableCaching) return;

    const cacheEntry = {
      result,
      expiresAt: Date.now() + ttlMs,
    };

    this.optimizationCache.set(key, cacheEntry);
  }

  /**
   * Get cached optimization result
   */
  public getCachedOptimization<T>(key: string): T | null {
    if (!this.config.enableCaching) return null;

    const cacheEntry = this.optimizationCache.get(key);
    if (!cacheEntry) return null;

    if (Date.now() > cacheEntry.expiresAt) {
      this.optimizationCache.delete(key);
      return null;
    }

    return cacheEntry.result;
  }

  /**
   * Get optimal batch size for processing
   */
  public getOptimalBatchSize(
    itemCount: number,
    itemComplexity: "low" | "medium" | "high" = "medium"
  ): number {
    if (!this.config.adaptiveBatchSizing) {
      return Math.min(itemCount, this.config.maxConcurrentJobs);
    }

    const metrics = this.metricsHistory[this.metricsHistory.length - 1];
    if (!metrics) {
      return Math.min(itemCount, this.config.maxConcurrentJobs);
    }

    let baseBatchSize = this.config.maxConcurrentJobs;

    // Adjust based on system load
    if (metrics.systemLoad > 80) {
      baseBatchSize = Math.max(1, Math.floor(baseBatchSize * 0.6));
    } else if (metrics.systemLoad < 40) {
      baseBatchSize = Math.min(itemCount, baseBatchSize + 1);
    }

    // Adjust based on item complexity
    const complexityMultiplier = {
      low: 1.2,
      medium: 1.0,
      high: 0.8,
    };

    const adjustedBatchSize = Math.floor(baseBatchSize * complexityMultiplier[itemComplexity]);
    return Math.max(1, Math.min(itemCount, adjustedBatchSize));
  }

  /**
   * Predict processing time based on historical data
   */
  public predictProcessingTime(
    itemCount: number,
    complexity: "low" | "medium" | "high" = "medium",
    quality: "fast" | "balanced" | "high" = "balanced"
  ): number {
    const baseTimePerItem = this.getBaseProcessingTime(complexity, quality);
    const batchSize = this.getOptimalBatchSize(itemCount, complexity);
    const parallelBatches = Math.ceil(itemCount / batchSize);
    
    // Account for overhead and system load
    const systemLoadMultiplier = this.getSystemLoadMultiplier();
    
    return Math.ceil(parallelBatches * baseTimePerItem * systemLoadMultiplier);
  }

  /**
   * Clean up resources and stop monitoring
   */
  public shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Save optimization cache
    this.saveOptimizationCache().catch(error => {
      logger.warn({ error: error.message }, "Failed to save optimization cache");
    });

    logger.info("Performance optimizer shut down");
  }

  /**
   * Start monitoring system metrics
   */
  private startMetricsMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.getSystemMetrics();
        this.metricsHistory.push(metrics);

        // Keep only last 100 entries
        if (this.metricsHistory.length > 100) {
          this.metricsHistory.shift();
        }

        // Emit metrics for external monitoring
        this.emit("metricsUpdate", metrics);

        // Check for performance issues
        await this.checkPerformanceAlerts(metrics);
      } catch (error) {
        logger.warn({ error: error.message }, "Metrics monitoring failed");
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Analyze GPU performance and provide recommendations
   */
  private analyzeGPUPerformance(metrics: SystemMetrics): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    if (metrics.gpuMemoryUsage > 90) {
      recommendations.push({
        type: "gpu",
        severity: "critical",
        message: "GPU memory usage is critically high",
        action: "Reduce batch size or lower quality settings",
        expectedImpact: "Prevent out-of-memory errors and improve stability",
      });
    } else if (metrics.gpuMemoryUsage > 75) {
      recommendations.push({
        type: "gpu",
        severity: "high",
        message: "GPU memory usage is high",
        action: "Consider reducing concurrent processes",
        expectedImpact: "Improve memory efficiency and prevent bottlenecks",
      });
    }

    if (metrics.gpuUtilization < 30 && metrics.activeProcesses < this.config.maxConcurrentJobs) {
      recommendations.push({
        type: "gpu",
        severity: "medium",
        message: "GPU is underutilized",
        action: "Increase concurrent processes or batch size",
        expectedImpact: "Better resource utilization and faster processing",
      });
    }

    return recommendations;
  }

  /**
   * Analyze memory performance
   */
  private analyzeMemoryPerformance(metrics: SystemMetrics): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    if (metrics.memoryUsage > 85) {
      recommendations.push({
        type: "memory",
        severity: "critical",
        message: "System memory usage is critically high",
        action: "Enable aggressive garbage collection and reduce buffer sizes",
        expectedImpact: "Prevent system instability and improve performance",
      });
    }

    return recommendations;
  }

  /**
   * Analyze process performance
   */
  private analyzeProcessPerformance(metrics: SystemMetrics): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    if (metrics.averageProcessingTime > 300 && metrics.systemLoad > 70) {
      recommendations.push({
        type: "process",
        severity: "medium",
        message: "Processing time is high under system load",
        action: "Reduce concurrent processes and optimize scheduling",
        expectedImpact: "Improve processing efficiency and reduce wait times",
      });
    }

    return recommendations;
  }

  /**
   * Analyze quality settings performance impact
   */
  private analyzeQualitySettings(metrics: SystemMetrics): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    if (metrics.systemLoad > 80 && metrics.averageProcessingTime > 600) {
      recommendations.push({
        type: "quality",
        severity: "medium",
        message: "High quality settings are causing performance bottlenecks",
        action: "Consider using balanced quality settings during peak load",
        expectedImpact: "Faster processing with acceptable quality trade-off",
      });
    }

    return recommendations;
  }

  /**
   * Check for performance alerts
   */
  private async checkPerformanceAlerts(metrics: SystemMetrics): Promise<void> {
    // Critical alerts
    if (metrics.gpuMemoryUsage > 95) {
      this.emit("criticalAlert", {
        type: "gpu_memory_critical",
        message: "GPU memory critically low - processes may fail",
        metrics,
      });
    }

    if (metrics.memoryUsage > 90) {
      this.emit("criticalAlert", {
        type: "system_memory_critical", 
        message: "System memory critically low",
        metrics,
      });
    }

    // Performance degradation alerts
    if (metrics.systemLoad > 85 && metrics.averageProcessingTime > 900) {
      this.emit("performanceAlert", {
        type: "performance_degradation",
        message: "System performance significantly degraded",
        metrics,
      });
    }
  }

  /**
   * Get CPU usage percentage
   */
  private async getCPUUsage(): Promise<number> {
    // Simplified CPU usage calculation
    try {
      const { execSync } = await import('child_process');
      const output = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | awk -F'%' '{print $1}'", { encoding: 'utf8' });
      return parseFloat(output.trim()) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get memory usage percentage
   */
  private async getMemoryUsage(): Promise<number> {
    try {
      const { execSync } = await import('child_process');
      const output = execSync("free | grep Mem | awk '{printf \"%.1f\", $3/$2 * 100.0}'", { encoding: 'utf8' });
      return parseFloat(output.trim()) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate overall system load score
   */
  private calculateSystemLoad(cpuUsage: number, memoryUsage: number, gpuUtilization: number): number {
    // Weighted average with GPU having higher weight for AI workloads
    const weights = { cpu: 0.3, memory: 0.3, gpu: 0.4 };
    return Math.round(
      cpuUsage * weights.cpu + 
      memoryUsage * weights.memory + 
      gpuUtilization * weights.gpu
    );
  }

  /**
   * Get average processing time from recent history
   */
  private getAverageProcessingTime(): number {
    if (this.metricsHistory.length < 5) return 300; // Default 5 minutes
    
    const recentMetrics = this.metricsHistory.slice(-10);
    const total = recentMetrics.reduce((sum, metric) => sum + metric.averageProcessingTime, 0);
    return total / recentMetrics.length;
  }

  /**
   * Get base processing time for complexity and quality
   */
  private getBaseProcessingTime(complexity: string, quality: string): number {
    const baseTimeMap = {
      low: { fast: 30, balanced: 60, high: 120 },
      medium: { fast: 60, balanced: 120, high: 240 },
      high: { fast: 120, balanced: 300, high: 600 },
    };

    return (baseTimeMap as any)[complexity]?.[quality] || 120;
  }

  /**
   * Get system load multiplier for processing time prediction
   */
  private getSystemLoadMultiplier(): number {
    const latestMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    if (!latestMetrics) return 1.0;

    if (latestMetrics.systemLoad > 80) return 1.5;
    if (latestMetrics.systemLoad > 60) return 1.2;
    if (latestMetrics.systemLoad < 30) return 0.8;
    return 1.0;
  }

  /**
   * Load optimization cache from storage
   */
  private async loadOptimizationCache(): Promise<void> {
    // Implementation would load from persistent storage
    logger.debug("Optimization cache loaded");
  }

  /**
   * Save optimization cache to storage
   */
  private async saveOptimizationCache(): Promise<void> {
    // Implementation would save to persistent storage
    logger.debug("Optimization cache saved");
  }
}