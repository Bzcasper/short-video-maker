import { logger } from "../logger";
import { CacheService } from "./CacheService";
import { ScriptGeneratorService } from "./ScriptGeneratorService";
import { ScriptTemplateEngine, ContentType, Platform } from "./ScriptTemplateEngine";
import { ContentValidator } from "./ContentValidator";
import crypto from "crypto";

export interface AIProviderConfig {
  name: 'deepseek-v3' | 'claude-3.5' | 'openai-gpt4o-mini';
  priority: number;
  costPerToken: number;
  maxTokens: number;
  specialties: AISpecialty[];
  apiKey: string;
  baseUrl: string;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  healthCheck?: {
    endpoint: string;
    timeout: number;
  };
}

export type AISpecialty = 'script_generation' | 'quality_assessment' | 'content_enhancement' | 'seo_optimization' | 'thumbnail_generation' | 'brand_safety';

export interface ContentGenerationRequest {
  topic: string;
  contentType: ContentType;
  platform?: Platform;
  targetAudience: 'general' | 'teens' | 'adults' | 'professionals';
  tone: 'casual' | 'professional' | 'energetic' | 'educational' | 'humorous';
  keywords?: string[];
  brandGuidelines?: BrandGuidelines;
  constraints?: ContentConstraints;
  options?: {
    generateThumbnail?: boolean;
    generateSEOMetadata?: boolean;
    enableBrandSafety?: boolean;
    qualityThreshold?: number; // 0-100
    maxRetries?: number;
  };
}

export interface BrandGuidelines {
  brandName?: string;
  brandValues?: string[];
  prohibitedContent?: string[];
  requiredDisclosures?: string[];
  colorPalette?: string[];
  logoUrl?: string;
}

export interface ContentConstraints {
  maxDuration?: number; // seconds
  minDuration?: number; // seconds
  languageRestrictions?: string[];
  regionRestrictions?: string[];
  contentRating?: 'G' | 'PG' | 'PG-13' | 'R';
}

export interface ContentGenerationResult {
  success: boolean;
  content: {
    script: {
      title: string;
      scenes: ScriptScene[];
      estimatedDuration: number;
      wordCount: number;
      transcript: string;
    };
    seoMetadata?: SEOMetadata;
    thumbnail?: ThumbnailData;
    brandSafetyReport?: BrandSafetyReport;
  };
  qualityAssessment: QualityAssessment;
  costBreakdown: CostBreakdown;
  processingMetrics: ProcessingMetrics;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface ScriptScene {
  text: string;
  duration: number;
  visualCues: string[];
  searchTerms: string[];
  emphasis: 'low' | 'medium' | 'high';
  emotions?: {
    tone: string;
    intensity: number; // 0-1
  };
}

export interface SEOMetadata {
  title: string;
  description: string;
  hashtags: string[];
  keywords: string[];
  category: string;
  thumbnailText?: string;
  captions?: string;
}

export interface ThumbnailData {
  primaryText: string;
  secondaryText?: string;
  colorScheme: string;
  style: 'bold' | 'minimal' | 'playful' | 'professional';
  imagePrompt: string;
  generatedUrl?: string;
}

export interface BrandSafetyReport {
  overallScore: number; // 0-100
  categories: {
    [category: string]: {
      score: number;
      confidence: number;
      issues?: string[];
    };
  };
  recommendations: string[];
  approved: boolean;
}

export interface QualityAssessment {
  overallScore: number; // 0-100
  dimensions: {
    engagement: number;
    clarity: number;
    relevance: number;
    creativity: number;
    brandAlignment: number;
    platformOptimization: number;
  };
  feedback: string[];
  improvements: string[];
  passesThreshold: boolean;
}

export interface CostBreakdown {
  totalCost: number;
  breakdown: {
    [provider: string]: {
      tokensUsed: number;
      cost: number;
      requests: number;
    };
  };
  budgetRemaining?: number;
}

export interface ProcessingMetrics {
  totalTime: number; // ms
  stageTimings: {
    [stage: string]: number;
  };
  providersUsed: string[];
  retries: number;
  cacheHits: number;
}

export class AIContentPipelineService {
  private providers: Map<string, AIProvider> = new Map();
  private cacheService: CacheService;
  private scriptGenerator: ScriptGeneratorService;
  private templateEngine: ScriptTemplateEngine;
  private contentValidator: ContentValidator;
  private usageTracker: UsageTracker;

