import path from "path";
import "dotenv/config";
import os from "os";
import fs from "fs-extra";
import pino from "pino";
import { kokoroModelPrecision, whisperModels } from "./types/shorts";

// Environment variable validation schema
interface EnvConfig {
  // Core application settings
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  LOG_LEVEL: pino.Level;
  
  // Required API keys
  PEXELS_API_KEY: string;
  
  // Optional API keys
  OPENAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  
  // Application paths
  DATA_DIR_PATH?: string;
  STATIC_DIR_PATH?: string;
  
  // Docker and deployment
  DOCKER: boolean;
  DEV: boolean;
  
  // Performance settings
  CONCURRENCY?: number;
  VIDEO_CACHE_SIZE_IN_BYTES?: number;
  
  // Whisper configuration
  WHISPER_MODEL: whisperModels;
  WHISPER_VERSION: string;
  WHISPER_VERBOSE: boolean;
  
  // Kokoro TTS configuration
  KOKORO_MODEL_PRECISION: kokoroModelPrecision;
  KOKORO_MODEL_NAME: string;
  
  // Redis configuration
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;
  
  // TTS Provider configuration
  TTS_PROVIDER: 'kokoro' | 'elevenlabs' | 'openai';
  
  // GPU settings
  CUDA_VISIBLE_DEVICES?: string;
  GPU_MEMORY_FRACTION?: number;
  
  // Security settings
  JWT_SECRET?: string;
  CORS_ORIGIN?: string;
  
  // Monitoring and observability
  ENABLE_METRICS: boolean;
  PROMETHEUS_PORT?: number;
  JAEGER_ENDPOINT?: string;
}

// Default values
const DEFAULT_VALUES = {
  NODE_ENV: 'development' as const,
  PORT: 3123,
  LOG_LEVEL: 'info' as pino.Level,
  DOCKER: false,
  DEV: false,
  WHISPER_MODEL: 'medium.en' as whisperModels,
  WHISPER_VERSION: '1.7.1',
  WHISPER_VERBOSE: false,
  KOKORO_MODEL_PRECISION: 'fp32' as kokoroModelPrecision,
  KOKORO_MODEL_NAME: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6379,
  REDIS_DB: 0,
  TTS_PROVIDER: 'kokoro' as const,
  ENABLE_METRICS: false,
} as const;

/**
 * Parse and validate environment variables with proper typing
 */
