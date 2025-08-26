import { logger } from "../logger";
import { CacheService } from "./CacheService";
import crypto from "crypto";

export interface BrandSafetyConfig {
  enabled: boolean;
  strictMode: boolean; // More aggressive filtering
  customCategories: BrandSafetyCategory[];
  whitelist: string[];
  blacklist: string[];
  confidenceThreshold: number; // 0-1
  aiProviders: {
    primary: string;
    fallback: string[];
  };
}

export interface BrandSafetyCategory {
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  keywords: string[];
  patterns: RegExp[];
  enabled: boolean;
}

export interface BrandSafetyRequest {
  content: string;
  contentType: 'text' | 'title' | 'description' | 'transcript';
  metadata?: {
    platform?: string;
    audience?: string;
    brandGuidelines?: any;
  };
  options?: {
    enableCache?: boolean;
    detailedAnalysis?: boolean;
    includeRecommendations?: boolean;
  };
}

export interface BrandSafetyResult {
  approved: boolean;
  overallScore: number; // 0-100 (100 = completely safe)
  confidence: number; // 0-1
  categories: {
    [categoryName: string]: CategoryAnalysis;
  };
  violations: Violation[];
  recommendations: string[];
  processedAt: Date;
  processingTimeMs: number;
  aiProviderUsed?: string;
}

export interface CategoryAnalysis {
  score: number; // 0-100
  confidence: number; // 0-1
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected: boolean;
  matches: Match[];
  description: string;
}

export interface Match {
  text: string;
  position: number;
  confidence: number;
  context: string;
}

export interface Violation {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  matches: Match[];
  recommendation: string;
}

export class BrandSafetyService {
  private config: BrandSafetyConfig;
  private cacheService: CacheService;
  private defaultCategories: BrandSafetyCategory[];

  constructor(config: BrandSafetyConfig, cacheService: CacheService) {
    this.config = config;
    this.cacheService = cacheService;
    this.defaultCategories = this.initializeDefaultCategories();
  }

