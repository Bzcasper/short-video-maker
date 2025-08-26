import { logger } from "../logger";
import { CacheService } from "./CacheService";

export interface CostOptimizationConfig {
  enabled: boolean;
  budgetLimits: {
    dailyBudget: number; // USD
    monthlyBudget: number; // USD
    perVideoLimit: number; // USD
  };
  providerLimits: {
    [providerName: string]: {
      dailyLimit: number;
      monthlyLimit: number;
      costPerUnit: number;
      priority: number; // 1 = highest priority
    };
  };
  optimization: {
    enableAutomaticFallback: boolean;
    enableQualityTradeof: boolean;
    enableBatchOptimization: boolean;
    costThresholds: {
      low: number; // 0-this = green
      medium: number; // low-this = yellow
      // above medium = red
    };
  };
  alerts: {
    enableAlerts: boolean;
    thresholds: {
      dailySpendPercent: number; // Alert at X% of daily budget
      monthlySpendPercent: number; // Alert at X% of monthly budget
    };
    webhookUrl?: string;
    emailRecipients?: string[];
  };
}

export interface CostTrackingData {
  period: 'daily' | 'monthly' | 'total';
  startDate: Date;
  endDate: Date;
  totalSpent: number;
  budget: number;
  utilization: number; // percentage
  breakdown: {
    [service: string]: ServiceCostBreakdown;
  };
  projectedSpend?: number; // For ongoing periods
  recommendations?: CostRecommendation[];
}

export interface ServiceCostBreakdown {
  service: string;
  provider: string;
  totalCost: number;
  usage: {
    requests: number;
    units: number; // tokens, characters, images, etc.
    unitType: string;
  };
  averageCostPerRequest: number;
  averageCostPerUnit: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  efficiency: number; // cost per successful operation
}

export interface CostRecommendation {
  type: 'optimization' | 'alert' | 'switch_provider' | 'reduce_usage';
  priority: 'low' | 'medium' | 'high' | 'critical';
  service: string;
  currentCost: number;
  potentialSaving: number;
  description: string;
  implementation: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
}

export interface ProviderSelectionRequest {
  service: 'tts' | 'ai_generation' | 'image_generation' | 'translation';
  requirements: {
    quality: 'basic' | 'standard' | 'premium';
    speed: 'fast' | 'standard' | 'slow';
    features?: string[];
    maxCost?: number;
  };
  context: {
    currentBudgetUsage: number;
    remainingBudget: number;
    priority: 'cost' | 'quality' | 'speed';
  };
}

export interface ProviderSelectionResult {
  selectedProvider: string;
  estimatedCost: number;
  reasoning: string;
  alternatives: Array<{
    provider: string;
    cost: number;
    tradeoffs: string;
    score: number;
  }>;
  warnings?: string[];
}

export interface CostAlert {
  id: string;
  type: 'budget_threshold' | 'provider_limit' | 'cost_spike' | 'efficiency_drop';
  severity: 'info' | 'warning' | 'critical';
  service: string;
  provider?: string;
  message: string;
  data: {
    current: number;
    threshold: number;
    percentage: number;
  };
  recommendations: string[];
  timestamp: Date;
  acknowledged: boolean;
}

export class CostOptimizationService {
  private config: CostOptimizationConfig;
  private cacheService: CacheService;
  private usageTracker: UsageTracker;
  private alertManager: AlertManager;
  private readonly CACHE_PREFIX = 'cost_optimization:';

  constructor(config: CostOptimizationConfig, cacheService: CacheService) {
    this.config = config;
    this.cacheService = cacheService;
    this.usageTracker = new UsageTracker();
    this.alertManager = new AlertManager(config.alerts);
  }

