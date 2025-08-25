import { logger } from '../../config';

export interface TTSAudioResult {
  audio: ArrayBuffer;
  audioLength: number; // in seconds
  provider: string;
  voice: string;
  language: string;
  costEstimate?: number; // estimated cost in USD
  latency?: number; // processing time in milliseconds
  metadata?: Record<string, any>;
}

export interface TTSVoice {
  id: string;
  name: string;
  gender?: 'male' | 'female' | 'neutral';
  language: string;
  languageCode: string;
  style?: string;
  provider: string;
  quality?: 'standard' | 'premium' | 'neural';
  supportedStyles?: string[];
  sampleRate?: number;
}

export interface TTSProviderConfig {
  apiKey: string;
  baseUrl?: string;
  region?: string;
  timeout?: number;
  maxRetries?: number;
  costPerCharacter?: number;
  costPerSecond?: number;
  monthlyFreeLimit?: number;
}

export interface TTSRequest {
  text: string;
  voice: string;
  language?: string;
  speed?: number; // 0.5 to 2.0
  pitch?: number; // -20 to +20 semitones
  volume?: number; // 0 to 1.0
  format?: 'mp3' | 'wav' | 'ogg' | 'pcm';
  sampleRate?: 8000 | 16000 | 22050 | 44100 | 48000;
  bitrate?: number;
  ssml?: boolean;
  emotions?: Record<string, number>; // emotion intensity mapping
  style?: string; // voice style/emotion
}

export interface TTSProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  errorRate: number;
  lastCheck: Date;
  quotaRemaining?: number;
  costThisMonth?: number;
}

export interface TTSProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCharacters: number;
  totalAudioSeconds: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
}

export abstract class TTSProvider {
  protected config: TTSProviderConfig;
  protected metrics: TTSProviderMetrics;
  protected health: TTSProviderHealth;
  protected lastUsed: Date;