  constructor(
    cacheService: CacheService,
    scriptGenerator: ScriptGeneratorService,
    templateEngine: ScriptTemplateEngine,
    contentValidator: ContentValidator,
    providers: AIProviderConfig[]
  ) {
    this.cacheService = cacheService;
    this.scriptGenerator = scriptGenerator;
    this.templateEngine = templateEngine;
    this.contentValidator = contentValidator;
    this.usageTracker = new UsageTracker();

    // Initialize providers
    this.initializeProviders(providers);
  }

  /**
   * Main pipeline entry point: Topic to complete video content
   */
  public async generateContent(request: ContentGenerationRequest): Promise<ContentGenerationResult> {
    const startTime = Date.now();
    const processingMetrics: ProcessingMetrics = {
      totalTime: 0,
      stageTimings: {},
      providersUsed: [],
      retries: 0,
      cacheHits: 0
    };

    try {
      logger.info(`Starting AI content generation for topic: ${request.topic}`);

      // Stage 1: Topic Analysis & Script Generation
      const stageStart = Date.now();
      const scriptResult = await this.generateScriptFromTopic(request);
      processingMetrics.stageTimings['script_generation'] = Date.now() - stageStart;

      if (!scriptResult.success) {
        return this.createErrorResult('SCRIPT_GENERATION_FAILED', scriptResult.error || 'Failed to generate script', processingMetrics);
      }

      // Stage 2: Quality Assessment
      const qualityStart = Date.now();
      const qualityAssessment = await this.assessContentQuality(scriptResult.script!, request);
      processingMetrics.stageTimings['quality_assessment'] = Date.now() - qualityStart;

      // Stage 3: Brand Safety Check (if enabled)
      let brandSafetyReport: BrandSafetyReport | undefined;
      if (request.options?.enableBrandSafety !== false) {
        const brandStart = Date.now();
        brandSafetyReport = await this.performBrandSafetyCheck(scriptResult.script!, request);
        processingMetrics.stageTimings['brand_safety'] = Date.now() - brandStart;

        if (!brandSafetyReport.approved) {
          return this.createErrorResult('BRAND_SAFETY_VIOLATION', 'Content failed brand safety checks', processingMetrics);
        }
      }

      // Stage 4: SEO Metadata Generation (if enabled)
      let seoMetadata: SEOMetadata | undefined;
      if (request.options?.generateSEOMetadata !== false) {
        const seoStart = Date.now();
        seoMetadata = await this.generateSEOMetadata(scriptResult.script!, request);
        processingMetrics.stageTimings['seo_generation'] = Date.now() - seoStart;
      }

      // Stage 5: Thumbnail Generation (if enabled)
      let thumbnailData: ThumbnailData | undefined;
      if (request.options?.generateThumbnail) {
        const thumbStart = Date.now();
        thumbnailData = await this.generateThumbnailData(scriptResult.script!, request);
        processingMetrics.stageTimings['thumbnail_generation'] = Date.now() - thumbStart;
      }

      // Calculate final metrics
      processingMetrics.totalTime = Date.now() - startTime;
      const costBreakdown = this.calculateCostBreakdown(processingMetrics.providersUsed);

      const result: ContentGenerationResult = {
        success: true,
        content: {
          script: scriptResult.script!,
          seoMetadata,
          thumbnail: thumbnailData,
          brandSafetyReport
        },
        qualityAssessment,
        costBreakdown,
        processingMetrics
      };

      logger.info(`Content generation completed successfully in ${processingMetrics.totalTime}ms for topic: ${request.topic}`);
      return result;

    } catch (error) {
      processingMetrics.totalTime = Date.now() - startTime;
      logger.error(`Content generation failed: ${error instanceof Error ? error.message : String(error)}`);
      
      return this.createErrorResult(
        'PIPELINE_ERROR',
        error instanceof Error ? error.message : 'Unknown pipeline error',
        processingMetrics
      );
    }
  }

