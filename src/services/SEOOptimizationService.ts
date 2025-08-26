import { logger } from "../logger";
import { CacheService } from "./CacheService";
import crypto from "crypto";

export interface SEOOptimizationRequest {
  content: {
    title?: string;
    transcript: string;
    topic: string;
    keywords?: string[];
  };
  platform: 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'general';
  targetAudience: string;
  contentType: 'educational' | 'entertainment' | 'marketing' | 'news';
  options?: {
    enableCache?: boolean;
    generateHashtags?: boolean;
    optimizeForViral?: boolean;
    includeCallToAction?: boolean;
    maxTitleLength?: number;
    maxDescriptionLength?: number;
  };
}

export interface SEOOptimizationResult {
  success: boolean;
  seoData: {
    title: OptimizedTitle;
    description: OptimizedDescription;
    hashtags: HashtagAnalysis;
    keywords: KeywordAnalysis;
    metadata: PlatformMetadata;
    callToAction?: CallToAction;
  };
  performanceMetrics: {
    viralPotentialScore: number; // 0-100
    engagementPrediction: number; // 0-100
    searchabilityScore: number; // 0-100
    platformCompatibility: number; // 0-100
  };
  recommendations: SEORecommendation[];
  processingTime: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface OptimizedTitle {
  primary: string;
  alternatives: string[];
  length: number;
  keywordDensity: number;
  hookStrength: number; // 0-100
  platformOptimized: boolean;
}

export interface OptimizedDescription {
  short: string; // For platforms with limited description space
  long: string; // Full description
  keywordOptimized: string; // SEO-focused version
  length: number;
  keywordPlacement: KeywordPlacement[];
  readabilityScore: number; // 0-100
}

export interface KeywordPlacement {
  keyword: string;
  position: number;
  prominence: 'high' | 'medium' | 'low';
  context: string;
}

export interface HashtagAnalysis {
  trending: string[]; // Currently trending hashtags
  niche: string[]; // Specific to content topic
  broad: string[]; // General engagement hashtags
  optimal: string[]; // Recommended combination
  performance: {
    [hashtag: string]: {
      popularity: number; // 0-100
      competition: number; // 0-100
      relevance: number; // 0-100
    };
  };
}

export interface KeywordAnalysis {
  primary: string[];
  secondary: string[];
  longtail: string[];
  searchVolume: {
    [keyword: string]: {
      volume: number;
      competition: 'low' | 'medium' | 'high';
      difficulty: number; // 0-100
    };
  };
  semantic: string[]; // Related semantic keywords
}

export interface PlatformMetadata {
  category: string;
  thumbnailSuggestions: ThumbnailSuggestion[];
  postingTime: {
    optimal: string[];
    timezone: string;
    reasoning: string;
  };
  contentWarnings?: string[];
  ageRating?: string;
}

export interface ThumbnailSuggestion {
  primaryText: string;
  style: 'bold' | 'minimal' | 'colorful' | 'professional';
  colorPalette: string[];
  emotionalTrigger: 'curiosity' | 'excitement' | 'surprise' | 'urgency';
}

export interface CallToAction {
  primary: string;
  alternatives: string[];
  placement: 'beginning' | 'middle' | 'end';
  type: 'subscribe' | 'like' | 'comment' | 'share' | 'visit' | 'buy';
  urgency: 'low' | 'medium' | 'high';
}

export interface SEORecommendation {
  type: 'improvement' | 'optimization' | 'warning';
  category: 'title' | 'description' | 'hashtags' | 'keywords' | 'content' | 'timing';
  message: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  implementation: string;
}

export class SEOOptimizationService {
  private cacheService: CacheService;
  private platformConstraints: Map<string, PlatformConstraints>;
  private trendingData: TrendingDataCache;

  constructor(cacheService: CacheService) {
    this.cacheService = cacheService;
    this.platformConstraints = this.initializePlatformConstraints();
    this.trendingData = new TrendingDataCache();
  }

