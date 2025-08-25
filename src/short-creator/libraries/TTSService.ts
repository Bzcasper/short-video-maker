import { logger } from '../../config';
import { 
  TTSProvider, 
  TTSProviderFactory, 
  TTSAudioResult, 
  TTSRequest, 
  TTSVoice, 
  TTSProviderConfig,
  TTSProviderHealth,
  TTSProviderMetrics
} from './TTSProvider';

export interface TTSServiceConfig {
  providers: {
    [key: string]: TTSProviderConfig;
  };
  defaultProvider: string;
  fallbackOrder?: string[];
  costOptimization?: boolean;
  maxCostPerMinute?: number;
  monthlyBudget?: number;
  qualityThreshold?: number;
  latencyThreshold?: number;
  healthCheckInterval?: number;
  circuitBreakerThreshold?: number;
}

export interface ProviderSelectionCriteria {
  language?: string;
  quality?: 'standard' | 'premium' | 'neural';
  cost?: 'low' | 'balanced' | 'high';
  latency?: 'low' | 'balanced' | 'high';
  voiceStyle?: string;
}

export class TTSService {
  private providers: Map<string, TTSProvider> = new Map();
  private providerHealth: Map<string, TTSProviderHealth> = new Map();
  private providerMetrics: Map<string, TTSProviderMetrics> = new Map();
  private config: TTSServiceConfig;
  private isInitialized = false;

  constructor(config: TTSServiceConfig) {
    this.config = {
      fallbackOrder: [],
      costOptimization: true,
      maxCostPerMinute: 0.10,
      monthlyBudget: 100,
      qualityThreshold: 0.8,
      latencyThreshold: 5000,
      healthCheckInterval: 300000, // 5 minutes
      circuitBreakerThreshold: 0.5, // 50% error rate
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info('Initializing TTS Service with multiple providers');

    // Initialize all configured providers
    for (const [providerName, providerConfig] of Object.entries(this.config.providers)) {
      try {
        const provider = TTSProviderFactory.createProvider(
          providerName as any,
          providerConfig
        );
        
        await provider.initialize();
        await provider.validateCredentials();
        
        this.providers.set(providerName, provider);
        this.providerHealth.set(providerName, await provider.healthCheck());
        this.providerMetrics.set(providerName, provider.getMetrics());
        
        logger.info({ provider: providerName }, 'TTS provider initialized successfully');
      } catch (error) {
        logger.error({ provider: providerName, error }, 'Failed to initialize TTS provider');
      }
    }

    if (this.providers.size === 0) {
      throw new Error('No TTS providers could be initialized');
    }

    // Set up periodic health checks
    setInterval(() => this.performHealthChecks(), this.config.healthCheckInterval!);

    this.isInitialized = true;
    logger.info('TTS Service initialization completed');
  }

  async generateSpeech(
    request: TTSRequest, 
    criteria?: ProviderSelectionCriteria
  ): Promise<TTSAudioResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const selectedProvider = await this.selectProvider(request, criteria);
    const startTime = Date.now();

    try {
      const result = await selectedProvider.generateSpeech(request);
      const latency = Date.now() - startTime;

      // Update metrics with latency information
      this.updateProviderMetrics(selectedProvider, true, request.text.length, result.audioLength, result.costEstimate || 0, latency);

      logger.debug(
        { 
          provider: selectedProvider.constructor.name,
          textLength: request.text.length,
          audioLength: result.audioLength,
          cost: result.costEstimate,
          latency
        },
        'TTS generation completed successfully'
      );

      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateProviderMetrics(selectedProvider, false, request.text.length, 0, 0, latency);

      logger.error(
        { provider: selectedProvider.constructor.name, error },
        'TTS generation failed'
      );

      // Try fallback providers if available
      return this.tryFallbackProviders(request, criteria, selectedProvider.constructor.name);
    }
  }