  constructor(protected providerName: string, config: TTSProviderConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      ...config
    };
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCharacters: 0,
      totalAudioSeconds: 0,
      totalCost: 0,
      averageLatency: 0,
      errorRate: 0
    };

    this.health = {
      status: 'healthy',
      latency: 0,
      errorRate: 0,
      lastCheck: new Date()
    };

    this.lastUsed = new Date();
  }

  abstract initialize(): Promise<void>;
  abstract generateSpeech(request: TTSRequest): Promise<TTSAudioResult>;
  abstract listVoices(language?: string): Promise<TTSVoice[]>;
  abstract validateCredentials(): Promise<boolean>;

  // Common methods with default implementations
  async healthCheck(): Promise<TTSProviderHealth> {
    try {
      const startTime = Date.now();
      await this.validateCredentials();
      const latency = Date.now() - startTime;

      this.health = {
        ...this.health,
        status: 'healthy',
        latency,
        lastCheck: new Date()
      };

      return this.health;
    } catch (error) {
      this.health = {
        ...this.health,
        status: 'unhealthy',
        latency: 0,
        errorRate: 1,
        lastCheck: new Date()
      };
      throw error;
    }
  }

  getMetrics(): TTSProviderMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCharacters: 0,
      totalAudioSeconds: 0,
      totalCost: 0,
      averageLatency: 0,
      errorRate: 0
    };
  }

  estimateCost(text: string, audioLength?: number): number {
    if (this.config.costPerCharacter) {
      return (text.length * this.config.costPerCharacter);
    }
    if (this.config.costPerSecond && audioLength) {
      return (audioLength * this.config.costPerSecond);
    }
    return 0;
  }

  protected updateMetrics(
    success: boolean, 
    textLength: number, 
    audioLength: number, 
    cost: number, 
    latency: number
  ): void {
    this.metrics.totalRequests++;
    this.metrics.totalCharacters += textLength;
    this.metrics.totalAudioSeconds += audioLength;
    this.metrics.totalCost += cost;

    if (success) {
      this.metrics.successfulRequests++;
      // Update average latency using moving average
      this.metrics.averageLatency = 
        (this.metrics.averageLatency * (this.metrics.successfulRequests - 1) + latency) / 
        this.metrics.successfulRequests;
    } else {
      this.metrics.failedRequests++;
    }

    this.metrics.errorRate = this.metrics.failedRequests / this.metrics.totalRequests;
    this.lastUsed = new Date();
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          { provider: this.providerName, operation: operationName, attempt },
          `Attempt ${attempt} failed for ${operationName}`
        );

        if (attempt === this.config.maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error(`Operation ${operationName} failed after ${this.config.maxRetries} attempts`);
  }

  // Utility methods for common TTS operations
  protected normalizeText(text: string, ssml: boolean = false): string {
    if (ssml) {
      // Basic SSML validation and normalization
      return text.trim();
    }
    
    // Normalize plain text - remove extra whitespace, handle special characters
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, '');
  }

  protected detectLanguage(text: string): string {
    // Enhanced language detection with better accuracy
    const cleanedText = text.trim().toLowerCase();
    
    if (cleanedText.length === 0) return 'en';
    
    // Character-based detection for non-Latin scripts
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'; // Chinese
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'; // Japanese
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'; // Korean
    if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabic
    if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Russian
    if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Hindi
    if (/[\u0E00-\u0E7F]/.test(text)) return 'th'; // Thai
    
    // Common word detection for Latin-based languages
    const commonWords: Record<string, string[]> = {
      en: ['the', 'and', 'is', 'are', 'was', 'were', 'this', 'that', 'with', 'for'],
      es: ['el', 'la', 'los', 'las', 'que', 'por', 'con', 'para', 'como', 'pero'],
      fr: ['le', 'la', 'les', 'des', 'une', 'est', 'pas', 'pour', 'dans', 'avec'],
      de: ['der', 'die', 'das', 'und', 'ist', 'sind', 'für', 'mit', 'auf', 'aus'],
      it: ['il', 'la', 'i', 'le', 'per', 'con', 'non', 'che', 'una', 'del'],
      pt: ['o', 'a', 'os', 'as', 'e', 'é', 'para', 'com', 'não', 'que'],
      nl: ['de', 'het', 'en', 'van', 'een', 'is', 'op', 'te', 'voor', 'met'],
    };
    
    // Count occurrences of common words for each language
    const wordCounts: Record<string, number> = {};
    const words = cleanedText.split(/\s+/);
    
    for (const [lang, common] of Object.entries(commonWords)) {
      wordCounts[lang] = words.filter(word => common.includes(word)).length;
    }
    
    // Find language with most common word matches
    let bestLang = 'en';
    let maxCount = 0;
    
    for (const [lang, count] of Object.entries(wordCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestLang = lang;
      }
    }
    
    // If we have a clear winner (at least 2 matches), use it
    if (maxCount >= 2) {
      return bestLang;
    }
    
    // Fallback: Check for language-specific patterns
    if (/^(bonjour|salut|merci|au revoir)/i.test(cleanedText)) return 'fr';
    if (/^(hola|gracias|adiós|buenos días)/i.test(cleanedText)) return 'es';
    if (/^(hallo|guten tag|danke|auf wiedersehen)/i.test(cleanedText)) return 'de';
    if (/^(ciao|grazie|arrivederci|buongiorno)/i.test(cleanedText)) return 'it';
    if (/^(olá|obrigado|adeus|bom dia)/i.test(cleanedText)) return 'pt';
    
    // Default to English
    return 'en';
  }

  /**
   * Detect multiple languages in mixed text
   */
  protected detectLanguages(text: string): string[] {
    const languages = new Set<string>();
    const segments = text.split(/[.!?]/).filter(segment => segment.trim().length > 0);
    
    for (const segment of segments) {
      const lang = this.detectLanguage(segment);
      languages.add(lang);
    }
    
    return Array.from(languages);
  }

  /**
   * Check if text contains multiple languages
   */
  protected isMultilingualText(text: string): boolean {
    const languages = this.detectLanguages(text);
    return languages.length > 1;
  }

  protected validateRequest(request: TTSRequest): void {
    if (!request.text || request.text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    if (request.text.length > 5000) {
      throw new Error('Text exceeds maximum length of 5000 characters');
    }

    if (!request.voice) {
      throw new Error('Voice must be specified');
    }

    if (request.speed && (request.speed < 0.5 || request.speed > 2.0)) {
      throw new Error('Speed must be between 0.5 and 2.0');
    }

    if (request.pitch && (request.pitch < -20 || request.pitch > 20)) {
      throw new Error('Pitch must be between -20 and +20 semitones');
    }

    if (request.volume && (request.volume < 0 || request.volume > 1)) {
      throw new Error('Volume must be between 0 and 1');
    }
  }

  // Circuit breaker pattern implementation
  protected shouldRetry(error: any): boolean {
    // Don't retry on client errors (4xx) except 429 (rate limit)
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return error.statusCode === 429; // Only retry rate limits
    }
    
    // Retry on network errors, timeouts, and server errors (5xx)
    return true;
  }

  getProviderInfo() {
    return {
      name: this.providerName,
      config: { ...this.config, apiKey: '***' }, // Mask API key
      metrics: this.metrics,
      health: this.health,
      lastUsed: this.lastUsed
    };
  }
}

