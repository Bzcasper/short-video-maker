/**
 * TTS Configuration and Provider Settings
 * Centralized configuration for all TTS providers
 */

import { logger } from '../../config';

export interface TTSProviderConfig {
  enabled: boolean;
  priority: number;
  apiKey?: string;
  endpoint?: string;
  maxCharactersPerRequest?: number;
  rateLimit?: {
    requestsPerMinute: number;
    maxConcurrentRequests: number;
  };
  costPerCharacter?: number;
  defaultVoice?: string;
  supportedLanguages?: string[];
  timeoutMs?: number;
  retryAttempts?: number;
}

export interface TTSGlobalConfig {
  defaultProvider: string;
  fallbackOrder: string[];
  maxBudgetPerMonth: number;
  characterLimitPerMonth: number;
  enableCostOptimization: boolean;
  enableHealthMonitoring: boolean;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenMaxRequests: number;
  };
  providers: {
    [providerName: string]: TTSProviderConfig;
  };
}

export const DEFAULT_TTS_CONFIG: TTSGlobalConfig = {
  defaultProvider: 'elevenlabs',
  fallbackOrder: ['elevenlabs', 'openai', 'azure', 'google', 'kokoro'],
  maxBudgetPerMonth: 100, // $100 monthly budget
  characterLimitPerMonth: 1000000, // 1 million characters
  enableCostOptimization: true,
  enableHealthMonitoring: true,
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 60000, // 1 minute
    halfOpenMaxRequests: 3,
  },
  providers: {
    elevenlabs: {
      enabled: false,
      priority: 1,
      apiKey: process.env.ELEVENLABS_API_KEY || '',
      endpoint: 'https://api.elevenlabs.io/v1',
      maxCharactersPerRequest: 5000,
      rateLimit: {
        requestsPerMinute: 150,
        maxConcurrentRequests: 10,
      },
      costPerCharacter: 0.00003, // $0.03 per 1000 characters
      defaultVoice: '21m00Tcm4TlvDq8ikWAM',
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'hi', 'ja', 'ko', 'zh'],
      timeoutMs: 30000,
      retryAttempts: 3,
    },
    openai: {
      enabled: false,
      priority: 2,
      apiKey: process.env.OPENAI_API_KEY || '',
      endpoint: 'https://api.openai.com/v1',
      maxCharactersPerRequest: 4096,
      rateLimit: {
        requestsPerMinute: 60,
        maxConcurrentRequests: 5,
      },
      costPerCharacter: 0.000015, // $0.015 per 1000 characters
      defaultVoice: 'alloy',
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'],
      timeoutMs: 30000,
      retryAttempts: 3,
    },
    azure: {
      enabled: false,
      priority: 3,
      apiKey: process.env.AZURE_SPEECH_KEY || '',
      endpoint: process.env.AZURE_SPEECH_ENDPOINT || '',
      maxCharactersPerRequest: 10000,
      rateLimit: {
        requestsPerMinute: 200,
        maxConcurrentRequests: 20,
      },
      costPerCharacter: 0.000016, // $0.016 per 1000 characters
      defaultVoice: 'en-US-JennyNeural',
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar'],
      timeoutMs: 30000,
      retryAttempts: 3,
    },
    google: {
      enabled: false,
      priority: 4,
      apiKey: process.env.GOOGLE_TTS_API_KEY || '',
      endpoint: 'https://texttospeech.googleapis.com/v1',
      maxCharactersPerRequest: 5000,
      rateLimit: {
        requestsPerMinute: 1000,
        maxConcurrentRequests: 100,
      },
      costPerCharacter: 0.000016, // $0.016 per 1000 characters
      defaultVoice: 'en-US-Wavenet-D',
      supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar', 'hi'],
      timeoutMs: 30000,
      retryAttempts: 3,
    },
    kokoro: {
      enabled: true, // Kokoro is enabled by default as it's the existing provider
      priority: 5,
      apiKey: process.env.KOKORO_API_KEY || '',
      endpoint: process.env.KOKORO_API_ENDPOINT || 'https://api.kokoro.io/v1',
      maxCharactersPerRequest: 1000,
      rateLimit: {
        requestsPerMinute: 60,
        maxConcurrentRequests: 5,
      },
      costPerCharacter: 0.00002, // $0.02 per 1000 characters
      defaultVoice: 'default',
      supportedLanguages: ['en'],
      timeoutMs: 30000,
      retryAttempts: 3,
    },
  },
};

export class TTSConfigManager {
  private config: TTSGlobalConfig;
  private logger = logger.child({ service: 'TTSConfigManager' });