  private async selectProvider(
    request: TTSRequest, 
    criteria?: ProviderSelectionCriteria
  ): Promise<TTSProvider> {
    const availableProviders = Array.from(this.providers.entries())
      .filter(([name, provider]) => {
        const health = this.providerHealth.get(name);
        return health && health.status === 'healthy';
      });

    if (availableProviders.length === 0) {
      throw new Error('No healthy TTS providers available');
    }

    logger.debug(
      { availableProviders: availableProviders.map(([name]) => name), criteria },
      'Selecting optimal TTS provider'
    );

    // Apply selection criteria
    let candidates = availableProviders;

    // Filter by language support
    if (criteria?.language || request.language) {
      const targetLanguage = criteria?.language || request.language;
      candidates = candidates.filter(([name, provider]) => {
        return this.supportsLanguage(name, targetLanguage!);
      });
    }

    // Filter by text length constraints
    candidates = candidates.filter(([name, provider]) => {
      return this.supportsTextLength(name, request.text.length);
    });

    // Apply quality preferences
    if (criteria?.quality) {
      candidates = this.sortByQuality(candidates, criteria.quality);
    }

    // Apply cost optimization if enabled
    if (this.config.costOptimization && criteria?.cost !== 'high') {
      candidates = this.sortByCost(candidates, request);
    }

    // Apply latency preferences
    if (criteria?.latency === 'low') {
      candidates = this.sortByLatency(candidates);
    }

    // Check budget constraints
    const affordableCandidates = candidates.filter(([name, provider]) => {
      const metrics = this.providerMetrics.get(name);
      return !metrics || metrics.totalCost < (this.config.monthlyBudget! * 0.9); // 90% of budget
    });

    if (affordableCandidates.length > 0) {
      candidates = affordableCandidates;
    }

    // Final scoring based on multiple factors
    const scored = candidates.map(([name, provider]) => {
      const health = this.providerHealth.get(name)!;
      const metrics = this.providerMetrics.get(name);
      
      let score = 0;
      
      // Health score (30% weight)
      if (health.status === 'healthy') score += 30;
      else if (health.status === 'degraded') score += 15;
      
      // Performance score (25% weight)
      if (metrics) {
        const errorRateScore = Math.max(0, 25 - (metrics.errorRate * 100));
        const latencyScore = Math.max(0, 25 - (health.latency / 100));
        score += (errorRateScore + latencyScore) / 2;
      } else {
        score += 20; // Default score for new providers
      }
      
      // Cost efficiency score (25% weight)
      const estimatedCost = this.estimateProviderCost(provider, request);
      const costScore = Math.max(0, 25 - (estimatedCost * 1000));
      score += costScore;
      
      // Provider-specific bonuses (20% weight)
      if (name === 'elevenlabs' && criteria?.quality === 'premium') score += 15;
      if (name === 'openai' && this.isMultilingual(request)) score += 10;
      if (name === 'azure' && criteria?.quality === 'neural') score += 12;
      if (name === 'kokoro' && !criteria?.quality) score += 5; // Reliable fallback
      
      return { name, provider, score };
    });
    
    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    
    logger.debug(
      { 
        scoredProviders: scored.map(s => ({ name: s.name, score: s.score })),
        selected: scored[0]?.name
      },
      'Provider selection completed'
    );

    if (scored.length === 0) {
      throw new Error('No suitable TTS providers found for the given criteria');
    }

    return scored[0].provider;
  }

  private supportsLanguage(providerName: string, language: string): boolean {
    // Language support mapping
    const languageSupport: Record<string, string[]> = {
      elevenlabs: ['en', 'es', 'fr', 'de', 'it', 'pt', 'hi', 'ja', 'ko', 'zh'],
      openai: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar'],
      azure: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar', 'hi'],
      google: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar', 'hi'],
      kokoro: ['en'],
    };

    const supported = languageSupport[providerName] || ['en'];
    const langCode = language.split('-')[0]; // Extract 'en' from 'en-US'
    return supported.includes(langCode);
  }

  private supportsTextLength(providerName: string, textLength: number): boolean {
    const limits: Record<string, number> = {
      elevenlabs: 5000,
      openai: 4096,
      azure: 10000,
      google: 5000,
      kokoro: 1000,
    };

    const limit = limits[providerName] || 1000;
    return textLength <= limit;
  }

  private sortByQuality(candidates: [string, TTSProvider][], quality: string): [string, TTSProvider][] {
    const qualityRanking: Record<string, Record<string, number>> = {
      premium: { elevenlabs: 5, azure: 4, google: 3, openai: 2, kokoro: 1 },
      neural: { azure: 5, google: 4, openai: 3, elevenlabs: 2, kokoro: 1 },
      standard: { openai: 5, google: 4, azure: 3, elevenlabs: 2, kokoro: 1 },
    };

    const ranking = qualityRanking[quality] || qualityRanking.standard;
    
    return candidates.sort((a, b) => (ranking[b[0]] || 0) - (ranking[a[0]] || 0));
  }