// Factory for creating provider instances
export class TTSProviderFactory {
  static createProvider(
    providerType: 'elevenlabs' | 'openai' | 'azure' | 'google' | 'kokoro',
    config: TTSProviderConfig
  ): TTSProvider {
    switch (providerType) {
      case 'elevenlabs':
        return new ElevenLabsTTSProvider(config);
      case 'openai':
        return new OpenAITTSProvider(config);
      case 'azure':
        return new AzureTTSProvider(config);
      case 'google':
        return new GoogleTTSProvider(config);
      case 'kokoro':
        return new KokoroTTSProvider(config);
      default:
        throw new Error(`Unsupported TTS provider: ${providerType}`);
    }
  }
}

// ElevenLabs TTS Provider Implementation
export class ElevenLabsTTSProvider extends TTSProvider {
  private axios: any;

  constructor(config: TTSProviderConfig) {
    super('elevenlabs', config);
  }

  async initialize(): Promise<void> {
    const axios = (await import('axios')).default;
    this.axios = axios.create({
      baseURL: this.config.baseUrl || 'https://api.elevenlabs.io/v1',
      timeout: this.config.timeout || 30000,
      headers: {
        'xi-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
      },
    });

    logger.info({ provider: 'elevenlabs' }, 'Initializing ElevenLabs TTS provider');
  }