  /**
   * Main SEO optimization method
   */
  public async optimizeContent(request: SEOOptimizationRequest): Promise<SEOOptimizationResult> {
    const startTime = Date.now();

    try {
      // Check cache
      if (request.options?.enableCache !== false) {
        const cached = await this.checkCache(request);
        if (cached) {
          logger.debug('SEO optimization cache hit');
          return { ...cached, processingTime: Date.now() - startTime };
        }
      }

      logger.info(`Optimizing SEO for ${request.platform} platform: ${request.content.topic}`);

      // Get platform constraints
      const constraints = this.platformConstraints.get(request.platform) || this.platformConstraints.get('general')!;

      // Parallel optimization tasks
      const [
        optimizedTitle,
        optimizedDescription,
        hashtagAnalysis,
        keywordAnalysis,
        platformMetadata,
        callToAction
      ] = await Promise.all([
        this.optimizeTitle(request, constraints),
        this.optimizeDescription(request, constraints),
        this.analyzeHashtags(request, constraints),
        this.analyzeKeywords(request, constraints),
        this.generatePlatformMetadata(request, constraints),
        request.options?.includeCallToAction !== false 
          ? this.generateCallToAction(request, constraints)
          : Promise.resolve(undefined)
      ]);

      // Calculate performance metrics
      const performanceMetrics = await this.calculatePerformanceMetrics(
        { optimizedTitle, optimizedDescription, hashtagAnalysis, keywordAnalysis },
        request
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        { optimizedTitle, optimizedDescription, hashtagAnalysis, keywordAnalysis, performanceMetrics },
        request,
        constraints
      );

      const result: SEOOptimizationResult = {
        success: true,
        seoData: {
          title: optimizedTitle,
          description: optimizedDescription,
          hashtags: hashtagAnalysis,
          keywords: keywordAnalysis,
          metadata: platformMetadata,
          callToAction
        },
        performanceMetrics,
        recommendations,
        processingTime: Date.now() - startTime
      };

      // Cache result
      if (request.options?.enableCache !== false) {
        await this.cacheResult(request, result);
      }

      logger.info(`SEO optimization completed in ${result.processingTime}ms - Score: ${performanceMetrics.searchabilityScore}`);
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`SEO optimization failed: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        success: false,
        seoData: this.createFallbackSEOData(request),
        performanceMetrics: {
          viralPotentialScore: 50,
          engagementPrediction: 50,
          searchabilityScore: 50,
          platformCompatibility: 50
        },
        recommendations: [{
          type: 'warning',
          category: 'content',
          message: 'SEO optimization failed - using fallback values',
          impact: 'high',
          actionable: false,
          implementation: 'Please retry SEO optimization or manually optimize content'
        }],
        processingTime,
        error: {
          code: 'SEO_OPTIMIZATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Optimize title for platform and engagement
   */
  private async optimizeTitle(request: SEOOptimizationRequest, constraints: PlatformConstraints): Promise<OptimizedTitle> {
    const baseTitle = request.content.title || this.generateBaseTitle(request.content.topic, request.contentType);
    const maxLength = request.options?.maxTitleLength || constraints.title.maxLength;
    const keywords = request.content.keywords || [];

    // Generate title variations
    const variations = await this.generateTitleVariations(baseTitle, request, maxLength);
    
    // Score each variation
    const scoredTitles = variations.map(title => ({
      title,
      score: this.scoreTitleEffectiveness(title, request, constraints)
    }));

    // Select best title
    const bestTitle = scoredTitles.sort((a, b) => b.score - a.score)[0];
    
    return {
      primary: bestTitle.title,
      alternatives: scoredTitles.slice(1, 4).map(t => t.title), // Top 3 alternatives
      length: bestTitle.title.length,
      keywordDensity: this.calculateKeywordDensity(bestTitle.title, keywords),
      hookStrength: this.calculateHookStrength(bestTitle.title, request.platform),
      platformOptimized: bestTitle.title.length <= maxLength
    };
  }

  /**
   * Generate multiple title variations
   */
  private async generateTitleVariations(baseTitle: string, request: SEOOptimizationRequest, maxLength: number): Promise<string[]> {
    const variations = [baseTitle];
    const topic = request.content.topic;
    const platform = request.platform;

    // Platform-specific variations
    if (platform === 'youtube') {
      variations.push(
        `How to ${topic} (Complete Guide)`,
        `${topic} - Everything You Need to Know`,
        `The Ultimate ${topic} Tutorial`,
        `${topic}: Beginner to Expert in 10 Minutes`
      );
    } else if (platform === 'tiktok') {
      variations.push(
        `${topic} that will blow your mind!`,
        `POV: You discover ${topic}`,
        `This ${topic} hack is genius!`,
        `Wait until you see this ${topic}!`
      );
    } else if (platform === 'instagram') {
      variations.push(
        `${topic} inspiration ✨`,
        `Transform your ${topic} game`,
        `${topic} secrets revealed`,
        `Level up your ${topic}`
      );
    }

    // Emotional hooks
    const emotionalHooks = [
      `Why ${topic} is changing everything`,
      `The shocking truth about ${topic}`,
      `${topic}: What they don't want you to know`,
      `This ${topic} will change your life`,
      `The ${topic} mistake everyone makes`
    ];

    variations.push(...emotionalHooks);

    // Keyword-optimized variations
    if (request.content.keywords) {
      for (const keyword of request.content.keywords.slice(0, 3)) {
        variations.push(
          `${keyword}: ${topic} explained`,
          `Best ${keyword} for ${topic}`,
          `${topic} with ${keyword} - Complete Guide`
        );
      }
    }

    // Filter by length and uniqueness
    return [...new Set(variations)]
      .filter(title => title.length <= maxLength && title.length >= 10)
      .slice(0, 10); // Limit to 10 variations
  }