  /**
   * Select optimal provider based on cost, quality, and current budget
   */
  public async selectOptimalProvider(request: ProviderSelectionRequest): Promise<ProviderSelectionResult> {
    try {
      logger.debug(`Selecting optimal provider for ${request.service}`);

      // Get current usage and costs
      const currentUsage = await this.getCurrentUsage();
      
      // Get available providers for the service
      const availableProviders = this.getAvailableProviders(request.service);
      
      // Filter providers based on budget constraints
      const affordableProviders = this.filterAffordableProviders(
        availableProviders,
        request.context.remainingBudget,
        request.requirements.maxCost
      );

      if (affordableProviders.length === 0) {
        return this.handleNoAffordableProviders(request, availableProviders);
      }

      // Score providers based on requirements and cost
      const scoredProviders = this.scoreProviders(affordableProviders, request, currentUsage);
      
      // Select best provider
      const bestProvider = scoredProviders[0];
      const alternatives = scoredProviders.slice(1, 3); // Top 2 alternatives

      const result: ProviderSelectionResult = {
        selectedProvider: bestProvider.name,
        estimatedCost: bestProvider.estimatedCost,
        reasoning: this.generateSelectionReasoning(bestProvider, request),
        alternatives: alternatives.map(p => ({
          provider: p.name,
          cost: p.estimatedCost,
          tradeoffs: p.tradeoffs,
          score: p.score
        })),
        warnings: this.generateWarnings(bestProvider, request, currentUsage)
      };

      logger.info(`Selected provider ${result.selectedProvider} for ${request.service} (cost: $${result.estimatedCost})`);
      return result;

    } catch (error) {
      logger.error(`Provider selection failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Return fallback provider
      return this.getFallbackProvider(request);
    }
  }

  /**
   * Track usage and cost for a service operation
   */
  public async trackUsage(
    service: string,
    provider: string,
    cost: number,
    units: number,
    unitType: string,
    success: boolean
  ): Promise<void> {
    try {
      const usage: UsageRecord = {
        service,
        provider,
        cost,
        units,
        unitType,
        timestamp: new Date(),
        success
      };

      await this.usageTracker.record(usage);

      // Check for budget alerts
      if (this.config.alerts.enableAlerts) {
        await this.checkBudgetAlerts(service, provider, cost);
      }

      logger.debug(`Tracked usage: ${service}/${provider} - $${cost} (${units} ${unitType})`);

    } catch (error) {
      logger.error(`Failed to track usage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get cost tracking data for specified period
   */
  public async getCostTrackingData(period: 'daily' | 'monthly' | 'total', date?: Date): Promise<CostTrackingData> {
    try {
      const targetDate = date || new Date();
      const { startDate, endDate } = this.getPeriodDates(period, targetDate);
      
      // Get usage data from tracker
      const usageData = await this.usageTracker.getUsage(startDate, endDate);
      
      // Calculate totals and breakdowns
      const totalSpent = usageData.reduce((sum, record) => sum + record.cost, 0);
      const budget = this.getBudgetForPeriod(period);
      const utilization = (totalSpent / budget) * 100;
      
      // Group by service and calculate breakdowns
      const breakdown = this.calculateServiceBreakdowns(usageData);
      
      // Generate recommendations
      const recommendations = await this.generateCostRecommendations(usageData, period);
      
      // Calculate projected spend for ongoing periods
      const projectedSpend = period !== 'total' 
        ? this.calculateProjectedSpend(usageData, period, targetDate)
        : undefined;

      return {
        period,
        startDate,
        endDate,
        totalSpent: Math.round(totalSpent * 100) / 100,
        budget,
        utilization: Math.round(utilization * 100) / 100,
        breakdown,
        projectedSpend: projectedSpend ? Math.round(projectedSpend * 100) / 100 : undefined,
        recommendations
      };

    } catch (error) {
      logger.error(`Failed to get cost tracking data: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get cost optimization recommendations
   */
  public async getOptimizationRecommendations(service?: string): Promise<CostRecommendation[]> {
    try {
      const usageData = await this.usageTracker.getRecentUsage(30); // Last 30 days
      
      let filteredData = usageData;
      if (service) {
        filteredData = usageData.filter(record => record.service === service);
      }

      return await this.generateCostRecommendations(filteredData, 'monthly');

    } catch (error) {
      logger.error(`Failed to get optimization recommendations: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Check if operation is within budget constraints
   */
  public async checkBudgetConstraints(
    service: string,
    provider: string,
    estimatedCost: number
  ): Promise<{
    allowed: boolean;
    reason?: string;
    recommendations?: string[];
  }> {
    try {
      const today = new Date();
      const dailyUsage = await this.getCostTrackingData('daily', today);
      const monthlyUsage = await this.getCostTrackingData('monthly', today);

      // Check daily budget
      if (dailyUsage.totalSpent + estimatedCost > this.config.budgetLimits.dailyBudget) {
        return {
          allowed: false,
          reason: 'Daily budget limit exceeded',
          recommendations: [
            'Wait until tomorrow to reset daily budget',
            'Use a more cost-effective provider',
            'Optimize request parameters to reduce cost'
          ]
        };
      }

      // Check monthly budget
      if (monthlyUsage.totalSpent + estimatedCost > this.config.budgetLimits.monthlyBudget) {
        return {
          allowed: false,
          reason: 'Monthly budget limit exceeded',
          recommendations: [
            'Wait until next month to reset budget',
            'Review and optimize existing spending',
            'Consider upgrading budget limits'
          ]
        };
      }

      // Check per-video limit
      if (estimatedCost > this.config.budgetLimits.perVideoLimit) {
        return {
          allowed: false,
          reason: 'Per-video cost limit exceeded',
          recommendations: [
            'Reduce video complexity or length',
            'Use more cost-effective provider settings',
            'Split operation into smaller requests'
          ]
        };
      }

      // Check provider-specific limits
      const providerLimit = this.config.providerLimits[provider];
      if (providerLimit) {
        const providerDailyUsage = dailyUsage.breakdown[service]?.totalCost || 0;
        if (providerDailyUsage + estimatedCost > providerLimit.dailyLimit) {
          return {
            allowed: false,
            reason: `Provider ${provider} daily limit exceeded`,
            recommendations: [
              'Switch to alternative provider',
              'Wait until tomorrow to reset provider limit',
              'Optimize request to reduce cost'
            ]
          };
        }
      }

      return { allowed: true };

    } catch (error) {
      logger.error(`Budget constraint check failed: ${error instanceof Error ? error.message : String(error)}`);
      // Allow by default if check fails
      return { allowed: true };
    }
  }

  /**
   * Get current cost alerts
   */
  public async getActiveAlerts(): Promise<CostAlert[]> {
    return await this.alertManager.getActiveAlerts();
  }

  /**
   * Acknowledge alert
   */
  public async acknowledgeAlert(alertId: string): Promise<boolean> {
    return await this.alertManager.acknowledgeAlert(alertId);
  }

  /**
   * Update cost optimization configuration
   */
  public updateConfig(newConfig: Partial<CostOptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.alertManager.updateConfig(this.config.alerts);
    logger.info('Cost optimization configuration updated');
  }

  // Private helper methods

  private async getCurrentUsage(): Promise<any> {
    const today = new Date();
    const dailyData = await this.getCostTrackingData('daily', today);
    const monthlyData = await this.getCostTrackingData('monthly', today);
    
    return {
      daily: dailyData,
      monthly: monthlyData
    };
  }

  private getAvailableProviders(service: string): ProviderInfo[] {
    // This would be populated from actual provider configurations
    const providers: { [key: string]: ProviderInfo[] } = {
      tts: [
        {
          name: 'elevenlabs',
          costPerUnit: 0.0003, // per character
          unitType: 'character',
          quality: 'premium',
          speed: 'fast',
          features: ['multilingual', 'voice-cloning'],
          availability: 0.99,
          priority: 1
        },
        {
          name: 'openai',
          costPerUnit: 0.000015, // per character  
          unitType: 'character',
          quality: 'standard',
          speed: 'fast',
          features: ['multilingual'],
          availability: 0.98,
          priority: 2
        },
        {
          name: 'azure',
          costPerUnit: 0.000016, // per character
          unitType: 'character',
          quality: 'standard',
          speed: 'standard',
          features: ['multilingual', 'ssml'],
          availability: 0.97,
          priority: 3
        },
        {
          name: 'kokoro',
          costPerUnit: 0, // free/local
          unitType: 'character',
          quality: 'basic',
          speed: 'slow',
          features: [],
          availability: 0.95,
          priority: 5
        }
      ],
      ai_generation: [
        {
          name: 'deepseek-v3',
          costPerUnit: 0.00000007, // per token
          unitType: 'token',
          quality: 'premium',
          speed: 'fast',
          features: ['large-context', 'reasoning'],
          availability: 0.98,
          priority: 1
        },
        {
          name: 'claude-3.5',
          costPerUnit: 0.000003, // per token
          unitType: 'token',
          quality: 'premium',
          speed: 'standard',
          features: ['analysis', 'creative'],
          availability: 0.97,
          priority: 2
        },
        {
          name: 'openai-gpt4o-mini',
          costPerUnit: 0.00000015, // per token
          unitType: 'token',
          quality: 'standard',
          speed: 'fast',
          features: ['multimodal'],
          availability: 0.99,
          priority: 3
        }
      ],
      image_generation: [
        {
          name: 'dall-e-3',
          costPerUnit: 0.04, // per image
          unitType: 'image',
          quality: 'premium',
          speed: 'standard',
          features: ['high-res', 'style-control'],
          availability: 0.96,
          priority: 1
        },
        {
          name: 'midjourney',
          costPerUnit: 0.025, // per image
          unitType: 'image',
          quality: 'premium',
          speed: 'slow',
          features: ['artistic', 'style-variety'],
          availability: 0.94,
          priority: 2
        },
        {
          name: 'stable-diffusion',
          costPerUnit: 0.01, // per image
          unitType: 'image',
          quality: 'standard',
          speed: 'fast',
          features: ['open-source', 'customizable'],
          availability: 0.98,
          priority: 3
        }
      ]
    };

    return providers[service] || [];
  }

  private filterAffordableProviders(
    providers: ProviderInfo[],
    remainingBudget: number,
    maxCost?: number
  ): ProviderInfo[] {
    return providers.filter(provider => {
      // Estimate typical cost for this provider
      const typicalCost = this.estimateTypicalCost(provider);
      
      if (maxCost && typicalCost > maxCost) return false;
      if (typicalCost > remainingBudget) return false;
      
      return true;
    });
  }

  private estimateTypicalCost(provider: ProviderInfo): number {
    // Estimate based on typical usage patterns
    const typicalUsage: { [key: string]: number } = {
      character: 1000, // 1k characters
      token: 2000, // 2k tokens
      image: 1 // 1 image
    };

    return provider.costPerUnit * (typicalUsage[provider.unitType] || 1000);
  }

  private scoreProviders(
    providers: ProviderInfo[],
    request: ProviderSelectionRequest,
    currentUsage: any
  ): ScoredProvider[] {
    const scored: ScoredProvider[] = providers.map(provider => {
      let score = 0;
      const estimatedCost = this.estimateTypicalCost(provider);
      
      // Cost score (0-40 points) - lower cost = higher score
      const maxCost = Math.max(...providers.map(p => this.estimateTypicalCost(p)));
      const costScore = maxCost > 0 ? 40 * (1 - estimatedCost / maxCost) : 20;
      score += costScore;

      // Quality match (0-25 points)
      const qualityMatch = this.getQualityScore(provider.quality, request.requirements.quality);
      score += qualityMatch * 25;

      // Speed match (0-15 points)
      const speedMatch = this.getSpeedScore(provider.speed, request.requirements.speed);
      score += speedMatch * 15;

      // Availability (0-10 points)
      score += provider.availability * 10;

      // Priority bonus (0-10 points) - lower priority number = higher score
      const priorityScore = 10 * (1 - (provider.priority - 1) / 5);
      score += Math.max(0, priorityScore);

      // Context adjustments
      if (request.context.priority === 'cost' && estimatedCost < 0.01) score += 5;
      if (request.context.priority === 'quality' && provider.quality === 'premium') score += 5;
      if (request.context.priority === 'speed' && provider.speed === 'fast') score += 5;

      return {
        name: provider.name,
        provider,
        score: Math.round(score),
        estimatedCost,
        tradeoffs: this.generateTradeoffs(provider, request),
        reasoning: `Cost: $${estimatedCost.toFixed(4)}, Quality: ${provider.quality}, Speed: ${provider.speed}`
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  private getQualityScore(providerQuality: string, requiredQuality: string): number {
    const qualityLevels = { basic: 1, standard: 2, premium: 3 };
    const providerLevel = qualityLevels[providerQuality as keyof typeof qualityLevels] || 1;
    const requiredLevel = qualityLevels[requiredQuality as keyof typeof qualityLevels] || 2;
    
    if (providerLevel >= requiredLevel) return 1.0;
    return providerLevel / requiredLevel;
  }

  private getSpeedScore(providerSpeed: string, requiredSpeed: string): number {
    const speedLevels = { slow: 1, standard: 2, fast: 3 };
    const providerLevel = speedLevels[providerSpeed as keyof typeof speedLevels] || 2;
    const requiredLevel = speedLevels[requiredSpeed as keyof typeof speedLevels] || 2;
    
    if (providerLevel >= requiredLevel) return 1.0;
    return providerLevel / requiredLevel;
  }

  private generateTradeoffs(provider: ProviderInfo, request: ProviderSelectionRequest): string {
    const tradeoffs: string[] = [];
    
    if (provider.quality !== request.requirements.quality) {
      const comparison = provider.quality === 'basic' ? 'lower' : 
                        provider.quality === 'premium' ? 'higher' : 'different';
      tradeoffs.push(`${comparison} quality than requested`);
    }
    
    if (provider.speed !== request.requirements.speed) {
      tradeoffs.push(`${provider.speed} speed instead of ${request.requirements.speed}`);
    }
    
    if (provider.costPerUnit === 0) {
      tradeoffs.push('free but potentially lower reliability');
    } else if (provider.costPerUnit > 0.001) {
      tradeoffs.push('higher cost but better quality');
    }
    
    return tradeoffs.join(', ') || 'matches requirements well';
  }

  private generateSelectionReasoning(provider: ScoredProvider, request: ProviderSelectionRequest): string {
    const reasons: string[] = [];
    
    reasons.push(`Best overall score: ${provider.score}/100`);
    reasons.push(`Estimated cost: $${provider.estimatedCost.toFixed(4)}`);
    
    if (request.context.priority === 'cost') {
      reasons.push('Optimized for cost efficiency');
    } else if (request.context.priority === 'quality') {
      reasons.push('Optimized for quality');
    } else if (request.context.priority === 'speed') {
      reasons.push('Optimized for speed');
    }
    
    if (provider.provider.quality === request.requirements.quality) {
      reasons.push('Matches quality requirements');
    }
    
    return reasons.join('. ');
  }

  private generateWarnings(provider: ScoredProvider, request: ProviderSelectionRequest, currentUsage: any): string[] {
    const warnings: string[] = [];
    
    // Budget warnings
    const dailyUsage = currentUsage.daily.totalSpent;
    const monthlyUsage = currentUsage.monthly.totalSpent;
    
    if (dailyUsage / this.config.budgetLimits.dailyBudget > 0.8) {
      warnings.push('Daily budget is 80% utilized');
    }
    
    if (monthlyUsage / this.config.budgetLimits.monthlyBudget > 0.8) {
      warnings.push('Monthly budget is 80% utilized');
    }
    
    // Provider warnings
    if (provider.provider.availability < 0.95) {
      warnings.push(`Provider has ${(provider.provider.availability * 100).toFixed(1)}% availability`);
    }
    
    if (provider.estimatedCost > this.config.budgetLimits.perVideoLimit * 0.5) {
      warnings.push('Cost is significant portion of per-video limit');
    }
    
    return warnings;
  }

  private handleNoAffordableProviders(
    request: ProviderSelectionRequest,
    allProviders: ProviderInfo[]
  ): ProviderSelectionResult {
    // Find cheapest provider as fallback
    const cheapest = allProviders.reduce((min, provider) => {
      const cost = this.estimateTypicalCost(provider);
      const minCost = this.estimateTypicalCost(min);
      return cost < minCost ? provider : min;
    });

    return {
      selectedProvider: cheapest.name,
      estimatedCost: this.estimateTypicalCost(cheapest),
      reasoning: 'No providers within budget - selected cheapest available option',
      alternatives: [],
      warnings: [
        'Selected provider exceeds budget constraints',
        'Consider reducing operation complexity or increasing budget'
      ]
    };
  }

  private getFallbackProvider(request: ProviderSelectionRequest): ProviderSelectionResult {
    const fallbackProviders: { [key: string]: string } = {
      tts: 'kokoro',
      ai_generation: 'openai-gpt4o-mini',
      image_generation: 'stable-diffusion'
    };

    const fallback = fallbackProviders[request.service] || 'unknown';

    return {
      selectedProvider: fallback,
      estimatedCost: 0.01, // Fallback estimate
      reasoning: 'Provider selection failed - using fallback option',
      alternatives: [],
      warnings: ['Provider selection failed - may not meet requirements']
    };
  }

  private getPeriodDates(period: 'daily' | 'monthly' | 'total', date: Date): { startDate: Date; endDate: Date } {
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    
    let startDate: Date;
    
    switch (period) {
      case 'daily':
        startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        startDate = new Date(date.getFullYear(), date.getMonth(), 1);
        break;
      case 'total':
        startDate = new Date(2024, 0, 1); // Start of service
        break;
    }
    
    return { startDate, endDate };
  }

  private getBudgetForPeriod(period: 'daily' | 'monthly' | 'total'): number {
    switch (period) {
      case 'daily':
        return this.config.budgetLimits.dailyBudget;
      case 'monthly':
        return this.config.budgetLimits.monthlyBudget;
      case 'total':
        return this.config.budgetLimits.monthlyBudget * 12; // Annual estimate
      default:
        return 0;
    }
  }

  private calculateServiceBreakdowns(usageData: UsageRecord[]): { [service: string]: ServiceCostBreakdown } {
    const breakdown: { [service: string]: ServiceCostBreakdown } = {};
    
    // Group by service
    const serviceGroups = usageData.reduce((groups, record) => {
      const key = record.service;
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
      return groups;
    }, {} as { [key: string]: UsageRecord[] });
    
    // Calculate breakdown for each service
    for (const [service, records] of Object.entries(serviceGroups)) {
      const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
      const totalRequests = records.length;
      const totalUnits = records.reduce((sum, r) => sum + r.units, 0);
      const successfulRecords = records.filter(r => r.success);
      
      // Determine most used provider
      const providerCounts = records.reduce((counts, r) => {
        counts[r.provider] = (counts[r.provider] || 0) + 1;
        return counts;
      }, {} as { [provider: string]: number });
      
      const primaryProvider = Object.entries(providerCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';
      
      // Calculate trend (simplified)
      const trend = this.calculateTrend(records);
      
      breakdown[service] = {
        service,
        provider: primaryProvider,
        totalCost,
        usage: {
          requests: totalRequests,
          units: totalUnits,
          unitType: records[0]?.unitType || 'unknown'
        },
        averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
        averageCostPerUnit: totalUnits > 0 ? totalCost / totalUnits : 0,
        trend,
        efficiency: successfulRecords.length > 0 ? totalCost / successfulRecords.length : 0
      };
    }
    
    return breakdown;
  }

  private calculateTrend(records: UsageRecord[]): 'increasing' | 'decreasing' | 'stable' {
    if (records.length < 2) return 'stable';
    
    // Sort by timestamp
    const sorted = records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Compare first half to second half
    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);
    
    const firstAvg = firstHalf.reduce((sum, r) => sum + r.cost, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, r) => sum + r.cost, 0) / secondHalf.length;
    
    const changePct = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (changePct > 10) return 'increasing';
    if (changePct < -10) return 'decreasing';
    return 'stable';
  }

  private async generateCostRecommendations(usageData: UsageRecord[], period: string): Promise<CostRecommendation[]> {
    const recommendations: CostRecommendation[] = [];
    
    // Group by service to analyze
    const serviceGroups = usageData.reduce((groups, record) => {
      if (!groups[record.service]) groups[record.service] = [];
      groups[record.service].push(record);
      return groups;
    }, {} as { [service: string]: UsageRecord[] });
    
    for (const [service, records] of Object.entries(serviceGroups)) {
      const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
      
      // High cost services
      if (totalCost > 10) { // $10 threshold
        recommendations.push({
          type: 'optimization',
          priority: 'high',
          service,
          currentCost: totalCost,
          potentialSaving: totalCost * 0.3, // Estimate 30% savings
          description: `${service} is a high-cost service consuming $${totalCost.toFixed(2)}`,
          implementation: 'Review provider selection and optimize usage patterns',
          impact: 'Significant cost reduction possible',
          effort: 'medium'
        });
      }
      
      // Inefficient providers
      const providerCosts = records.reduce((costs, r) => {
        if (!costs[r.provider]) costs[r.provider] = { cost: 0, count: 0 };
        costs[r.provider].cost += r.cost;
        costs[r.provider].count++;
        return costs;
      }, {} as { [provider: string]: { cost: number; count: number } });
      
      // Find expensive providers
      for (const [provider, stats] of Object.entries(providerCosts)) {
        const avgCost = stats.cost / stats.count;
        const allProviderAvg = totalCost / records.length;
        
        if (avgCost > allProviderAvg * 1.5 && stats.cost > 1) { // 50% more expensive and over $1
          recommendations.push({
            type: 'switch_provider',
            priority: 'medium',
            service,
            currentCost: stats.cost,
            potentialSaving: stats.cost * 0.4,
            description: `${provider} provider is expensive for ${service}`,
            implementation: `Switch to more cost-effective provider for ${service}`,
            impact: 'Medium cost reduction',
            effort: 'low'
          });
        }
      }
      
      // Low success rate
      const successRate = records.filter(r => r.success).length / records.length;
      if (successRate < 0.8 && totalCost > 1) {
        recommendations.push({
          type: 'optimization',
          priority: 'high',
          service,
          currentCost: totalCost,
          potentialSaving: totalCost * (1 - successRate),
          description: `${service} has low success rate (${(successRate * 100).toFixed(1)}%)`,
          implementation: 'Investigate and fix reliability issues',
          impact: 'Reduce wasted spending on failed operations',
          effort: 'high'
        });
      }
    }
    
    // Sort by potential savings
    recommendations.sort((a, b) => b.potentialSaving - a.potentialSaving);
    
    return recommendations.slice(0, 10); // Top 10 recommendations
  }

  private calculateProjectedSpend(usageData: UsageRecord[], period: 'daily' | 'monthly', currentDate: Date): number {
    if (usageData.length === 0) return 0;
    
    const totalSpent = usageData.reduce((sum, r) => sum + r.cost, 0);
    
    if (period === 'daily') {
      return totalSpent; // Already daily
    }
    
    // For monthly projection
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const daysPassed = currentDate.getDate();
    const dailyAverage = totalSpent / daysPassed;
    
    return dailyAverage * daysInMonth;
  }

  private async checkBudgetAlerts(service: string, provider: string, cost: number): Promise<void> {
    const today = new Date();
    const dailyUsage = await this.getCostTrackingData('daily', today);
    const monthlyUsage = await this.getCostTrackingData('monthly', today);
    
    // Check daily threshold
    const dailyPercent = (dailyUsage.totalSpent / this.config.budgetLimits.dailyBudget) * 100;
    if (dailyPercent >= this.config.alerts.thresholds.dailySpendPercent) {
      await this.alertManager.createAlert({
        type: 'budget_threshold',
        severity: dailyPercent >= 90 ? 'critical' : 'warning',
        service,
        provider,
        message: `Daily budget ${dailyPercent.toFixed(1)}% utilized`,
        data: {
          current: dailyUsage.totalSpent,
          threshold: this.config.budgetLimits.dailyBudget,
          percentage: dailyPercent
        },
        recommendations: [
          'Monitor remaining spending carefully',
          'Consider using more cost-effective providers',
          'Review if daily budget limit needs adjustment'
        ]
      });
    }
    
    // Check monthly threshold
    const monthlyPercent = (monthlyUsage.totalSpent / this.config.budgetLimits.monthlyBudget) * 100;
    if (monthlyPercent >= this.config.alerts.thresholds.monthlySpendPercent) {
      await this.alertManager.createAlert({
        type: 'budget_threshold',
        severity: monthlyPercent >= 90 ? 'critical' : 'warning',
        service,
        provider,
        message: `Monthly budget ${monthlyPercent.toFixed(1)}% utilized`,
        data: {
          current: monthlyUsage.totalSpent,
          threshold: this.config.budgetLimits.monthlyBudget,
          percentage: monthlyPercent
        },
        recommendations: [
          'Review monthly spending patterns',
          'Implement cost optimization strategies',
          'Consider budget reallocation or increase'
        ]
      });
    }
  }
}

// Supporting classes and interfaces

interface ProviderInfo {
  name: string;
  costPerUnit: number;
  unitType: string;
  quality: 'basic' | 'standard' | 'premium';
  speed: 'slow' | 'standard' | 'fast';
  features: string[];
  availability: number;
  priority: number;
}

interface ScoredProvider {
  name: string;
  provider: ProviderInfo;
  score: number;
  estimatedCost: number;
  tradeoffs: string;
  reasoning: string;
}

interface UsageRecord {
  service: string;
  provider: string;
  cost: number;
  units: number;
  unitType: string;
  timestamp: Date;
  success: boolean;
}

class UsageTracker {
  private records: UsageRecord[] = [];

  async record(usage: UsageRecord): Promise<void> {
    this.records.push(usage);
    // In production, this would persist to database
  }

  async getUsage(startDate: Date, endDate: Date): Promise<UsageRecord[]> {
    return this.records.filter(r => 
      r.timestamp >= startDate && r.timestamp <= endDate
    );
  }

  async getRecentUsage(days: number): Promise<UsageRecord[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return this.records.filter(r => r.timestamp >= cutoff);
  }
}

class AlertManager {
  private alerts: CostAlert[] = [];
  private config: CostOptimizationConfig['alerts'];

  constructor(config: CostOptimizationConfig['alerts']) {
    this.config = config;
  }

  async createAlert(alertData: Omit<CostAlert, 'id' | 'timestamp' | 'acknowledged'>): Promise<void> {
    const alert: CostAlert = {
      ...alertData,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      acknowledged: false
    };

    this.alerts.push(alert);

    // Send notifications if configured
    if (this.config.webhookUrl) {
      await this.sendWebhookAlert(alert);
    }

    logger.warn(`Cost alert created: ${alert.message}`);
  }

  async getActiveAlerts(): Promise<CostAlert[]> {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  updateConfig(config: CostOptimizationConfig['alerts']): void {
    this.config = config;
  }

  private async sendWebhookAlert(alert: CostAlert): Promise<void> {
    try {
      if (!this.config.webhookUrl) return;

      // In production, this would make actual HTTP request
      logger.info(`Would send webhook alert to ${this.config.webhookUrl}`);
    } catch (error) {
      logger.error(`Failed to send webhook alert: ${error}`);
    }
  }
}