  async generateSpeech(request: TTSRequest): Promise<TTSAudioResult> {
    this.validateRequest(request);
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        return this.axios.post(`/text-to-speech/${request.voice}`, {
          text: this.normalizeText(request.text, request.ssml),
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: request.emotions?.excitement || 0.5,
            use_speaker_boost: true,
          },
          output_format: request.format || 'mp3_44100_128',
        }, {
          responseType: 'arraybuffer',
          headers: {
            'Accept': 'audio/mpeg',
          },
        });
      }, 'generateSpeech');

      const audioBuffer = response.data;
      const latency = Date.now() - startTime;
      const estimatedDuration = this.estimateAudioDuration(request.text);
      const costEstimate = this.estimateCost(request.text, estimatedDuration);

      this.updateMetrics(true, request.text.length, estimatedDuration, costEstimate, latency);

      return {
        audio: audioBuffer,
        audioLength: estimatedDuration,
        provider: this.providerName,
        voice: request.voice,
        language: request.language || this.detectLanguage(request.text),
        costEstimate,
        latency,
        metadata: {
          model: 'eleven_multilingual_v2',
          format: request.format || 'mp3_44100_128',
        },
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.updateMetrics(false, request.text.length, 0, 0, latency);
      
      logger.error({ provider: 'elevenlabs', error: error.message }, 'ElevenLabs TTS generation failed');
      
      if (error.response?.status === 401) {
        throw new Error('Invalid ElevenLabs API key');
      } else if (error.response?.status === 429) {
        throw new Error('ElevenLabs rate limit exceeded');
      } else if (error.response?.status === 422) {
        throw new Error('ElevenLabs validation error: ' + (error.response.data?.detail || 'Invalid request'));
      }
      
      throw new Error(`ElevenLabs TTS error: ${error.message}`);
    }
  }

  async listVoices(language?: string): Promise<TTSVoice[]> {
    try {
      const response = await this.axios.get('/voices');
      const voices = response.data.voices || [];

      return voices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        gender: this.inferGender(voice.name),
        language: voice.labels?.language || 'en',
        languageCode: voice.labels?.language_code || 'en-US',
        style: voice.labels?.description || voice.category,
        provider: this.providerName,
        quality: voice.category === 'premade' ? 'premium' : 'standard',
        supportedStyles: voice.labels?.use_case ? [voice.labels.use_case] : [],
        sampleRate: 44100,
      }));
    } catch (error: any) {
      logger.error({ provider: 'elevenlabs', error: error.message }, 'Failed to list ElevenLabs voices');
      throw new Error(`Failed to list ElevenLabs voices: ${error.message}`);
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await this.axios.get('/user');
      logger.debug({ provider: 'elevenlabs' }, 'ElevenLabs credentials validated successfully');
      return response.status === 200;
    } catch (error: any) {
      logger.error({ provider: 'elevenlabs', error: error.message }, 'ElevenLabs credential validation failed');
      return false;
    }
  }

  private estimateAudioDuration(text: string): number {
    // Estimate ~150 words per minute for average speech
    const wordCount = text.split(' ').length;
    return (wordCount / 150) * 60; // Convert to seconds
  }

  private inferGender(voiceName: string): 'male' | 'female' | 'neutral' {
    const femaleNames = ['bella', 'rachel', 'domi', 'elli', 'sarah', 'nicole', 'jessica', 'lily'];
    const maleNames = ['adam', 'arnold', 'antoni', 'josh', 'sam', 'daniel', 'ethan', 'callum'];
    
    const lowerName = voiceName.toLowerCase();
    if (femaleNames.some(name => lowerName.includes(name))) return 'female';
    if (maleNames.some(name => lowerName.includes(name))) return 'male';
    return 'neutral';
  }
}

export class OpenAITTSProvider extends TTSProvider {
  private axios: any;

  constructor(config: TTSProviderConfig) {
    super('openai', config);
  }