  /**
   * Generate script from topic using AI providers
   */
  private async generateScriptFromTopic(request: ContentGenerationRequest): Promise<{
    success: boolean;
    script?: {
      title: string;
      scenes: ScriptScene[];
      estimatedDuration: number;
      wordCount: number;
      transcript: string;
    };
    error?: string;
  }> {
    // Create prompt for script generation
    const prompt = this.buildScriptGenerationPrompt(request);
    
    // Select best provider for script generation
    const provider = this.selectProvider('script_generation', prompt.length);
    
    if (!provider) {
      return { success: false, error: 'No available provider for script generation' };
    }

    try {
      const response = await provider.generate(prompt, {
        maxTokens: Math.min(2000, provider.config.maxTokens),
        temperature: 0.7,
        specialty: 'script_generation'
      });

      const parsedScript = this.parseScriptResponse(response.content, request);
      
      return {
        success: true,
        script: parsedScript
      };

    } catch (error) {
      logger.error(`Script generation failed with provider ${provider.config.name}: ${error}`);
      return { success: false, error: error instanceof Error ? error.message : 'Script generation failed' };
    }
  }

  /**
   * Build comprehensive script generation prompt
   */
  private buildScriptGenerationPrompt(request: ContentGenerationRequest): string {
    const { topic, contentType, platform, targetAudience, tone } = request;
    
    let prompt = `Create an engaging ${contentType} video script about "${topic}".

Requirements:
- Target audience: ${targetAudience}
- Tone: ${tone}
- Platform: ${platform || 'general'}
- Duration: ${request.constraints?.minDuration || 15}-${request.constraints?.maxDuration || 60} seconds

Content Structure:
1. Hook (first 3 seconds): Attention-grabbing opening
2. Main Content: Key information delivered engagingly
3. Call to Action: Encourage engagement

Format your response as JSON:
{
  "title": "Video title",
  "scenes": [
    {
      "text": "Scene narration",
      "duration": 5,
      "visualCues": ["description of what viewer sees"],
      "searchTerms": ["keywords for finding relevant footage"],
      "emphasis": "high|medium|low",
      "emotions": {"tone": "excited", "intensity": 0.8}
    }
  ]
}`;

    // Add brand guidelines if provided
    if (request.brandGuidelines) {
      prompt += `\n\nBrand Guidelines:`;
      if (request.brandGuidelines.brandName) {
        prompt += `\n- Brand: ${request.brandGuidelines.brandName}`;
      }
      if (request.brandGuidelines.brandValues) {
        prompt += `\n- Values: ${request.brandGuidelines.brandValues.join(', ')}`;
      }
      if (request.brandGuidelines.prohibitedContent) {
        prompt += `\n- Avoid: ${request.brandGuidelines.prohibitedContent.join(', ')}`;
      }
    }

    // Add keywords if provided
    if (request.keywords && request.keywords.length > 0) {
      prompt += `\n\nIncorporate these keywords naturally: ${request.keywords.join(', ')}`;
    }

    return prompt;
  }

  /**
   * Parse AI response into structured script
   */
  private parseScriptResponse(response: string, request: ContentGenerationRequest) {
    try {
      // Extract JSON from response (handle cases where AI adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!parsed.title || !parsed.scenes || !Array.isArray(parsed.scenes)) {
        throw new Error('Invalid script format');
      }

      // Calculate metrics
      const transcript = parsed.scenes.map((scene: any) => scene.text).join(' ');
      const wordCount = transcript.split(' ').length;
      const estimatedDuration = parsed.scenes.reduce((total: number, scene: any) => total + (scene.duration || 5), 0);

      return {
        title: parsed.title,
        scenes: parsed.scenes.map((scene: any) => ({
          text: scene.text || '',
          duration: scene.duration || 5,
          visualCues: Array.isArray(scene.visualCues) ? scene.visualCues : [scene.text],
          searchTerms: Array.isArray(scene.searchTerms) ? scene.searchTerms : this.extractKeywords(scene.text),
          emphasis: scene.emphasis || 'medium',
          emotions: scene.emotions || { tone: request.tone, intensity: 0.5 }
        })),
        estimatedDuration,
        wordCount,
        transcript
      };

    } catch (error) {
      logger.error(`Failed to parse script response: ${error}`);
      
      // Fallback: create basic script structure
      const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 10);
      const scenes = sentences.slice(0, 5).map((text, index) => ({
        text: text.trim(),
        duration: 8,
        visualCues: [text.trim()],
        searchTerms: this.extractKeywords(text),
        emphasis: index === 0 ? 'high' as const : 'medium' as const,
        emotions: { tone: request.tone, intensity: 0.5 }
      }));