  /**
   * Score title effectiveness
   */
  private scoreTitleEffectiveness(title: string, request: SEOOptimizationRequest, constraints: PlatformConstraints): number {
    let score = 0;

    // Length optimization (0-25 points)
    const idealLength = constraints.title.idealLength || 60;
    const lengthRatio = Math.min(title.length / idealLength, 1);
    score += lengthRatio * 25;

    // Keyword presence (0-25 points)
    if (request.content.keywords) {
      const keywordsPresent = request.content.keywords.filter(keyword => 
        title.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      score += (keywordsPresent / request.content.keywords.length) * 25;
    } else {
      score += 15; // Default if no keywords specified
    }

    // Emotional engagement (0-25 points)
    const emotionalWords = ['amazing', 'shocking', 'incredible', 'secret', 'ultimate', 'complete', 'best', 'worst', 'hidden', 'revealed'];
    const emotionalScore = emotionalWords.filter(word => title.toLowerCase().includes(word)).length;
    score += Math.min(emotionalScore * 5, 25);

    // Platform optimization (0-25 points)
    const platformScore = this.calculatePlatformOptimizationScore(title, request.platform);
    score += platformScore;

    return Math.round(score);
  }

  /**
   * Calculate platform-specific optimization score
   */
  private calculatePlatformOptimizationScore(title: string, platform: string): number {
    const platformPatterns: { [key: string]: RegExp[] } = {
      youtube: [
        /how to/i,
        /tutorial/i,
        /guide/i,
        /review/i,
        /vs\./i,
        /\d+\s+(ways|tips|tricks|steps)/i
      ],
      tiktok: [
        /pov:/i,
        /(blow your mind|mind.blown)/i,
        /this.*hack/i,
        /wait until/i,
        /(viral|trending)/i
      ],
      instagram: [
        /✨|💫|🔥|💯/,
        /inspiration/i,
        /transform/i,
        /level up/i,
        /secrets/i
      ],
      twitter: [
        /thread/i,
        /\d+\/\d+/,
        /breaking:/i,
        /update:/i
      ]
    };

    const patterns = platformPatterns[platform] || [];
    const matches = patterns.filter(pattern => pattern.test(title)).length;
    
    return Math.min(matches * 8, 25); // Max 25 points
  }

  /**
   * Optimize description for platform and SEO
   */
  private async optimizeDescription(request: SEOOptimizationRequest, constraints: PlatformConstraints): Promise<OptimizedDescription> {
    const baseContent = request.content.transcript;
    const topic = request.content.topic;
    const keywords = request.content.keywords || [];
    
    // Generate descriptions of different lengths
    const shortDesc = await this.generateShortDescription(baseContent, topic, constraints.description.short);
    const longDesc = await this.generateLongDescription(baseContent, topic, request, constraints.description.long);
    const keywordDesc = await this.generateKeywordOptimizedDescription(longDesc, keywords, request);

    // Analyze keyword placement
    const keywordPlacement = this.analyzeKeywordPlacement(longDesc, keywords);

    // Calculate readability
    const readabilityScore = this.calculateReadabilityScore(longDesc);

    return {
      short: shortDesc,
      long: longDesc,
      keywordOptimized: keywordDesc,
      length: longDesc.length,
      keywordPlacement,
      readabilityScore
    };
  }

  /**
   * Generate short description for platforms with limited space
   */
  private async generateShortDescription(content: string, topic: string, maxLength: number): Promise<string> {
    // Extract key points from content
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const firstSentence = sentences[0]?.trim() || '';
    
    let description = firstSentence;
    
    // If too long, create a summary
    if (description.length > maxLength) {
      description = `Learn about ${topic} in this engaging video.`;
    }

    // Add call to action if space allows
    if (description.length < maxLength - 20) {
      description += ' Watch now!';
    }

    return description.substring(0, maxLength);
  }

  /**
   * Generate comprehensive long description
   */
  private async generateLongDescription(
    content: string, 
    topic: string, 
    request: SEOOptimizationRequest, 
    maxLength: number
  ): Promise<string> {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    let description = '';
    
    // Opening hook
    description += `Discover everything you need to know about ${topic}! `;
    
    // Main content summary
    const keyPoints = sentences.slice(0, 3).map(s => s.trim()).join('. ');
    if (keyPoints) {
      description += `${keyPoints}. `;
    }
    
    // Value proposition
    description += `In this ${request.contentType} video, you'll learn valuable insights that will help you understand ${topic} better. `;
    
    // Keywords integration
    if (request.content.keywords && request.content.keywords.length > 0) {
      description += `Topics covered include: ${request.content.keywords.join(', ')}. `;
    }
    
    // Platform-specific additions
    if (request.platform === 'youtube') {
      description += '\n\n🎯 What you\'ll learn:\n';
      description += sentences.slice(0, 3).map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');
      description += '\n\n👍 Like this video if it helped you!';
      description += '\n🔔 Subscribe for more content like this!';
      description += '\n💬 Let us know your thoughts in the comments!';
    } else if (request.platform === 'instagram') {
      description += '\n\n✨ Follow for more amazing content!';
      description += '\n📱 Share with friends who need to see this!';
    } else if (request.platform === 'tiktok') {
      description += '\n\n🔥 Follow for more viral content!';
      description += '\n💬 What did you think? Comment below!';
    }

    return description.substring(0, maxLength);
  }

  /**
   * Generate keyword-optimized version of description
   */
  private async generateKeywordOptimizedDescription(description: string, keywords: string[], request: SEOOptimizationRequest): Promise<string> {
    if (!keywords || keywords.length === 0) {
      return description;
    }

    let optimized = description;
    
    // Ensure primary keyword appears in first sentence
    const primaryKeyword = keywords[0];
    if (!optimized.toLowerCase().includes(primaryKeyword.toLowerCase())) {
      const sentences = optimized.split('. ');
      if (sentences.length > 0) {
        sentences[0] = `${primaryKeyword}: ${sentences[0]}`;
        optimized = sentences.join('. ');
      }
    }

    // Natural keyword integration
    for (const keyword of keywords.slice(1, 4)) { // Limit to avoid keyword stuffing
      if (!optimized.toLowerCase().includes(keyword.toLowerCase())) {
        // Find a natural place to insert the keyword
        const insertion = ` Learn more about ${keyword} and related topics.`;
        optimized += insertion;
      }
    }

    return optimized;
  }

  /**
   * Analyze hashtags for optimal engagement
   */
  private async analyzeHashtags(request: SEOOptimizationRequest, constraints: PlatformConstraints): Promise<HashtagAnalysis> {
    if (!request.options?.generateHashtags) {
      return {
        trending: [],
        niche: [],
        broad: [],
        optimal: [],
        performance: {}
      };
    }

    // Generate different categories of hashtags
    const trending = await this.getTrendingHashtags(request.platform, request.contentType);
    const niche = this.generateNicheHashtags(request.content.topic, request.contentType);
    const broad = this.generateBroadHashtags(request.platform, request.contentType);
    
    // Combine and optimize
    const allHashtags = [...trending, ...niche, ...broad];
    const performance = await this.analyzeHashtagPerformance(allHashtags, request.platform);
    
    // Select optimal combination
    const optimal = this.selectOptimalHashtags(allHashtags, performance, constraints.hashtags?.maxCount || 10);

    return {
      trending,
      niche,
      broad,
      optimal,
      performance
    };
  }

  /**
   * Get trending hashtags for platform and content type
   */
  private async getTrendingHashtags(platform: string, contentType: string): Promise<string[]> {
    // In a real implementation, this would fetch from trending APIs or databases
    const trendingByPlatform: { [key: string]: { [key: string]: string[] } } = {
      tiktok: {
        educational: ['#LearnOnTikTok', '#EducationalContent', '#DidYouKnow', '#FactCheck', '#Learning'],
        entertainment: ['#Viral', '#Trending', '#ForYou', '#Entertainment', '#Comedy'],
        marketing: ['#Business', '#Marketing', '#Entrepreneur', '#Success', '#Tips'],
        news: ['#News', '#Breaking', '#CurrentEvents', '#Update', '#Trending']
      },
      instagram: {
        educational: ['#Education', '#Learning', '#Knowledge', '#Tips', '#Tutorial'],
        entertainment: ['#Reels', '#Entertainment', '#Viral', '#Fun', '#InstagramReels'],
        marketing: ['#Business', '#Marketing', '#Branding', '#Growth', '#Success'],
        news: ['#News', '#Breaking', '#Update', '#CurrentEvents', '#InTheNews']
      },
      youtube: {
        educational: ['#Tutorial', '#HowTo', '#Education', '#Learning', '#Explained'],
        entertainment: ['#Entertainment', '#Viral', '#Trending', '#Fun', '#Amazing'],
        marketing: ['#Business', '#Marketing', '#Entrepreneur', '#Success', '#Growth'],
        news: ['#News', '#Breaking', '#Analysis', '#Update', '#Explained']
      }
    };

    return trendingByPlatform[platform]?.[contentType] || [];
  }

  /**
   * Generate niche hashtags specific to content topic
   */
  private generateNicheHashtags(topic: string, contentType: string): string[] {
    const words = topic.toLowerCase().split(/\s+/);
    const hashtags: string[] = [];
    
    // Create hashtags from topic words
    for (const word of words) {
      if (word.length > 3) {
        hashtags.push(`#${this.capitalizeFirst(word)}`);
      }
    }
    
    // Combined hashtags
    if (words.length > 1) {
      const combined = words.join('').replace(/[^a-zA-Z0-9]/g, '');
      if (combined.length <= 20) {
        hashtags.push(`#${this.capitalizeFirst(combined)}`);
      }
    }
    
    // Content type specific
    hashtags.push(`#${this.capitalizeFirst(contentType)}`);
    
    return hashtags.slice(0, 5); // Limit to 5 niche hashtags
  }

  /**
   * Generate broad engagement hashtags
   */
  private generateBroadHashtags(platform: string, contentType: string): string[] {
    const broadByPlatform: { [key: string]: string[] } = {
      tiktok: ['#FYP', '#ForYouPage', '#Viral', '#Trending', '#TikTokMadeMeBuyIt'],
      instagram: ['#Explore', '#Viral', '#InstagramReels', '#Trending', '#Amazing'],
      youtube: ['#Viral', '#Trending', '#MustWatch', '#Amazing', '#Incredible'],
      twitter: ['#Trending', '#Viral', '#MustRead', '#Breaking', '#Thread'],
      general: ['#Viral', '#Trending', '#Amazing', '#MustSee', '#Incredible']
    };

    return broadByPlatform[platform] || broadByPlatform.general;
  }

  /**
   * Analyze hashtag performance metrics
   */
  private async analyzeHashtagPerformance(hashtags: string[], platform: string): Promise<{ [hashtag: string]: { popularity: number; competition: number; relevance: number } }> {
    const performance: { [hashtag: string]: { popularity: number; competition: number; relevance: number } } = {};
    
    for (const hashtag of hashtags) {
      // In a real implementation, this would use analytics APIs
      performance[hashtag] = {
        popularity: Math.floor(Math.random() * 100), // Placeholder
        competition: Math.floor(Math.random() * 100), // Placeholder
        relevance: Math.floor(Math.random() * 100) // Placeholder
      };
    }
    
    return performance;
  }

  /**
   * Select optimal hashtag combination
   */
  private selectOptimalHashtags(
    hashtags: string[], 
    performance: { [hashtag: string]: { popularity: number; competition: number; relevance: number } }, 
    maxCount: number
  ): string[] {
    // Score hashtags based on performance metrics
    const scored = hashtags.map(hashtag => ({
      hashtag,
      score: this.calculateHashtagScore(performance[hashtag] || { popularity: 50, competition: 50, relevance: 50 })
    }));
    
    // Sort by score and take top hashtags
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCount)
      .map(item => item.hashtag);
  }