  /**
   * Main brand safety analysis method
   */
  public async analyzeContent(request: BrandSafetyRequest): Promise<BrandSafetyResult> {
    const startTime = Date.now();

    try {
      // Check cache if enabled
      if (request.options?.enableCache !== false) {
        const cached = await this.checkCache(request);
        if (cached) {
          logger.debug('Brand safety analysis cache hit');
          return cached;
        }
      }

      // Perform analysis
      const result = await this.performAnalysis(request);
      result.processingTimeMs = Date.now() - startTime;
      result.processedAt = new Date();

      // Cache result if enabled
      if (request.options?.enableCache !== false && result.confidence > 0.8) {
        await this.cacheResult(request, result);
      }

      logger.info(`Brand safety analysis completed: ${result.approved ? 'APPROVED' : 'REJECTED'} (score: ${result.overallScore})`);
      return result;

    } catch (error) {
      logger.error(`Brand safety analysis failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Return safe default if analysis fails
      return {
        approved: false,
        overallScore: 50,
        confidence: 0.5,
        categories: {},
        violations: [{
          category: 'analysis_error',
          severity: 'medium',
          description: 'Brand safety analysis failed - manual review required',
          matches: [],
          recommendation: 'Please review content manually'
        }],
        recommendations: ['Manual review required due to analysis failure'],
        processedAt: new Date(),
        processingTimeMs: Date.now() - startTime,
        aiProviderUsed: 'none'
      };
    }
  }

  /**
   * Perform the actual safety analysis
   */
  private async performAnalysis(request: BrandSafetyRequest): Promise<BrandSafetyResult> {
    const categories = [...this.defaultCategories, ...this.config.customCategories]
      .filter(cat => cat.enabled);

    const categoryAnalyses: { [key: string]: CategoryAnalysis } = {};
    const violations: Violation[] = [];

    // Rule-based analysis (fast, local)
    for (const category of categories) {
      const analysis = await this.analyzeCategoryRuleBased(request.content, category);
      categoryAnalyses[category.name] = analysis;

      if (analysis.detected && analysis.severity !== 'low') {
        violations.push({
          category: category.name,
          severity: analysis.severity,
          description: category.description,
          matches: analysis.matches,
          recommendation: this.getRecommendationForCategory(category)
        });
      }
    }

    // AI-enhanced analysis (if enabled and needed)
    if (this.shouldUseAIAnalysis(violations, request)) {
      const aiAnalysis = await this.performAIAnalysis(request);
      this.mergeAIAnalysis(categoryAnalyses, violations, aiAnalysis);
    }

    // Calculate overall score and approval
    const overallScore = this.calculateOverallScore(categoryAnalyses);
    const approved = this.determineApproval(overallScore, violations);
    const confidence = this.calculateConfidence(categoryAnalyses);
    
    // Generate recommendations
    const recommendations = request.options?.includeRecommendations !== false
      ? this.generateRecommendations(violations, categoryAnalyses)
      : [];

    return {
      approved,
      overallScore,
      confidence,
      categories: categoryAnalyses,
      violations,
      recommendations,
      processedAt: new Date(),
      processingTimeMs: 0, // Will be set by caller
    };
  }

  /**
   * Rule-based category analysis using keywords and patterns
   */
  private async analyzeCategoryRuleBased(content: string, category: BrandSafetyCategory): Promise<CategoryAnalysis> {
    const matches: Match[] = [];
    const contentLower = content.toLowerCase();

    // Keyword matching
    for (const keyword of category.keywords) {
      const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
      let match;
      while ((match = regex.exec(contentLower)) !== null) {
        matches.push({
          text: keyword,
          position: match.index,
          confidence: 0.8,
          context: this.extractContext(content, match.index, 50)
        });
      }
    }

    // Pattern matching
    for (const pattern of category.patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        matches.push({
          text: match[0],
          position: match.index,
          confidence: 0.9,
          context: this.extractContext(content, match.index, 50)
        });
      }
    }

    const detected = matches.length > 0;
    const score = detected ? Math.max(0, 100 - (matches.length * 20)) : 100;
    const confidence = matches.length > 0 ? 0.9 : 0.7; // Higher confidence when violations found

    return {
      score,
      confidence,
      severity: category.severity,
      detected,
      matches,
      description: category.description
    };
  }

  /**
   * AI-enhanced analysis for complex cases
   */
  private async performAIAnalysis(request: BrandSafetyRequest): Promise<any> {
    // This would integrate with AI providers for more sophisticated analysis
    // For now, return a placeholder structure
    
    const aiPrompt = `Analyze this content for brand safety issues:

Content: "${request.content}"
Type: ${request.contentType}
Platform: ${request.metadata?.platform || 'general'}

Check for:
1. Hate speech or discrimination
2. Violence or harmful content
3. Adult/sexual content
4. Misinformation
5. Harassment or bullying
6. Illegal activities
7. Substance abuse
8. Copyright violations

Rate each category 0-100 (100 = completely safe) and provide specific findings.

Respond in JSON format with detailed analysis.`;

    try {
      // Placeholder for actual AI API call
      // const response = await this.callAIProvider(aiPrompt);
      
      // Return mock analysis for now
      return {
        aiEnhanced: true,
        categories: {},
        additionalViolations: [],
        confidence: 0.85
      };
    } catch (error) {
      logger.warn(`AI brand safety analysis failed: ${error}`);
      return { aiEnhanced: false };
    }
  }

  /**
   * Determine if AI analysis is needed
   */
  private shouldUseAIAnalysis(violations: Violation[], request: BrandSafetyRequest): boolean {
    // Use AI for complex cases or when detailed analysis is requested
    return (
      this.config.strictMode ||
      request.options?.detailedAnalysis ||
      violations.some(v => v.severity === 'high' || v.severity === 'critical') ||
      violations.length > 3
    );
  }

  /**
   * Merge AI analysis results with rule-based analysis
   */
  private mergeAIAnalysis(categories: any, violations: Violation[], aiAnalysis: any) {
    if (!aiAnalysis.aiEnhanced) return;

    // Merge additional violations from AI
    if (aiAnalysis.additionalViolations) {
      violations.push(...aiAnalysis.additionalViolations);
    }

    // Update category scores with AI insights
    for (const [catName, aiCat] of Object.entries(aiAnalysis.categories || {})) {
      if (categories[catName]) {
        const existing = categories[catName];
        const ai = aiCat as any;
        
        // Take more conservative (lower) score
        existing.score = Math.min(existing.score, ai.score || existing.score);
        existing.confidence = Math.max(existing.confidence, ai.confidence || existing.confidence);
      }
    }
  }

  /**
   * Calculate overall safety score
   */
  private calculateOverallScore(categories: { [key: string]: CategoryAnalysis }): number {
    const categoryScores = Object.values(categories);
    if (categoryScores.length === 0) return 100;

    // Weighted average with critical categories having more impact
    let totalWeight = 0;
    let weightedSum = 0;

    for (const cat of categoryScores) {
      const weight = this.getCategoryWeight(cat.severity);
      weightedSum += cat.score * weight;
      totalWeight += weight;
    }

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Get weight for category severity
   */
  private getCategoryWeight(severity: string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 1;
    }
  }

  /**
   * Determine if content is approved
   */
  private determineApproval(overallScore: number, violations: Violation[]): boolean {
    // Reject if any critical violations
    if (violations.some(v => v.severity === 'critical')) {
      return false;
    }

    // Strict mode has higher threshold
    const threshold = this.config.strictMode ? 85 : 70;
    
    // Check overall score
    if (overallScore < threshold) {
      return false;
    }

    // Check violation count
    const highSeverityViolations = violations.filter(v => v.severity === 'high' || v.severity === 'critical');
    if (highSeverityViolations.length > 2) {
      return false;
    }

    return true;
  }

  /**
   * Calculate overall confidence
   */
  private calculateConfidence(categories: { [key: string]: CategoryAnalysis }): number {
    const confidences = Object.values(categories).map(cat => cat.confidence);
    if (confidences.length === 0) return 0.5;

    return confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(violations: Violation[], categories: { [key: string]: CategoryAnalysis }): string[] {
    const recommendations: string[] = [];

    // Specific recommendations for violations
    for (const violation of violations) {
      recommendations.push(violation.recommendation);
    }

    // General recommendations based on scores
    const lowScoreCategories = Object.entries(categories)
      .filter(([_, cat]) => cat.score < 80 && cat.detected)
      .map(([name, _]) => name);

    if (lowScoreCategories.length > 0) {
      recommendations.push(`Review content for potential issues in: ${lowScoreCategories.join(', ')}`);
    }

    // Remove duplicates and return
    return [...new Set(recommendations)];
  }

  /**
   * Get recommendation for specific category
   */
  private getRecommendationForCategory(category: BrandSafetyCategory): string {
    const recommendations: { [key: string]: string } = {
      'inappropriate_language': 'Replace profanity or inappropriate language with alternative terms',
      'hate_speech': 'Remove discriminatory language and ensure inclusive messaging',
      'violence': 'Remove violent imagery or language that could be disturbing',
      'adult_content': 'Ensure content is appropriate for intended audience age rating',
      'misinformation': 'Verify factual claims and cite reliable sources',
      'harassment': 'Remove language that could be perceived as bullying or harassment',
      'illegal_activities': 'Remove references to illegal activities or substances',
      'copyright': 'Ensure all content is original or properly licensed'
    };

    return recommendations[category.name] || `Review and modify ${category.name} related content`;
  }

  /**
   * Extract context around a match
   */
  private extractContext(text: string, position: number, contextLength: number = 50): string {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(text.length, position + contextLength);
    return text.substring(start, end).trim();
  }

  /**
   * Cache management
   */
  private async checkCache(request: BrandSafetyRequest): Promise<BrandSafetyResult | null> {
    const cacheKey = this.generateCacheKey(request);
    return await this.cacheService.get<BrandSafetyResult>(cacheKey);
  }

  private async cacheResult(request: BrandSafetyRequest, result: BrandSafetyResult): Promise<void> {
    const cacheKey = this.generateCacheKey(request);
    const ttl = 3600; // 1 hour cache
    await this.cacheService.set(cacheKey, result, ttl, ['brand_safety']);
  }

  private generateCacheKey(request: BrandSafetyRequest): string {
    const hash = crypto.createHash('sha256')
      .update(request.content)
      .update(request.contentType)
      .update(JSON.stringify(request.metadata || {}))
      .digest('hex');
    return `brand_safety:${hash}`;
  }

  /**
   * Initialize default safety categories
   */
  private initializeDefaultCategories(): BrandSafetyCategory[] {
    return [
      {
        name: 'inappropriate_language',
        description: 'Profanity, offensive language, or inappropriate terms',
        severity: 'medium',
        keywords: ['damn', 'hell', 'crap', 'stupid', 'idiot', 'hate'],
        patterns: [/\b[a-z]*\*+[a-z]*\b/gi], // Censored words with asterisks
        enabled: true
      },
      {
        name: 'hate_speech',
        description: 'Discriminatory language based on race, religion, gender, etc.',
        severity: 'critical',
        keywords: [], // Sensitive keywords would be configured separately
        patterns: [],
        enabled: true
      },
      {
        name: 'violence',
        description: 'References to violence, weapons, or harmful activities',
        severity: 'high',
        keywords: ['kill', 'murder', 'weapon', 'gun', 'knife', 'blood', 'death', 'violence'],
        patterns: [/\b(shoot|stab|punch|hit|attack|fight)\s+(him|her|them|someone)\b/gi],
        enabled: true
      },
      {
        name: 'adult_content',
        description: 'Sexual content or adult themes inappropriate for general audiences',
        severity: 'high',
        keywords: ['sex', 'nude', 'naked', 'porn', 'adult', 'sexy'],
        patterns: [],
        enabled: true
      },
      {
        name: 'substance_abuse',
        description: 'References to drugs, alcohol abuse, or substance misuse',
        severity: 'medium',
        keywords: ['drunk', 'high', 'wasted', 'cocaine', 'heroin', 'meth', 'overdose'],
        patterns: [/\b(get|getting)\s+(high|drunk|wasted)\b/gi],
        enabled: true
      },
      {
        name: 'misinformation',
        description: 'Potentially false or misleading information',
        severity: 'medium',
        keywords: ['fake news', 'conspiracy', 'hoax', 'lie', 'false'],
        patterns: [/\b(proven\s+fact|100%\s+true|doctors\s+hate)\b/gi],
        enabled: true
      },
      {
        name: 'harassment',
        description: 'Content that could constitute bullying or harassment',
        severity: 'high',
        keywords: ['bully', 'loser', 'pathetic', 'worthless', 'disgusting'],
        patterns: [/\b(you\s+are\s+so|what\s+a)\s+(stupid|ugly|fat|dumb)\b/gi],
        enabled: true
      },
      {
        name: 'copyright',
        description: 'Potential copyright violations or trademark issues',
        severity: 'medium',
        keywords: ['copyrighted', 'trademark', 'stolen', 'pirated'],
        patterns: [/\b(download|stream|watch)\s+(free|illegal)\b/gi],
        enabled: true
      }
    ];
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<BrandSafetyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Brand safety configuration updated');
  }

  /**
   * Get current configuration
   */
  public getConfig(): BrandSafetyConfig {
    return { ...this.config };
  }

  /**
   * Add custom category
   */
  public addCustomCategory(category: BrandSafetyCategory): void {
    this.config.customCategories.push(category);
    logger.info(`Added custom brand safety category: ${category.name}`);
  }

  /**
   * Remove custom category
   */
  public removeCustomCategory(categoryName: string): boolean {
    const index = this.config.customCategories.findIndex(cat => cat.name === categoryName);
    if (index > -1) {
      this.config.customCategories.splice(index, 1);
      logger.info(`Removed custom brand safety category: ${categoryName}`);
      return true;
    }
    return false;
  }

  /**
   * Test content against specific category
   */
  public async testCategory(content: string, categoryName: string): Promise<CategoryAnalysis | null> {
    const category = [...this.defaultCategories, ...this.config.customCategories]
      .find(cat => cat.name === categoryName);
    
    if (!category) {
      return null;
    }

    return await this.analyzeCategoryRuleBased(content, category);
  }

  /**
   * Get available categories
   */
  public getCategories(): BrandSafetyCategory[] {
    return [...this.defaultCategories, ...this.config.customCategories];
  }
}