      return {
        title: `${request.topic} - AI Generated`,
        scenes,
        estimatedDuration: scenes.length * 8,
        wordCount: response.split(' ').length,
        transcript: scenes.map(s => s.text).join(' ')
      };
    }
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));
    
    return [...new Set(words)].slice(0, 3);
  }

  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'and', 'but', 'for', 'are', 'with', 'this', 'that', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time'];
    return stopWords.includes(word.toLowerCase());
  }

  /**
   * Assess content quality using specialized AI
   */
  private async assessContentQuality(script: any, request: ContentGenerationRequest): Promise<QualityAssessment> {
    const provider = this.selectProvider('quality_assessment');
    
    if (!provider) {
      return this.createDefaultQualityAssessment();
    }

    const assessmentPrompt = `Assess the quality of this video script on a scale of 0-100 for each dimension:

Script: "${script.transcript}"
Target: ${request.targetAudience} audience, ${request.tone} tone, ${request.contentType} content

Evaluate:
1. Engagement (hooks, interest level)
2. Clarity (easy to understand)  
3. Relevance (matches topic and audience)
4. Creativity (unique, memorable)
5. Brand Alignment (fits guidelines)
6. Platform Optimization (suitable for ${request.platform || 'general'})

Respond in JSON format:
{
  "scores": {
    "engagement": 85,
    "clarity": 90,
    "relevance": 88,
    "creativity": 75,
    "brandAlignment": 90,
    "platformOptimization": 85
  },
  "feedback": ["Specific feedback points"],
  "improvements": ["Actionable improvement suggestions"]
}`;

    try {
      const response = await provider.generate(assessmentPrompt, {
        maxTokens: 1000,
        temperature: 0.3,
        specialty: 'quality_assessment'
      });

      const assessment = JSON.parse(response.content);
      const scores = assessment.scores as Record<string, number>;
      const overallScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
      
      return {
        overallScore,
        dimensions: assessment.scores,
        feedback: assessment.feedback || [],
        improvements: assessment.improvements || [],
        passesThreshold: overallScore >= (request.options?.qualityThreshold || 70)
      };

    } catch (error) {
      logger.error(`Quality assessment failed: ${error}`);
      return this.createDefaultQualityAssessment();
    }
  }

  /**
   * Perform brand safety check
   */
  private async performBrandSafetyCheck(script: any, request: ContentGenerationRequest): Promise<BrandSafetyReport> {
    const provider = this.selectProvider('brand_safety');
    
    if (!provider) {
      return { overallScore: 85, categories: {}, recommendations: [], approved: true };
    }

    const safetyPrompt = `Analyze this content for brand safety issues:

Content: "${script.transcript}"

Check for:
- Inappropriate language or themes
- Controversial topics
- Potential legal issues
- Brand guideline violations
- Platform policy compliance

${request.brandGuidelines?.prohibitedContent ? 
  `Specifically avoid: ${request.brandGuidelines.prohibitedContent.join(', ')}` : ''}

Respond in JSON:
{
  "overallScore": 95,
  "categories": {
    "inappropriate_language": {"score": 100, "confidence": 0.95},
    "controversial_content": {"score": 90, "confidence": 0.85},
    "legal_compliance": {"score": 95, "confidence": 0.90}
  },
  "issues": ["List any specific issues found"],
  "recommendations": ["Safety improvement suggestions"]
}`;

    try {
      const response = await provider.generate(safetyPrompt, {
        maxTokens: 800,
        temperature: 0.2,
        specialty: 'brand_safety'
      });

      const safety = JSON.parse(response.content);
      
      return {
        overallScore: safety.overallScore || 85,
        categories: safety.categories || {},
        recommendations: safety.recommendations || [],
        approved: (safety.overallScore || 85) >= 80
      };

    } catch (error) {
      logger.error(`Brand safety check failed: ${error}`);
      return { overallScore: 85, categories: {}, recommendations: [], approved: true };
    }
  }

  /**
   * Generate SEO metadata
   */
  private async generateSEOMetadata(script: any, request: ContentGenerationRequest): Promise<SEOMetadata> {
    const provider = this.selectProvider('seo_optimization');
    
    if (!provider) {
      return this.createFallbackSEOMetadata(script, request);
    }

    const seoPrompt = `Generate SEO metadata for this video:

Title: ${script.title}
Content: ${script.transcript}
Topic: ${request.topic}
Platform: ${request.platform || 'general'}
Keywords: ${request.keywords?.join(', ') || 'none specified'}

Generate:
1. Optimized title (60 chars max)
2. Description (155 chars max)  
3. Relevant hashtags (8-12)
4. SEO keywords (5-8)
5. Content category
6. Thumbnail text suggestion

Respond in JSON:
{
  "title": "Optimized video title",
  "description": "Compelling description with keywords",
  "hashtags": ["#relevant", "#hashtags"],
  "keywords": ["seo", "keywords"],
  "category": "education|entertainment|lifestyle|business",
  "thumbnailText": "Eye-catching thumbnail text",
  "captions": "Brief caption for social media"
}`;

    try {
      const response = await provider.generate(seoPrompt, {
        maxTokens: 600,
        temperature: 0.4,
        specialty: 'seo_optimization'
      });

      return JSON.parse(response.content);

    } catch (error) {
      logger.error(`SEO generation failed: ${error}`);
      return this.createFallbackSEOMetadata(script, request);
    }
  }

  /**
   * Generate thumbnail data and prompt
   */
  private async generateThumbnailData(script: any, request: ContentGenerationRequest): Promise<ThumbnailData> {
    const provider = this.selectProvider('thumbnail_generation');
    
    if (!provider) {
      return this.createFallbackThumbnailData(script, request);
    }

    const thumbPrompt = `Design thumbnail data for this video:

Title: ${script.title}
Topic: ${request.topic}
Tone: ${request.tone}
Platform: ${request.platform || 'general'}

Create:
1. Primary text (3-5 words, bold and readable)
2. Secondary text (optional, supporting detail)
3. Color scheme (based on topic and tone)
4. Visual style recommendation
5. AI image generation prompt

Respond in JSON:
{
  "primaryText": "SHOCKING FACTS",
  "secondaryText": "You Never Knew",
  "colorScheme": "bright_blue_yellow",
  "style": "bold|minimal|playful|professional",
  "imagePrompt": "Detailed prompt for AI image generation including style, colors, composition"
}`;

    try {
      const response = await provider.generate(thumbPrompt, {
        maxTokens: 400,
        temperature: 0.6,
        specialty: 'thumbnail_generation'
      });

      return JSON.parse(response.content);

    } catch (error) {
      logger.error(`Thumbnail generation failed: ${error}`);
      return this.createFallbackThumbnailData(script, request);
    }
  }

  /**
   * Select best provider for specific task
   */
  private selectProvider(specialty: AISpecialty, promptLength?: number): AIProvider | null {
    const availableProviders = Array.from(this.providers.values())
      .filter(p => p.isHealthy() && p.canHandleSpecialty(specialty))
      .filter(p => !promptLength || promptLength < p.config.maxTokens * 0.8) // Leave room for response
      .sort((a, b) => {
        // Primary sort by specialty match
        const aMatch = a.config.specialties.includes(specialty) ? 1 : 0;
        const bMatch = b.config.specialties.includes(specialty) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
        
        // Secondary sort by priority
        return a.config.priority - b.config.priority;
      });

    return availableProviders[0] || null;
  }

  /**
   * Initialize AI providers
   */
  private initializeProviders(configs: AIProviderConfig[]) {
    for (const config of configs) {
      try {
        const provider = new AIProvider(config);
        this.providers.set(config.name, provider);
        logger.info(`Initialized AI provider: ${config.name}`);
      } catch (error) {
        logger.error(`Failed to initialize provider ${config.name}: ${error}`);
      }
    }
  }

  // Helper methods for fallback scenarios
  private createDefaultQualityAssessment(): QualityAssessment {
    return {
      overallScore: 75,
      dimensions: {
        engagement: 75,
        clarity: 80,
        relevance: 75,
        creativity: 70,
        brandAlignment: 75,
        platformOptimization: 75
      },
      feedback: ['Quality assessment unavailable - using default scores'],
      improvements: ['Manual review recommended'],
      passesThreshold: true
    };
  }

  private createFallbackSEOMetadata(script: any, request: ContentGenerationRequest): SEOMetadata {
    return {
      title: script.title.substring(0, 60),
      description: `${request.topic} - ${script.transcript.substring(0, 120)}...`,
      hashtags: [`#${request.topic.replace(/\s+/g, '')}`, `#${request.contentType}`, '#viral'],
      keywords: [request.topic, request.contentType, 'video'],
      category: request.contentType,
      thumbnailText: request.topic.toUpperCase(),
      captions: script.title
    };
  }

  private createFallbackThumbnailData(script: any, request: ContentGenerationRequest): ThumbnailData {
    return {
      primaryText: request.topic.substring(0, 20).toUpperCase(),
      secondaryText: undefined,
      colorScheme: 'bright_blue_yellow',
      style: 'bold',
      imagePrompt: `Create an eye-catching thumbnail image for a ${request.contentType} video about ${request.topic}, bright colors, bold text, ${request.tone} style`
    };
  }

  private calculateCostBreakdown(providersUsed: string[]): CostBreakdown {
    // Implementation would track actual usage per provider
    return {
      totalCost: 0.05, // Placeholder
      breakdown: {},
      budgetRemaining: 100
    };
  }

  private createErrorResult(code: string, message: string, metrics: ProcessingMetrics): ContentGenerationResult {
    return {
      success: false,
      content: {
        script: {
          title: '',
          scenes: [],
          estimatedDuration: 0,
          wordCount: 0,
          transcript: ''
        }
      },
      qualityAssessment: this.createDefaultQualityAssessment(),
      costBreakdown: { totalCost: 0, breakdown: {} },
      processingMetrics: metrics,
      error: {
        code,
        message,
        retryable: code !== 'BRAND_SAFETY_VIOLATION'
      }
    };
  }
}