  async initialize(): Promise<void> {
    const axios = (await import('axios')).default;
    this.axios = axios.create({
      baseURL: this.config.baseUrl || 'https://api.openai.com/v1',
      timeout: this.config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    logger.info({ provider: 'openai' }, 'Initializing OpenAI TTS provider');
  }

  async generateSpeech(request: TTSRequest): Promise<TTSAudioResult> {
    this.validateRequest(request);
    const startTime = Date.now();

    // OpenAI TTS has a 4096 character limit
    if (request.text.length > 4096) {
      throw new Error('OpenAI TTS has a maximum limit of 4096 characters');
    }

    try {
      const response = await this.withRetry(async () => {
        return this.axios.post('/audio/speech', {
          model: 'tts-1-hd', // or 'tts-1' for faster, lower quality
          input: this.normalizeText(request.text, request.ssml),
          voice: request.voice || 'alloy',
          response_format: request.format || 'mp3',
          speed: Math.max(0.25, Math.min(4.0, request.speed || 1.0)), // OpenAI supports 0.25 to 4.0
        }, {
          responseType: 'arraybuffer',
          headers: {
            'Accept': 'audio/mpeg',
          },
        });
      }, 'generateSpeech');

      const audioBuffer = response.data;
      const latency = Date.now() - startTime;
      const estimatedDuration = this.estimateAudioDuration(request.text);
      const costEstimate = this.estimateCost(request.text, estimatedDuration);

      this.updateMetrics(true, request.text.length, estimatedDuration, costEstimate, latency);

      return {
        audio: audioBuffer,
        audioLength: estimatedDuration,
        provider: this.providerName,
        voice: request.voice || 'alloy',
        language: request.language || this.detectLanguage(request.text),
        costEstimate,
        latency,
        metadata: {
          model: 'tts-1-hd',
          format: request.format || 'mp3',
        },
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.updateMetrics(false, request.text.length, 0, 0, latency);
      
      logger.error({ provider: 'openai', error: error.message }, 'OpenAI TTS generation failed');
      
      if (error.response?.status === 401) {
        throw new Error('Invalid OpenAI API key');
      } else if (error.response?.status === 429) {
        throw new Error('OpenAI rate limit exceeded');
      } else if (error.response?.status === 400) {
        throw new Error('OpenAI validation error: ' + (error.response.data?.error?.message || 'Invalid request'));
      }
      
      throw new Error(`OpenAI TTS error: ${error.message}`);
    }
  }

  async listVoices(language?: string): Promise<TTSVoice[]> {
    // OpenAI has 6 built-in voices
    const voices = [
      {
        id: 'alloy',
        name: 'Alloy',
        gender: 'neutral' as const,
        language: 'multi',
        languageCode: 'multi',
        style: 'neutral',
        provider: this.providerName,
        quality: 'neural' as const,
        supportedStyles: ['neutral'],
        sampleRate: 24000,
      },
      {
        id: 'echo',
        name: 'Echo',
        gender: 'male' as const,
        language: 'multi',
        languageCode: 'multi',
        style: 'warm',
        provider: this.providerName,
        quality: 'neural' as const,
        supportedStyles: ['warm'],
        sampleRate: 24000,
      },
      {
        id: 'fable',
        name: 'Fable',
        gender: 'neutral' as const,
        language: 'multi',
        languageCode: 'multi',
        style: 'expressive',
        provider: this.providerName,
        quality: 'neural' as const,
        supportedStyles: ['expressive'],
        sampleRate: 24000,
      },
      {
        id: 'onyx',
        name: 'Onyx',
        gender: 'male' as const,
        language: 'multi',
        languageCode: 'multi',
        style: 'deep',
        provider: this.providerName,
        quality: 'neural' as const,
        supportedStyles: ['deep'],
        sampleRate: 24000,
      },
      {
        id: 'nova',
        name: 'Nova',
        gender: 'female' as const,
        language: 'multi',
        languageCode: 'multi',
        style: 'bright',
        provider: this.providerName,
        quality: 'neural' as const,
        supportedStyles: ['bright'],
        sampleRate: 24000,
      },
      {
        id: 'shimmer',
        name: 'Shimmer',
        gender: 'female' as const,
        language: 'multi',
        languageCode: 'multi',
        style: 'gentle',
        provider: this.providerName,
        quality: 'neural' as const,
        supportedStyles: ['gentle'],
        sampleRate: 24000,
      },
    ];

    return voices;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // Test with a simple models endpoint call
      const response = await this.axios.get('/models');
      logger.debug({ provider: 'openai' }, 'OpenAI credentials validated successfully');
      return response.status === 200;
    } catch (error: any) {
      logger.error({ provider: 'openai', error: error.message }, 'OpenAI credential validation failed');
      return false;
    }
  }

  private estimateAudioDuration(text: string): number {
    // Estimate ~150 words per minute for average speech
    const wordCount = text.split(' ').length;
    return (wordCount / 150) * 60; // Convert to seconds
  }
}

export class AzureTTSProvider extends TTSProvider {
  private axios: any;
  private region: string;

  constructor(config: TTSProviderConfig) {
    super('azure', config);
    this.region = config.region || 'eastus';
  }

  async initialize(): Promise<void> {
    const axios = (await import('axios')).default;
    this.axios = axios.create({
      timeout: this.config.timeout || 30000,
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
    });

    logger.info({ provider: 'azure', region: this.region }, 'Initializing Azure TTS provider');
  }

  async generateSpeech(request: TTSRequest): Promise<TTSAudioResult> {
    this.validateRequest(request);
    const startTime = Date.now();

    try {
      // Get access token first
      const tokenResponse = await this.axios.post(
        `https://${this.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        null,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.config.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const accessToken = tokenResponse.data;

      // Create SSML
      const ssmlText = this.createSSML(request);

      const response = await this.withRetry(async () => {
        return this.axios.post(
          `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
          ssmlText,
          {
            responseType: 'arraybuffer',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': this.getAudioFormat(request.format),
              'User-Agent': 'short-video-maker-tts',
            },
          }
        );
      }, 'generateSpeech');

      const audioBuffer = response.data;
      const latency = Date.now() - startTime;
      const estimatedDuration = this.estimateAudioDuration(request.text);
      const costEstimate = this.estimateCost(request.text, estimatedDuration);

      this.updateMetrics(true, request.text.length, estimatedDuration, costEstimate, latency);

      return {
        audio: audioBuffer,
        audioLength: estimatedDuration,
        provider: this.providerName,
        voice: request.voice,
        language: request.language || this.detectLanguage(request.text),
        costEstimate,
        latency,
        metadata: {
          region: this.region,
          format: this.getAudioFormat(request.format),
        },
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.updateMetrics(false, request.text.length, 0, 0, latency);
      
      logger.error({ provider: 'azure', error: error.message }, 'Azure TTS generation failed');
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Azure Speech Services subscription key');
      } else if (error.response?.status === 429) {
        throw new Error('Azure Speech Services rate limit exceeded');
      } else if (error.response?.status === 400) {
        throw new Error('Azure TTS validation error: ' + (error.response.data || 'Invalid request'));
      }
      
      throw new Error(`Azure TTS error: ${error.message}`);
    }
  }

  async listVoices(language?: string): Promise<TTSVoice[]> {
    try {
      const response = await this.axios.get(
        `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.config.apiKey,
          },
        }
      );

      const voices = response.data || [];
      let filteredVoices = voices;

      if (language) {
        filteredVoices = voices.filter((voice: any) => 
          voice.Locale.toLowerCase().startsWith(language.toLowerCase())
        );
      }

      return filteredVoices.map((voice: any) => ({
        id: voice.ShortName,
        name: voice.DisplayName,
        gender: voice.Gender?.toLowerCase() || 'neutral',
        language: voice.Locale,
        languageCode: voice.Locale,
        style: voice.StyleList?.[0] || 'general',
        provider: this.providerName,
        quality: voice.VoiceType === 'Neural' ? 'neural' : 'standard',
        supportedStyles: voice.StyleList || ['general'],
        sampleRate: 24000,
      }));
    } catch (error: any) {
      logger.error({ provider: 'azure', error: error.message }, 'Failed to list Azure voices');
      throw new Error(`Failed to list Azure voices: ${error.message}`);
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await this.axios.get(
        `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.config.apiKey,
          },
        }
      );
      logger.debug({ provider: 'azure' }, 'Azure credentials validated successfully');
      return response.status === 200;
    } catch (error: any) {
      logger.error({ provider: 'azure', error: error.message }, 'Azure credential validation failed');
      return false;
    }
  }

  private createSSML(request: TTSRequest): string {
    const language = request.language || this.detectLanguage(request.text);
    const voice = request.voice || 'en-US-JennyNeural';
    
    let ssml = `<speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="${language}">`;
    ssml += `<voice name="${voice}">`;
    
    // Add prosody controls if specified
    if (request.speed || request.pitch || request.volume) {
      ssml += '<prosody';
      if (request.speed) {
        const rate = request.speed < 1 ? 'slow' : request.speed > 1 ? 'fast' : 'medium';
        ssml += ` rate="${rate}"`;
      }
      if (request.pitch) {
        const pitch = request.pitch > 0 ? `+${request.pitch}Hz` : `${request.pitch}Hz`;
        ssml += ` pitch="${pitch}"`;
      }
      if (request.volume) {
        const volume = request.volume < 0.5 ? 'soft' : request.volume > 0.8 ? 'loud' : 'medium';
        ssml += ` volume="${volume}"`;
      }
      ssml += '>';
    }
    
    ssml += this.normalizeText(request.text, request.ssml);
    
    if (request.speed || request.pitch || request.volume) {
      ssml += '</prosody>';
    }
    
    ssml += '</voice></speak>';
    
    return ssml;
  }

  private getAudioFormat(format?: string): string {
    switch (format) {
      case 'wav':
        return 'riff-24khz-16bit-mono-pcm';
      case 'ogg':
        return 'ogg-24khz-16bit-mono-opus';
      case 'mp3':
      default:
        return 'audio-24khz-48kbitrate-mono-mp3';
    }
  }

  private estimateAudioDuration(text: string): number {
    // Estimate ~150 words per minute for average speech
    const wordCount = text.split(' ').length;
    return (wordCount / 150) * 60; // Convert to seconds
  }
}