  constructor(initialConfig: Partial<TTSGlobalConfig> = {}) {
    this.config = { ...DEFAULT_TTS_CONFIG, ...initialConfig };
    this.applyEnvironmentOverrides();
    this.validateConfig();
  }

  private applyEnvironmentOverrides(): void {
    // Enable providers based on environment variables
    const providerEnableFlags = {
      elevenlabs: process.env.ENABLE_ELEVENLABS,
      openai: process.env.ENABLE_OPENAI,
      azure: process.env.ENABLE_AZURE,
      google: process.env.ENABLE_GOOGLE,
      kokoro: process.env.ENABLE_KOKORO,
    };

    for (const [providerName, enableFlag] of Object.entries(providerEnableFlags)) {
      if (this.config.providers[providerName] && enableFlag !== undefined) {
        // Handle both string "true"/"false" and actual boolean values
        const flagValue = enableFlag.toString().toLowerCase();
        this.config.providers[providerName].enabled = flagValue === 'true' || flagValue === '1';
      }
    }

    // Override default provider from environment
    if (process.env.TTS_DEFAULT_PROVIDER && this.config.providers[process.env.TTS_DEFAULT_PROVIDER]) {
      this.config.defaultProvider = process.env.TTS_DEFAULT_PROVIDER;
    }

    // Debug logging to show what providers are enabled
    this.logger.debug('TTS Configuration Environment Overrides Applied');
    for (const [providerName, config] of Object.entries(this.config.providers)) {
      this.logger.debug({ provider: providerName, enabled: config.enabled }, 'Provider status');
    }
    this.logger.debug({ defaultProvider: this.config.defaultProvider }, 'Default provider set');
  }

  private validateConfig(): void {
    // Validate that enabled providers have required API keys
    for (const [providerName, providerConfig] of Object.entries(this.config.providers)) {
      if (providerConfig.enabled) {
        if (!providerConfig.apiKey && providerName !== 'kokoro') {
          this.logger.warn({ provider: providerName }, 'TTS Provider is enabled but missing API key');
        }
      }
    }

    // Validate fallback order contains only valid providers
    for (const providerName of this.config.fallbackOrder) {
      if (!this.config.providers[providerName]) {
        throw new Error(`Invalid provider in fallback order: ${providerName}`);
      }
    }

    // Validate default provider exists and is enabled
    if (!this.config.providers[this.config.defaultProvider]?.enabled) {
      throw new Error(`Default provider ${this.config.defaultProvider} is not enabled or does not exist`);
    }
  }

  getConfig(): TTSGlobalConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<TTSGlobalConfig>): void {
    this.config = { ...this.config, ...updates };
    this.validateConfig();
  }

  updateProviderConfig(providerName: string, updates: Partial<TTSProviderConfig>): void {
    if (!this.config.providers[providerName]) {
      throw new Error(`Provider ${providerName} does not exist`);
    }

    this.config.providers[providerName] = {
      ...this.config.providers[providerName],
      ...updates,
    };
    this.validateConfig();
  }

  getEnabledProviders(): string[] {
    return Object.entries(this.config.providers)
      .filter(([_, config]) => config.enabled)
      .map(([name]) => name);
  }

  getProviderConfig(providerName: string): TTSProviderConfig | undefined {
    return this.config.providers[providerName];
  }

  isProviderEnabled(providerName: string): boolean {
    return this.config.providers[providerName]?.enabled || false;
  }

  getCostEstimate(text: string, providerName?: string): number {
    const characterCount = text.length;
    let totalCost = 0;

    if (providerName) {
      const provider = this.config.providers[providerName];
      if (provider && provider.costPerCharacter) {
        totalCost = characterCount * provider.costPerCharacter;
      }
    } else {
      // Calculate minimum cost across all enabled providers
      for (const provider of Object.values(this.config.providers)) {
        if (provider.enabled && provider.costPerCharacter) {
          const providerCost = characterCount * provider.costPerCharacter;
          if (totalCost === 0 || providerCost < totalCost) {
            totalCost = providerCost;
          }
        }
      }
    }

    return totalCost;
  }
}

// Singleton instance
let configManager: TTSConfigManager | null = null;

export function getTTSConfigManager(): TTSConfigManager {
  if (!configManager) {
    configManager = new TTSConfigManager();
  }
  return configManager;
}

export function initializeTTSConfig(customConfig?: Partial<TTSGlobalConfig>): TTSConfigManager {
  configManager = new TTSConfigManager(customConfig);
  return configManager;
}