  /**
   * Calculate hashtag effectiveness score
   */
  private calculateHashtagScore(metrics: { popularity: number; competition: number; relevance: number }): number {
    // Balance popularity and relevance while penalizing high competition
    return (metrics.popularity * 0.4 + metrics.relevance * 0.5) - (metrics.competition * 0.1);
  }

  /**
   * Analyze keywords for SEO optimization
   */
  private async analyzeKeywords(request: SEOOptimizationRequest, constraints: PlatformConstraints): Promise<KeywordAnalysis> {
    const content = request.content.transcript;
    const providedKeywords = request.content.keywords || [];
    
    // Extract keywords from content
    const extractedKeywords = this.extractKeywordsFromContent(content);
    
    // Generate semantic keywords
    const semanticKeywords = await this.generateSemanticKeywords(request.content.topic, providedKeywords);
    
    // Categorize keywords
    const primary = [...providedKeywords, request.content.topic].slice(0, 3);
    const secondary = extractedKeywords.filter(k => !primary.includes(k)).slice(0, 5);
    const longtail = this.generateLongtailKeywords(primary, request.contentType);
    
    // Analyze search volume and competition
    const searchVolume = await this.analyzeSearchVolume([...primary, ...secondary, ...longtail]);

    return {
      primary,
      secondary,
      longtail,
      searchVolume,
      semantic: semanticKeywords
    };
  }