  private sortByCost(candidates: [string, TTSProvider][], request: TTSRequest): [string, TTSProvider][] {
    return candidates.sort((a, b) => {
      const costA = this.estimateProviderCost(a[1], request);
      const costB = this.estimateProviderCost(b[1], request);
      return costA - costB;
    });
  }

  private sortByLatency(candidates: [string, TTSProvider][]): [string, TTSProvider][] {
    return candidates.sort((a, b) => {
      const healthA = this.providerHealth.get(a[0]);
      const healthB = this.providerHealth.get(b[0]);
      return (healthA?.latency || 1000) - (healthB?.latency || 1000);
    });
  }

  private isMultilingual(request: TTSRequest): boolean {
    const text = request.text;
    // Simple heuristic to detect if text might be multilingual
    const hasNonEnglish = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u0600-\u06FF\u0400-\u04FF]/.test(text);
    return hasNonEnglish || !!(request.language && !request.language.startsWith('en'));
  }

  private async tryFallbackProviders(
    request: TTSRequest,
    criteria?: ProviderSelectionCriteria,
    failedProvider?: string
  ): Promise<TTSAudioResult> {
    const fallbackOrder = this.getFallbackOrder(failedProvider);
    
    for (const providerName of fallbackOrder) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      const health = this.providerHealth.get(providerName);
      if (health?.status !== 'healthy') continue;

      try {
        const result = await provider.generateSpeech(request);
        logger.warn(
          { originalProvider: failedProvider, fallbackProvider: providerName },
          'Successfully used fallback provider after primary failure'
        );
        return result;
      } catch (error) {
        logger.warn(
          { provider: providerName, error },
          'Fallback provider also failed'
        );
      }
    }

    throw new Error('All TTS providers failed to generate speech');
  }

  private getFallbackOrder(failedProvider?: string): string[] {
    // Use configured fallback order, or determine dynamically
    if (this.config.fallbackOrder && this.config.fallbackOrder.length > 0) {
      return this.config.fallbackOrder.filter(provider => provider !== failedProvider);
    }

    // Dynamic fallback based on provider health and metrics
    return Array.from(this.providers.keys())
      .filter(provider => provider !== failedProvider)
      .sort((a, b) => {
        const healthA = this.providerHealth.get(a);
        const healthB = this.providerHealth.get(b);
        const metricsA = this.providerMetrics.get(a);
        const metricsB = this.providerMetrics.get(b);

        // Prefer healthier providers
        if (healthA?.status !== healthB?.status) {
          return healthA?.status === 'healthy' ? -1 : 1;
        }

        // Prefer providers with better error rates
        if (metricsA && metricsB) {
          return metricsA.errorRate - metricsB.errorRate;
        }

        return 0;
      });
  }

  private estimateProviderCost(provider: TTSProvider, request: TTSRequest): number {
    const providerName = provider.constructor.name.replace('TTSProvider', '').toLowerCase();
    const textLength = request.text.length;
    
    // Provider-specific cost models (cost per character)
    const costModels: Record<string, number> = {
      elevenlabs: 0.00003,     // $0.03 per 1000 characters
      openai: 0.000015,        // $0.015 per 1000 characters  
      azure: 0.000016,         // $0.016 per 1000 characters
      google: 0.000016,        // $0.016 per 1000 characters
      kokoro: 0.00002,         // $0.02 per 1000 characters (estimated)
    };

    const costPerCharacter = costModels[providerName] || 0.0001; // Default fallback
    return textLength * costPerCharacter;
  }

  private hasPremiumVoices(providerName: string): boolean {
    // This would check if the provider has premium voice capabilities
    // For now, we'll assume ElevenLabs and Azure have premium options
    return ['elevenlabs', 'azure'].includes(providerName);
  }

  private updateProviderMetrics(
    provider: TTSProvider,
    success: boolean,
    textLength: number,
    audioLength: number,
    cost: number,
    latency: number
  ): void {
    const providerName = provider.constructor.name.replace('TTSProvider', '').toLowerCase();
    const metrics = this.providerMetrics.get(providerName) || {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCharacters: 0,
      totalAudioSeconds: 0,
      totalCost: 0,
      averageLatency: 0,
      errorRate: 0
    };

    metrics.totalRequests++;
    metrics.totalCharacters += textLength;
    metrics.totalAudioSeconds += audioLength;
    metrics.totalCost += cost;

    if (success) {
      metrics.successfulRequests++;
      metrics.averageLatency = 
        (metrics.averageLatency * (metrics.successfulRequests - 1) + latency) / 
        metrics.successfulRequests;
    } else {
      metrics.failedRequests++;
    }

    metrics.errorRate = metrics.failedRequests / metrics.totalRequests;
    this.providerMetrics.set(providerName, metrics);

    // Update health status based on error rate
    if (metrics.errorRate > this.config.circuitBreakerThreshold!) {
      const health = this.providerHealth.get(providerName) || {
        status: 'healthy',
        latency: 0,
        errorRate: 0,
        lastCheck: new Date()
      };
      
      health.status = 'unhealthy';
      health.errorRate = metrics.errorRate;
      this.providerHealth.set(providerName, health);
    }
  }

  async listAllVoices(language?: string): Promise<TTSVoice[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const allVoices: TTSVoice[] = [];
    
    for (const [providerName, provider] of this.providers.entries()) {
      try {
        const voices = await provider.listVoices(language);
        allVoices.push(...voices);
      } catch (error) {
        logger.warn({ provider: providerName, error }, 'Failed to list voices from provider');
      }
    }

    return allVoices;
  }

  async getProviderHealth(providerName?: string): Promise<Map<string, TTSProviderHealth>> {
    if (providerName) {
      const health = this.providerHealth.get(providerName);
      return new Map([[providerName, health || { status: 'healthy', latency: 0, errorRate: 0, lastCheck: new Date() }]]);
    }
    return new Map(this.providerHealth);
  }

  async getProviderMetrics(providerName?: string): Promise<Map<string, TTSProviderMetrics>> {
    if (providerName) {
      const metrics = this.providerMetrics.get(providerName);
      return new Map([[providerName, metrics || {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalCharacters: 0,
        totalAudioSeconds: 0,
        totalCost: 0,
        averageLatency: 0,
        errorRate: 0
      }]]);
    }
    return new Map(this.providerMetrics);
  }

  getTotalCost(): number {
    let total = 0;
    for (const metrics of this.providerMetrics.values()) {
      total += metrics.totalCost;
    }
    return total;
  }

  getBudgetUtilization(): number {
    const totalCost = this.getTotalCost();
    const monthlyBudget = this.config.monthlyBudget || 100; // Default budget
    return monthlyBudget > 0 ? (totalCost / monthlyBudget) * 100 : 0;
  }

  async performHealthChecks(): Promise<void> {
    logger.debug('Performing periodic TTS provider health checks');
    
    for (const [providerName, provider] of this.providers.entries()) {
      try {
        const health = await provider.healthCheck();
        this.providerHealth.set(providerName, health);
        
        if (health.status === 'healthy') {
          logger.debug({ provider: providerName }, 'Provider health check passed');
        } else {
          logger.warn({ provider: providerName, health }, 'Provider health check failed');
        }
      } catch (error) {
        logger.error({ provider: providerName, error }, 'Health check failed');
        this.providerHealth.set(providerName, {
          status: 'unhealthy',
          latency: 0,
          errorRate: 1,
          lastCheck: new Date()
        });
      }
    }
  }

  getServiceStatus() {
    return {
      initialized: this.isInitialized,
      totalProviders: this.providers.size,
      healthyProviders: Array.from(this.providerHealth.values()).filter(h => h.status === 'healthy').length,
      config: this.config,
      providers: Array.from(this.providers.keys()).map(name => ({
        name,
        health: this.providerHealth.get(name),
        metrics: this.providerMetrics.get(name)
      }))
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down TTS Service');
    this.isInitialized = false;
    // Clean up any resources if needed
  }
}

// Singleton instance for easy access
let ttsServiceInstance: TTSService | null = null;

export function getTTSService(config?: TTSServiceConfig): TTSService {
  if (!ttsServiceInstance) {
    if (!config) {
      throw new Error('TTSService must be initialized with configuration first');
    }
    ttsServiceInstance = new TTSService(config);
  }
  return ttsServiceInstance;
}

export function initializeTTSService(config: TTSServiceConfig): TTSService {
  if (ttsServiceInstance) {
    logger.warn('TTSService is already initialized');
    return ttsServiceInstance;
  }
  ttsServiceInstance = new TTSService(config);
  return ttsServiceInstance;
}