function parseEnvConfig(): EnvConfig {
  const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  };
  
  const parseNumber = (value: string | undefined, defaultValue: number): number => {
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      logger.warn(`Invalid number value for environment variable: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    return parsed;
  };
  
  const parseOptionalNumber = (value: string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      logger.warn(`Invalid number value for environment variable: ${value}`);
      return undefined;
    }
    return parsed;
  };
  
  // Validate required environment variables
  const requiredVars = ['PEXELS_API_KEY'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Please check your .env file or environment configuration.'
    );
  }
  
  return {
    NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || DEFAULT_VALUES.NODE_ENV,
    PORT: parseNumber(process.env.PORT, DEFAULT_VALUES.PORT),
    LOG_LEVEL: (process.env.LOG_LEVEL as pino.Level) || DEFAULT_VALUES.LOG_LEVEL,
    
    // Required API keys
    PEXELS_API_KEY: process.env.PEXELS_API_KEY!,
    
    // Optional API keys
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    
    // Application paths
    DATA_DIR_PATH: process.env.DATA_DIR_PATH,
    STATIC_DIR_PATH: process.env.STATIC_DIR_PATH,
    
    // Docker and deployment
    DOCKER: parseBoolean(process.env.DOCKER, DEFAULT_VALUES.DOCKER),
    DEV: parseBoolean(process.env.DEV, DEFAULT_VALUES.DEV),
    
    // Performance settings
    CONCURRENCY: parseOptionalNumber(process.env.CONCURRENCY),
    VIDEO_CACHE_SIZE_IN_BYTES: parseOptionalNumber(process.env.VIDEO_CACHE_SIZE_IN_BYTES),
    
    // Whisper configuration
    WHISPER_MODEL: (process.env.WHISPER_MODEL as whisperModels) || DEFAULT_VALUES.WHISPER_MODEL,
    WHISPER_VERSION: process.env.WHISPER_VERSION || DEFAULT_VALUES.WHISPER_VERSION,
    WHISPER_VERBOSE: parseBoolean(process.env.WHISPER_VERBOSE, DEFAULT_VALUES.WHISPER_VERBOSE),
    
    // Kokoro TTS configuration
    KOKORO_MODEL_PRECISION: (process.env.KOKORO_MODEL_PRECISION as kokoroModelPrecision) || DEFAULT_VALUES.KOKORO_MODEL_PRECISION,
    KOKORO_MODEL_NAME: process.env.KOKORO_MODEL_NAME || DEFAULT_VALUES.KOKORO_MODEL_NAME,
    
    // Redis configuration
    REDIS_HOST: process.env.REDIS_HOST || DEFAULT_VALUES.REDIS_HOST,
    REDIS_PORT: parseNumber(process.env.REDIS_PORT, DEFAULT_VALUES.REDIS_PORT),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_DB: parseNumber(process.env.REDIS_DB, DEFAULT_VALUES.REDIS_DB),
    
    // TTS Provider configuration
    TTS_PROVIDER: (process.env.TTS_PROVIDER as EnvConfig['TTS_PROVIDER']) || DEFAULT_VALUES.TTS_PROVIDER,
    
    // GPU settings
    CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES,
    GPU_MEMORY_FRACTION: parseOptionalNumber(process.env.GPU_MEMORY_FRACTION),
    
    // Security settings
    JWT_SECRET: process.env.JWT_SECRET,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    
    // Monitoring and observability
    ENABLE_METRICS: parseBoolean(process.env.ENABLE_METRICS, DEFAULT_VALUES.ENABLE_METRICS),
    PROMETHEUS_PORT: parseOptionalNumber(process.env.PROMETHEUS_PORT),
    JAEGER_ENDPOINT: process.env.JAEGER_ENDPOINT,
  };
}

// Parse environment configuration
const envConfig = parseEnvConfig();

// Create the global logger with environment-based configuration
const versionNumber = process.env.npm_package_version;
export const logger = pino({
  level: envConfig.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    pid: process.pid,
    version: versionNumber,
    environment: envConfig.NODE_ENV,
    docker: envConfig.DOCKER,
  },
});

export class Config {
  private dataDirPath: string;
  private libsDirPath: string;
  private staticDirPath: string;

  public installationSuccessfulPath: string;
  public whisperInstallPath: string;
  public videosDirPath: string;
  public tempDirPath: string;
  public packageDirPath: string;
  public musicDirPath: string;
  
  // Environment-based configuration
  public readonly env = envConfig;
  
  // Legacy properties for backward compatibility
  public get pexelsApiKey(): string { return this.env.PEXELS_API_KEY; }
  public get logLevel(): pino.Level { return this.env.LOG_LEVEL; }
  public get whisperVerbose(): boolean { return this.env.WHISPER_VERBOSE; }
  public get port(): number { return this.env.PORT; }
  public get runningInDocker(): boolean { return this.env.DOCKER; }
  public get devMode(): boolean { return this.env.DEV; }
  public get whisperVersion(): string { return this.env.WHISPER_VERSION; }
  public get whisperModel(): whisperModels { return this.env.WHISPER_MODEL; }
  public get kokoroModelPrecision(): kokoroModelPrecision { return this.env.KOKORO_MODEL_PRECISION; }
  public get concurrency(): number | undefined { return this.env.CONCURRENCY; }
  public get videoCacheSizeInBytes(): number | null { return this.env.VIDEO_CACHE_SIZE_IN_BYTES || null; }
  public get redisHost(): string { return this.env.REDIS_HOST; }
  public get redisPort(): number { return this.env.REDIS_PORT; }
  public get redisPassword(): string | undefined { return this.env.REDIS_PASSWORD; }
  public get redisDb(): number { return this.env.REDIS_DB; }

  constructor() {
    // Initialize paths with environment-based configuration
    this.dataDirPath = this.env.DATA_DIR_PATH || 
      path.join(os.homedir(), ".ai-agents-az-video-generator");
    this.libsDirPath = path.join(this.dataDirPath, "libs");

    this.whisperInstallPath = path.join(this.libsDirPath, "whisper");
    this.videosDirPath = path.join(this.dataDirPath, "videos");
    this.tempDirPath = path.join(this.dataDirPath, "temp");
    this.installationSuccessfulPath = path.join(
      this.dataDirPath,
      "installation-successful",
    );

    // Ensure required directories exist
    this.ensureDirectories();

    // Set up static paths
    this.packageDirPath = path.join(__dirname, "..");
    this.staticDirPath = this.env.STATIC_DIR_PATH || 
      path.join(this.packageDirPath, "static");
    this.musicDirPath = path.join(this.staticDirPath, "music");
    
    // Log configuration summary
    this.logConfigSummary();
  }
  
  /**
   * Ensure all required directories exist
   */
  private ensureDirectories(): void {
    try {
      fs.ensureDirSync(this.dataDirPath);
      fs.ensureDirSync(this.libsDirPath);
      fs.ensureDirSync(this.videosDirPath);
      fs.ensureDirSync(this.tempDirPath);
      
      logger.debug({
        dataDirPath: this.dataDirPath,
        libsDirPath: this.libsDirPath,
        videosDirPath: this.videosDirPath,
        tempDirPath: this.tempDirPath,
      }, 'All required directories ensured');
    } catch (error) {
      logger.error({ error }, 'Failed to create required directories');
      throw new Error(`Failed to create required directories: ${error}`);
    }
  }
  
  /**
   * Log configuration summary for debugging
   */
  private logConfigSummary(): void {
    logger.info({
      environment: this.env.NODE_ENV,
      port: this.env.PORT,
      docker: this.env.DOCKER,
      devMode: this.env.DEV,
      whisperModel: this.env.WHISPER_MODEL,
      ttsProvider: this.env.TTS_PROVIDER,
      redisHost: this.env.REDIS_HOST,
      redisPort: this.env.REDIS_PORT,
      metricsEnabled: this.env.ENABLE_METRICS,
      dataDirPath: this.dataDirPath,
    }, 'Configuration initialized');
  }

  /**
   * Validate configuration and ensure all required values are present
   */
  public ensureConfig(): void {
    try {
      // Validate API keys based on TTS provider
      this.validateApiKeys();
      
      // Validate paths
      this.validatePaths();
      
      // Validate performance settings
      this.validatePerformanceSettings();
      
      logger.info('Configuration validation completed successfully');
    } catch (error) {
      logger.error({ error }, 'Configuration validation failed');
      throw error;
    }
  }
  
  /**
   * Validate API keys based on the selected TTS provider
   */
  private validateApiKeys(): void {
    // PEXELS API key is always required
    if (!this.env.PEXELS_API_KEY) {
      throw new Error(
        'PEXELS_API_KEY environment variable is missing. ' +
        'Get your free API key: https://www.pexels.com/api/key/ - ' +
        'See how to run the project: https://github.com/gyoridavid/short-video-maker'
      );
    }
    
    // Validate TTS provider specific API keys
    if (this.env.TTS_PROVIDER === 'elevenlabs' && !this.env.ELEVENLABS_API_KEY) {
      logger.warn('ElevenLabs API key not found, falling back to Kokoro TTS');
    }
    
    if (this.env.TTS_PROVIDER === 'openai' && !this.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not found, falling back to Kokoro TTS');
    }
  }
  
  /**
   * Validate file system paths
   */
  private validatePaths(): void {
    const pathsToCheck = {
      dataDirPath: this.dataDirPath,
      staticDirPath: this.staticDirPath,
    };
    
    for (const [name, pathToCheck] of Object.entries(pathsToCheck)) {
      if (!fs.existsSync(pathToCheck)) {
        logger.warn(`Path does not exist: ${name} = ${pathToCheck}`);
      }
    }
  }
  
  /**
   * Validate performance settings
   */
  private validatePerformanceSettings(): void {
    if (this.env.CONCURRENCY && this.env.CONCURRENCY < 1) {
      logger.warn('CONCURRENCY should be at least 1, using default');
    }
    
    if (this.env.VIDEO_CACHE_SIZE_IN_BYTES && this.env.VIDEO_CACHE_SIZE_IN_BYTES < 0) {
      logger.warn('VIDEO_CACHE_SIZE_IN_BYTES should be positive, using default');
    }
    
    if (this.env.GPU_MEMORY_FRACTION && (this.env.GPU_MEMORY_FRACTION < 0 || this.env.GPU_MEMORY_FRACTION > 1)) {
      logger.warn('GPU_MEMORY_FRACTION should be between 0 and 1');
    }
  }

  public getDataDirPath(): string {
    return this.dataDirPath;
  }
}

// Export the Kokoro model name from environment configuration
export const KOKORO_MODEL = envConfig.KOKORO_MODEL_NAME;

// Export environment configuration for use in other modules
export { envConfig };

/**
 * Get Redis connection configuration
 */
export function getRedisConfig() {
  return {
    host: envConfig.REDIS_HOST,
    port: envConfig.REDIS_PORT,
    password: envConfig.REDIS_PASSWORD,
    db: envConfig.REDIS_DB,
  };
}

/**
 * Get TTS provider configuration
 */
export function getTTSConfig() {
  return {
    provider: envConfig.TTS_PROVIDER,
    kokoroModel: envConfig.KOKORO_MODEL_NAME,
    kokoroPrecision: envConfig.KOKORO_MODEL_PRECISION,
    elevenLabsApiKey: envConfig.ELEVENLABS_API_KEY,
    openAiApiKey: envConfig.OPENAI_API_KEY,
  };
}

/**
 * Get monitoring configuration
 */
export function getMonitoringConfig() {
  return {
    enabled: envConfig.ENABLE_METRICS,
    prometheusPort: envConfig.PROMETHEUS_PORT,
    jaegerEndpoint: envConfig.JAEGER_ENDPOINT,
  };
}