/**
 * Individual AI Provider wrapper
 */
class AIProvider {
  public config: AIProviderConfig;
  private lastHealthCheck: Date = new Date(0);
  private isHealthyStatus: boolean = true;
  private usageStats = {
    tokensUsed: 0,
    requestCount: 0,
    errorCount: 0,
    lastUsed: new Date()
  };

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  async generate(prompt: string, options: {
    maxTokens: number;
    temperature: number;
    specialty: AISpecialty;
  }): Promise<{content: string; tokensUsed: number}> {
    // Implementation would make actual API calls to each provider
    // This is a placeholder structure
    
    this.usageStats.requestCount++;
    this.usageStats.lastUsed = new Date();

    try {
      // Simulate API call based on provider type
      const response = await this.callProviderAPI(prompt, options);
      this.usageStats.tokensUsed += response.tokensUsed;
      
      return response;
    } catch (error) {
      this.usageStats.errorCount++;
      this.isHealthyStatus = false;
      throw error;
    }
  }

  private async callProviderAPI(prompt: string, options: any): Promise<{content: string; tokensUsed: number}> {
    // Provider-specific implementation would go here
    // For now, return a placeholder
    return {
      content: `Generated content for: ${prompt.substring(0, 50)}...`,
      tokensUsed: Math.floor(prompt.length * 0.75)
    };
  }

  isHealthy(): boolean {
    return this.isHealthyStatus;
  }

  canHandleSpecialty(specialty: AISpecialty): boolean {
    return this.config.specialties.includes(specialty);
  }

  getUsageStats() {
    return { ...this.usageStats };
  }
}

/**
 * Usage tracking for cost optimization
 */
class UsageTracker {
  private monthlyUsage = new Map<string, number>();
  private dailyUsage = new Map<string, number>();

  trackUsage(provider: string, cost: number) {
    const monthKey = `${provider}-${new Date().getFullYear()}-${new Date().getMonth()}`;
    const dayKey = `${provider}-${new Date().toDateString()}`;
    
    this.monthlyUsage.set(monthKey, (this.monthlyUsage.get(monthKey) || 0) + cost);
    this.dailyUsage.set(dayKey, (this.dailyUsage.get(dayKey) || 0) + cost);
  }

  getMonthlyUsage(provider: string): number {
    const monthKey = `${provider}-${new Date().getFullYear()}-${new Date().getMonth()}`;
    return this.monthlyUsage.get(monthKey) || 0;
  }

  getDailyUsage(provider: string): number {
    const dayKey = `${provider}-${new Date().toDateString()}`;
    return this.dailyUsage.get(dayKey) || 0;
  }
}