export class GoogleTTSProvider extends TTSProvider {
  private axios: any;

  constructor(config: TTSProviderConfig) {
    super('google', config);
  }

  async initialize(): Promise<void> {
    const axios = (await import('axios')).default;
    this.axios = axios.create({
      baseURL: 'https://texttospeech.googleapis.com/v1',
      timeout: this.config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    logger.info({ provider: 'google' }, 'Initializing Google TTS provider');
  }

  async generateSpeech(request: TTSRequest): Promise<TTSAudioResult> {
    this.validateRequest(request);
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        return this.axios.post('/text:synthesize', {
          input: { text: this.normalizeText(request.text, request.ssml) },
          voice: {
            name: request.voice,
            languageCode: request.language || this.detectLanguage(request.text),
            ssmlGender: 'NEUTRAL',
          },
          audioConfig: {
            audioEncoding: this.getAudioEncoding(request.format),
            speakingRate: request.speed || 1.0,
            pitch: request.pitch || 0,
            volumeGainDb: request.volume ? (request.volume - 0.5) * 20 : 0,
            sampleRateHertz: request.sampleRate || 24000,
          },
        });
      }, 'generateSpeech');

      const audioContent = response.data.audioContent;
      const audioBuffer = Buffer.from(audioContent, 'base64').buffer;
      const latency = Date.now() - startTime;
      const estimatedDuration = this.estimateAudioDuration(request.text);
      const costEstimate = this.estimateCost(request.text, estimatedDuration);

      this.updateMetrics(true, request.text.length, estimatedDuration, costEstimate, latency);

      return {
        audio: audioBuffer,
        audioLength: estimatedDuration,
        provider: this.providerName,
        voice: request.voice,
        language: request.language || this.detectLanguage(request.text),
        costEstimate,
        latency,
        metadata: {
          encoding: this.getAudioEncoding(request.format),
          sampleRate: request.sampleRate || 24000,
        },
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.updateMetrics(false, request.text.length, 0, 0, latency);
      
      logger.error({ provider: 'google', error: error.message }, 'Google TTS generation failed');
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Google TTS API key');
      } else if (error.response?.status === 429) {
        throw new Error('Google TTS rate limit exceeded');
      } else if (error.response?.status === 400) {
        throw new Error('Google TTS validation error: ' + (error.response.data?.error?.message || 'Invalid request'));
      }
      
      throw new Error(`Google TTS error: ${error.message}`);
    }
  }

  async listVoices(language?: string): Promise<TTSVoice[]> {
    try {
      const response = await this.axios.get('/voices', {
        params: language ? { languageCode: language } : {},
      });

      const voices = response.data.voices || [];

      return voices.map((voice: any) => ({
        id: voice.name,
        name: voice.name.split('-').pop(), // Extract voice name
        gender: voice.ssmlGender?.toLowerCase() || 'neutral',
        language: voice.languageCodes?.[0] || 'en',
        languageCode: voice.languageCodes?.[0] || 'en-US',
        style: voice.name.includes('Wavenet') ? 'wavenet' : voice.name.includes('Neural2') ? 'neural' : 'standard',
        provider: this.providerName,
        quality: voice.name.includes('Wavenet') || voice.name.includes('Neural2') ? 'neural' : 'standard',
        supportedStyles: ['general'],
        sampleRate: 24000,
      }));
    } catch (error: any) {
      logger.error({ provider: 'google', error: error.message }, 'Failed to list Google voices');
      throw new Error(`Failed to list Google voices: ${error.message}`);
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await this.axios.get('/voices');
      logger.debug({ provider: 'google' }, 'Google credentials validated successfully');
      return response.status === 200;
    } catch (error: any) {
      logger.error({ provider: 'google', error: error.message }, 'Google credential validation failed');
      return false;
    }
  }

  private getAudioEncoding(format?: string): string {
    switch (format) {
      case 'wav':
        return 'LINEAR16';
      case 'ogg':
        return 'OGG_OPUS';
      case 'mp3':
      default:
        return 'MP3';
    }
  }

  private estimateAudioDuration(text: string): number {
    const wordCount = text.split(' ').length;
    return (wordCount / 150) * 60;
  }
}