  /**
   * Extract relevant keywords from content
   */
  private extractKeywordsFromContent(content: string): string[] {
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));
    
    // Count word frequency
    const frequency: { [word: string]: number } = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Return top keywords by frequency
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'and', 'but', 'for', 'are', 'with', 'this', 'that', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'will', 'can', 'would', 'could', 'should'];
    return stopWords.includes(word.toLowerCase());
  }

  /**
   * Generate semantic keywords related to the topic
   */
  private async generateSemanticKeywords(topic: string, existingKeywords: string[]): Promise<string[]> {
    // In a real implementation, this would use NLP APIs or semantic analysis
    const topicWords = topic.toLowerCase().split(/\s+/);
    const semantic: string[] = [];
    
    // Generate related terms (simplified approach)
    for (const word of topicWords) {
      const related = this.getRelatedTerms(word);
      semantic.push(...related);
    }
    
    // Remove duplicates and existing keywords
    return [...new Set(semantic)]
      .filter(keyword => !existingKeywords.includes(keyword))
      .slice(0, 5);
  }

  private getRelatedTerms(word: string): string[] {
    // Simplified semantic relationships
    const relationships: { [key: string]: string[] } = {
      'marketing': ['advertising', 'promotion', 'branding', 'strategy', 'digital'],
      'business': ['entrepreneur', 'startup', 'company', 'growth', 'success'],
      'education': ['learning', 'teaching', 'knowledge', 'tutorial', 'guide'],
      'technology': ['tech', 'innovation', 'digital', 'software', 'development'],
      'health': ['wellness', 'fitness', 'nutrition', 'medical', 'healthcare'],
      'finance': ['money', 'investment', 'financial', 'economy', 'banking']
    };
    
    return relationships[word] || [];
  }

  /**
   * Generate long-tail keyword phrases
   */
  private generateLongtailKeywords(primaryKeywords: string[], contentType: string): string[] {
    const longtail: string[] = [];
    const modifiers = {
      educational: ['how to', 'best way to', 'complete guide to', 'tutorial for', 'learn'],
      entertainment: ['funny', 'amazing', 'incredible', 'viral', 'trending'],
      marketing: ['best practices for', 'strategy for', 'tips for', 'guide to', 'success with'],
      news: ['latest news on', 'breaking news about', 'update on', 'analysis of', 'report on']
    };
    
    const contentModifiers = modifiers[contentType as keyof typeof modifiers] || modifiers.educational;
    
    for (const keyword of primaryKeywords.slice(0, 2)) {
      for (const modifier of contentModifiers.slice(0, 3)) {
        longtail.push(`${modifier} ${keyword}`);
      }
    }
    
    return longtail;
  }

  /**
   * Analyze search volume and competition for keywords
   */
  private async analyzeSearchVolume(keywords: string[]): Promise<{ [keyword: string]: { volume: number; competition: 'low' | 'medium' | 'high'; difficulty: number } }> {
    const analysis: { [keyword: string]: { volume: number; competition: 'low' | 'medium' | 'high'; difficulty: number } } = {};
    
    for (const keyword of keywords) {
      // Simplified analysis - in production, use real SEO APIs
      const volume = Math.floor(Math.random() * 10000);
      const difficulty = Math.floor(Math.random() * 100);
      const competition = difficulty < 30 ? 'low' : difficulty < 70 ? 'medium' : 'high';
      
      analysis[keyword] = { volume, competition, difficulty };
    }
    
    return analysis;
  }

  // Helper methods and utility functions continue...
  
  private calculateKeywordDensity(text: string, keywords: string[]): number {
    if (keywords.length === 0) return 0;
    
    const words = text.toLowerCase().split(/\s+/);
    const keywordCount = keywords.reduce((count, keyword) => {
      return count + (words.filter(word => word.includes(keyword.toLowerCase())).length);
    }, 0);
    
    return (keywordCount / words.length) * 100;
  }

  private calculateHookStrength(title: string, platform: string): number {
    let score = 50; // Base score
    
    // Emotional triggers
    const emotionalTriggers = ['amazing', 'incredible', 'shocking', 'secret', 'revealed', 'hidden', 'ultimate', 'best', 'worst'];
    const triggerCount = emotionalTriggers.filter(trigger => title.toLowerCase().includes(trigger)).length;
    score += triggerCount * 10;
    
    // Numbers and specificity
    if (/\d+/.test(title)) score += 15;
    
    // Questions
    if (title.includes('?')) score += 10;
    
    // Platform-specific hooks
    if (platform === 'tiktok' && /wait|pov|this.*will/i.test(title)) score += 20;
    if (platform === 'youtube' && /how to|tutorial|guide/i.test(title)) score += 15;
    
    return Math.min(100, score);
  }

  private generateBaseTitle(topic: string, contentType: string): string {
    const templates: { [key: string]: string[] } = {
      educational: [
        `Everything You Need to Know About ${topic}`,
        `Complete Guide to ${topic}`,
        `How to Master ${topic}`,
        `${topic} Explained Simply`
      ],
      entertainment: [
        `${topic} That Will Amaze You`,
        `Incredible ${topic} You Haven't Seen`,
        `The Most Amazing ${topic}`,
        `${topic} Gone Viral`
      ],
      marketing: [
        `${topic} Strategy That Works`,
        `Boost Your Business with ${topic}`,
        `${topic} Success Secrets`,
        `Master ${topic} Marketing`
      ],
      news: [
        `Latest ${topic} News`,
        `Breaking: ${topic} Update`,
        `${topic} Analysis`,
        `What You Need to Know About ${topic}`
      ]
    };

    const typeTemplates = templates[contentType] || templates.educational;
    return typeTemplates[0];
  }

  private generatePlatformMetadata(request: SEOOptimizationRequest, constraints: PlatformConstraints): Promise<PlatformMetadata> {
    return Promise.resolve({
      category: this.determineBestCategory(request.contentType, request.platform),
      thumbnailSuggestions: this.generateThumbnailSuggestions(request),
      postingTime: {
        optimal: this.getOptimalPostingTimes(request.platform, request.targetAudience),
        timezone: 'UTC',
        reasoning: 'Based on platform analytics and audience activity patterns'
      }
    });
  }

  private generateCallToAction(request: SEOOptimizationRequest, constraints: PlatformConstraints): Promise<CallToAction> {
    const ctas: { [key: string]: string[] } = {
      youtube: ['Subscribe for more!', 'Like if this helped!', 'Comment your thoughts!'],
      tiktok: ['Follow for more tips!', 'Share with friends!', 'What do you think?'],
      instagram: ['Follow for daily content!', 'Save this for later!', 'Tag someone who needs this!'],
      general: ['Follow for more!', 'Share your thoughts!', 'Save for later!']
    };

    const platformCTAs = ctas[request.platform] || ctas.general;

    return Promise.resolve({
      primary: platformCTAs[0],
      alternatives: platformCTAs.slice(1),
      placement: 'end',
      type: 'subscribe',
      urgency: 'medium'
    });
  }

  private calculatePerformanceMetrics(seoData: any, request: SEOOptimizationRequest): Promise<any> {
    // Simplified performance calculation
    const viralPotentialScore = Math.min(100, 
      (seoData.optimizedTitle.hookStrength * 0.3) +
      (seoData.hashtagAnalysis.optimal.length * 5) +
      (seoData.keywordAnalysis.primary.length * 10) + 30
    );

    const engagementPrediction = Math.min(100,
      (seoData.optimizedDescription.readabilityScore * 0.4) +
      (seoData.optimizedTitle.hookStrength * 0.3) + 30
    );

    const searchabilityScore = Math.min(100,
      (seoData.keywordAnalysis.primary.length * 15) +
      (seoData.optimizedTitle.keywordDensity * 2) + 40
    );

    const platformCompatibility = Math.min(100,
      seoData.optimizedTitle.platformOptimized ? 50 : 30 +
      (seoData.hashtagAnalysis.optimal.length > 0 ? 30 : 0) + 20
    );

    return Promise.resolve({
      viralPotentialScore: Math.round(viralPotentialScore),
      engagementPrediction: Math.round(engagementPrediction),
      searchabilityScore: Math.round(searchabilityScore),
      platformCompatibility: Math.round(platformCompatibility)
    });
  }

  private generateRecommendations(seoData: any, request: SEOOptimizationRequest, constraints: PlatformConstraints): SEORecommendation[] {
    const recommendations: SEORecommendation[] = [];

    // Title recommendations
    if (seoData.optimizedTitle.hookStrength < 70) {
      recommendations.push({
        type: 'improvement',
        category: 'title',
        message: 'Consider adding more emotional triggers or numbers to your title',
        impact: 'high',
        actionable: true,
        implementation: 'Use words like "amazing", "secret", or add specific numbers'
      });
    }

    // Description recommendations
    if (seoData.optimizedDescription.readabilityScore < 60) {
      recommendations.push({
        type: 'improvement',
        category: 'description',
        message: 'Description could be more readable - consider shorter sentences',
        impact: 'medium',
        actionable: true,
        implementation: 'Break long sentences into shorter ones and use simpler words'
      });
    }

    // Hashtag recommendations
    if (seoData.hashtagAnalysis.optimal.length < 5) {
      recommendations.push({
        type: 'optimization',
        category: 'hashtags',
        message: 'Add more relevant hashtags to increase discoverability',
        impact: 'high',
        actionable: true,
        implementation: 'Use a mix of trending, niche, and broad hashtags'
      });
    }

    return recommendations;
  }

  // Utility methods
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private analyzeKeywordPlacement(text: string, keywords: string[]): KeywordPlacement[] {
    const placements: KeywordPlacement[] = [];
    
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        placements.push({
          keyword,
          position: match.index,
          prominence: match.index < text.length * 0.2 ? 'high' : match.index < text.length * 0.8 ? 'medium' : 'low',
          context: text.substring(Math.max(0, match.index - 30), Math.min(text.length, match.index + 30))
        });
      }
    }
    
    return placements;
  }

  private calculateReadabilityScore(text: string): number {
    const sentences = text.split(/[.!?]+/).length;
    const words = text.split(/\s+/).length;
    const avgWordsPerSentence = words / sentences;
    
    // Simple readability score (inverse of complexity)
    let score = 100;
    if (avgWordsPerSentence > 20) score -= 20;
    if (avgWordsPerSentence > 30) score -= 20;
    
    // Check for complex words
    const complexWords = text.split(/\s+/).filter(word => word.length > 12).length;
    score -= Math.min(complexWords * 2, 30);
    
    return Math.max(0, score);
  }

  private determineBestCategory(contentType: string, platform: string): string {
    const categories: { [key: string]: { [key: string]: string } } = {
      youtube: {
        educational: 'Education',
        entertainment: 'Entertainment', 
        marketing: 'Business',
        news: 'News & Politics'
      },
      tiktok: {
        educational: 'Education',
        entertainment: 'Entertainment',
        marketing: 'Business',
        news: 'News'
      }
    };
    
    return categories[platform]?.[contentType] || 'General';
  }

  private generateThumbnailSuggestions(request: SEOOptimizationRequest): ThumbnailSuggestion[] {
    const suggestions: ThumbnailSuggestion[] = [];
    
    // Base suggestions for different content types
    const baseStyles: { [key: string]: ThumbnailSuggestion } = {
      educational: {
        primaryText: request.content.topic.toUpperCase(),
        style: 'professional',
        colorPalette: ['#2E86AB', '#A23B72', '#F18F01'],
        emotionalTrigger: 'curiosity'
      },
      entertainment: {
        primaryText: 'AMAZING!',
        style: 'colorful',
        colorPalette: ['#FF6B35', '#F7931E', '#FFD23F'],
        emotionalTrigger: 'excitement'
      }
    };
    
    const base = baseStyles[request.contentType] || baseStyles.educational;
    suggestions.push(base);
    
    return suggestions;
  }

  private getOptimalPostingTimes(platform: string, audience: string): string[] {
    const times: { [key: string]: { [key: string]: string[] } } = {
      youtube: {
        general: ['14:00', '15:00', '16:00'],
        teens: ['15:00', '16:00', '17:00'],
        adults: ['12:00', '18:00', '20:00']
      },
      tiktok: {
        general: ['06:00', '10:00', '15:00', '18:00'],
        teens: ['15:00', '18:00', '21:00'],
        adults: ['07:00', '12:00', '18:00']
      }
    };
    
    return times[platform]?.[audience] || times.youtube.general;
  }

  private createFallbackSEOData(request: SEOOptimizationRequest): any {
    return {
      title: {
        primary: request.content.title || request.content.topic,
        alternatives: [],
        length: (request.content.title || request.content.topic).length,
        keywordDensity: 0,
        hookStrength: 50,
        platformOptimized: true
      },
      description: {
        short: `Learn about ${request.content.topic}`,
        long: `Discover everything you need to know about ${request.content.topic}. ${request.content.transcript.substring(0, 200)}...`,
        keywordOptimized: `${request.content.topic}: Learn about ${request.content.topic}`,
        length: 250,
        keywordPlacement: [],
        readabilityScore: 70
      },
      hashtags: {
        trending: [],
        niche: [],
        broad: [],
        optimal: [`#${request.content.topic.replace(/\s+/g, '')}`],
        performance: {}
      },
      keywords: {
        primary: [request.content.topic],
        secondary: [],
        longtail: [],
        searchVolume: {},
        semantic: []
      },
      metadata: {
        category: 'General',
        thumbnailSuggestions: [],
        postingTime: {
          optimal: ['12:00', '15:00', '18:00'],
          timezone: 'UTC',
          reasoning: 'Default posting times'
        }
      }
    };
  }

  private initializePlatformConstraints(): Map<string, PlatformConstraints> {
    const constraints = new Map<string, PlatformConstraints>();
    
    constraints.set('youtube', {
      title: { maxLength: 100, idealLength: 60 },
      description: { short: 125, long: 5000 },
      hashtags: { maxCount: 15 }
    });
    
    constraints.set('tiktok', {
      title: { maxLength: 100, idealLength: 50 },
      description: { short: 150, long: 2200 },
      hashtags: { maxCount: 10 }
    });
    
    constraints.set('instagram', {
      title: { maxLength: 125, idealLength: 65 },
      description: { short: 125, long: 2200 },
      hashtags: { maxCount: 30 }
    });
    
    constraints.set('general', {
      title: { maxLength: 100, idealLength: 60 },
      description: { short: 160, long: 1000 },
      hashtags: { maxCount: 10 }
    });
    
    return constraints;
  }

  // Cache management methods
  private async checkCache(request: SEOOptimizationRequest): Promise<SEOOptimizationResult | null> {
    const cacheKey = this.generateCacheKey(request);
    return await this.cacheService.get<SEOOptimizationResult>(cacheKey);
  }

  private async cacheResult(request: SEOOptimizationRequest, result: SEOOptimizationResult): Promise<void> {
    const cacheKey = this.generateCacheKey(request);
    const ttl = 1800; // 30 minutes
    await this.cacheService.set(cacheKey, result, ttl, ['seo_optimization']);
  }

  private generateCacheKey(request: SEOOptimizationRequest): string {
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify({
        topic: request.content.topic,
        transcript: request.content.transcript.substring(0, 200), // Truncate for cache key
        platform: request.platform,
        contentType: request.contentType,
        keywords: request.content.keywords
      }))
      .digest('hex');
    return `seo_optimization:${hash}`;
  }
}

interface PlatformConstraints {
  title: {
    maxLength: number;
    idealLength: number;
  };
  description: {
    short: number;
    long: number;
  };
  hashtags: {
    maxCount: number;
  };
}

class TrendingDataCache {
  private cache = new Map<string, { data: any; expiry: number }>();
  private readonly CACHE_DURATION = 3600000; // 1 hour

  async getTrending(platform: string, category: string): Promise<any> {
    const key = `${platform}:${category}`;
    const cached = this.cache.get(key);
    
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    
    // In production, fetch from trending APIs
    const mockData = { hashtags: [], keywords: [], topics: [] };
    
    this.cache.set(key, {
      data: mockData,
      expiry: Date.now() + this.CACHE_DURATION
    });
    
    return mockData;
  }
}