export class KokoroTTSProvider extends TTSProvider {
  private axios: any;

  constructor(config: TTSProviderConfig) {
    super('kokoro', config);
  }

  async initialize(): Promise<void> {
    const axios = (await import('axios')).default;
    this.axios = axios.create({
      baseURL: this.config.baseUrl || 'https://api.kokoro.io/v1',
      timeout: this.config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    logger.info({ provider: 'kokoro' }, 'Initializing Kokoro TTS provider');
  }

  async generateSpeech(request: TTSRequest): Promise<TTSAudioResult> {
    this.validateRequest(request);
    const startTime = Date.now();

    try {
      const response = await this.withRetry(async () => {
        return this.axios.post('/synthesize', {
          text: this.normalizeText(request.text, request.ssml),
          voice: request.voice || 'default',
          format: request.format || 'mp3',
          speed: request.speed || 1.0,
        }, {
          responseType: 'arraybuffer',
        });
      }, 'generateSpeech');

      const audioBuffer = response.data;
      const latency = Date.now() - startTime;
      const estimatedDuration = this.estimateAudioDuration(request.text);
      const costEstimate = this.estimateCost(request.text, estimatedDuration);

      this.updateMetrics(true, request.text.length, estimatedDuration, costEstimate, latency);

      return {
        audio: audioBuffer,
        audioLength: estimatedDuration,
        provider: this.providerName,
        voice: request.voice || 'default',
        language: request.language || 'en',
        costEstimate,
        latency,
        metadata: {
          format: request.format || 'mp3',
        },
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.updateMetrics(false, request.text.length, 0, 0, latency);
      
      logger.error({ provider: 'kokoro', error: error.message }, 'Kokoro TTS generation failed');
      throw new Error(`Kokoro TTS error: ${error.message}`);
    }
  }

  async listVoices(language?: string): Promise<TTSVoice[]> {
    // Simple implementation for Kokoro
    return [
      {
        id: 'default',
        name: 'Default Voice',
        gender: 'neutral' as const,
        language: 'en',
        languageCode: 'en-US',
        style: 'neutral',
        provider: this.providerName,
        quality: 'standard' as const,
        supportedStyles: ['neutral'],
        sampleRate: 22050,
      },
    ];
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // Simple health check for Kokoro
      const response = await this.axios.get('/health');
      logger.debug({ provider: 'kokoro' }, 'Kokoro credentials validated successfully');
      return response.status === 200;
    } catch (error: any) {
      logger.warn({ provider: 'kokoro', error: error.message }, 'Kokoro credential validation failed, but continuing as fallback');
      return true; // Allow Kokoro as fallback even if health check fails
    }
  }

  private estimateAudioDuration(text: string): number {
    const wordCount = text.split(' ').length;
    return (wordCount / 150) * 60;
  }
}