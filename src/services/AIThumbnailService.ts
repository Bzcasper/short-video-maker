import { logger } from "../logger";
import { CacheService } from "./CacheService";
import crypto from "crypto";

export interface ThumbnailGenerationRequest {
  content: {
    title: string;
    topic: string;
    transcript?: string;
    scenes?: Array<{ text: string; visualCues: string[] }>;
  };
  style: {
    type: 'bold' | 'minimal' | 'colorful' | 'professional' | 'playful' | 'dark' | 'bright';
    mood: 'exciting' | 'calm' | 'urgent' | 'mysterious' | 'educational' | 'fun';
    colorScheme?: string[];
    fontStyle?: 'modern' | 'classic' | 'handwritten' | 'bold' | 'elegant';
  };
  platform: 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'general';
  branding?: {
    brandName?: string;
    logo?: string;
    brandColors?: string[];
    fonts?: string[];
  };
  options?: {
    generateVariations?: boolean;
    variationCount?: number;
    includeText?: boolean;
    textPlacement?: 'top' | 'center' | 'bottom' | 'overlay';
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
    resolution?: 'hd' | 'fullhd' | '4k';
    enableCache?: boolean;
  };
}

export interface ThumbnailGenerationResult {
  success: boolean;
  thumbnails: GeneratedThumbnail[];
  performanceMetrics: {
    clickabilityScore: number; // 0-100
    brandAlignment: number; // 0-100
    platformOptimization: number; // 0-100
    visualAppeal: number; // 0-100
  };
  recommendations: ThumbnailRecommendation[];
  processingTime: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface GeneratedThumbnail {
  id: string;
  url: string;
  prompt: string;
  style: ThumbnailStyle;
  text: ThumbnailText;
  dimensions: {
    width: number;
    height: number;
    aspectRatio: string;
  };
  metadata: {
    generator: string;
    generatedAt: Date;
    processingTime: number;
    seed?: number;
    model?: string;
  };
  scores: {
    clickability: number;
    readability: number;
    brandAlignment: number;
    platformFit: number;
  };
  variations?: ThumbnailVariation[];
}

export interface ThumbnailStyle {
  primaryColors: string[];
  secondaryColors: string[];
  gradients?: GradientInfo[];
  effects: string[];
  composition: 'centered' | 'left-aligned' | 'right-aligned' | 'split' | 'overlay';
  backgroundType: 'solid' | 'gradient' | 'pattern' | 'image' | 'blur';
}

export interface ThumbnailText {
  primary: {
    text: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold' | 'black';
    color: string;
    position: { x: number; y: number };
    shadow?: boolean;
    outline?: boolean;
  };
  secondary?: {
    text: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold' | 'black';
    color: string;
    position: { x: number; y: number };
  };
  callout?: {
    text: string;
    style: 'badge' | 'arrow' | 'circle' | 'banner';
    color: string;
    position: { x: number; y: number };
  };
}

export interface GradientInfo {
  direction: 'horizontal' | 'vertical' | 'diagonal' | 'radial';
  colors: string[];
  stops: number[];
}

export interface ThumbnailVariation {
  id: string;
  type: 'color' | 'text' | 'composition' | 'style';
  description: string;
  url: string;
  differences: string[];
}

export interface ThumbnailRecommendation {
  type: 'improvement' | 'optimization' | 'warning' | 'best-practice';
  category: 'text' | 'colors' | 'composition' | 'branding' | 'platform';
  message: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  implementation?: string;
}

export interface AIImageProvider {
  name: string;
  generate(prompt: string, options: ImageGenerationOptions): Promise<string>;
  isAvailable(): Promise<boolean>;
  estimateCost(options: ImageGenerationOptions): number;
}

export interface ImageGenerationOptions {
  width: number;
  height: number;
  style?: string;
  quality?: 'standard' | 'hd' | 'ultra';
  steps?: number;
  guidance?: number;
  seed?: number;
  model?: string;
}

export class AIThumbnailService {
  private cacheService: CacheService;
  private imageProviders: Map<string, AIImageProvider> = new Map();
  private templateLibrary: ThumbnailTemplate[];
  private performanceAnalyzer: ThumbnailPerformanceAnalyzer;

  constructor(cacheService: CacheService, imageProviders: AIImageProvider[]) {
    this.cacheService = cacheService;
    this.templateLibrary = this.initializeTemplates();
    this.performanceAnalyzer = new ThumbnailPerformanceAnalyzer();
    
    // Initialize image providers
    imageProviders.forEach(provider => {
      this.imageProviders.set(provider.name, provider);
    });
  }

  /**
   * Main thumbnail generation method
   */
  public async generateThumbnails(request: ThumbnailGenerationRequest): Promise<ThumbnailGenerationResult> {
    const startTime = Date.now();

    try {
      // Check cache
      if (request.options?.enableCache !== false) {
        const cached = await this.checkCache(request);
        if (cached) {
          logger.debug('Thumbnail generation cache hit');
          return { ...cached, processingTime: Date.now() - startTime };
        }
      }

      logger.info(`Generating thumbnails for: ${request.content.title}`);

      // Select appropriate template
      const template = this.selectTemplate(request);
      
      // Generate base thumbnail design
      const baseDesign = await this.createBaseDesign(request, template);
      
      // Generate primary thumbnail
      const primaryThumbnail = await this.generateThumbnail(baseDesign, request, 'primary');
      
      // Generate variations if requested
      const variations: GeneratedThumbnail[] = [];
      if (request.options?.generateVariations && request.options?.variationCount && request.options.variationCount > 1) {
        const variationCount = Math.min(request.options.variationCount - 1, 5); // Max 5 variations
        
        for (let i = 0; i < variationCount; i++) {
          const variation = await this.generateVariation(baseDesign, request, i);
          if (variation) {
            variations.push(variation);
          }
        }
      }

      const allThumbnails = [primaryThumbnail, ...variations];

      // Calculate performance metrics
      const performanceMetrics = this.calculatePerformanceMetrics(allThumbnails, request);

      // Generate recommendations
      const recommendations = this.generateRecommendations(allThumbnails, request, performanceMetrics);

      const result: ThumbnailGenerationResult = {
        success: true,
        thumbnails: allThumbnails,
        performanceMetrics,
        recommendations,
        processingTime: Date.now() - startTime
      };

      // Cache result
      if (request.options?.enableCache !== false) {
        await this.cacheResult(request, result);
      }

      logger.info(`Generated ${allThumbnails.length} thumbnails in ${result.processingTime}ms`);
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`Thumbnail generation failed: ${error instanceof Error ? error.message : String(error)}`);

      return {
        success: false,
        thumbnails: [],
        performanceMetrics: {
          clickabilityScore: 0,
          brandAlignment: 0,
          platformOptimization: 0,
          visualAppeal: 0
        },
        recommendations: [{
          type: 'warning',
          category: 'platform',
          message: 'Thumbnail generation failed - please try again or use manual design',
          impact: 'high',
          actionable: true,
          implementation: 'Retry generation with different parameters or create thumbnail manually'
        }],
        processingTime,
        error: {
          code: 'GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown generation error'
        }
      };
    }
  }

  /**
   * Select appropriate template based on request parameters
   */
  private selectTemplate(request: ThumbnailGenerationRequest): ThumbnailTemplate {
    const { platform, style, content } = request;
    
    // Filter templates by platform and style
    const candidates = this.templateLibrary.filter(template => 
      (template.platforms.includes(platform) || template.platforms.includes('all')) &&
      (template.styles.includes(style.type) || template.styles.includes('any')) &&
      template.contentTypes.includes(this.detectContentType(content.title, content.transcript || ''))
    );

    // Score templates based on fit
    const scored = candidates.map(template => ({
      template,
      score: this.scoreTemplateMatch(template, request)
    }));

    // Return best match or default
    const best = scored.sort((a, b) => b.score - a.score)[0];
    return best?.template || this.getDefaultTemplate();
  }

  private detectContentType(title: string, transcript: string): ContentCategory {
    const text = (title + ' ' + transcript).toLowerCase();
    
    // Educational content detection
    if (/how to|tutorial|guide|learn|education|explain|teach/i.test(text)) {
      return 'educational';
    }
    
    // Entertainment content detection
    if (/funny|comedy|entertainment|viral|amazing|incredible/i.test(text)) {
      return 'entertainment';
    }
    
    // Business/Marketing content detection
    if (/business|marketing|sales|profit|strategy|growth/i.test(text)) {
      return 'business';
    }
    
    // News content detection
    if (/news|breaking|update|report|analysis/i.test(text)) {
      return 'news';
    }
    
    return 'general';
  }

  private scoreTemplateMatch(template: ThumbnailTemplate, request: ThumbnailGenerationRequest): number {
    let score = 0;
    
    // Platform match (high weight)
    if (template.platforms.includes(request.platform)) score += 40;
    else if (template.platforms.includes('all')) score += 20;
    
    // Style match (medium weight)
    if (template.styles.includes(request.style.type)) score += 30;
    else if (template.styles.includes('any')) score += 15;
    
    // Content type match (medium weight)
    const contentType = this.detectContentType(request.content.title, request.content.transcript || '');
    if (template.contentTypes.includes(contentType)) score += 20;
    
    // Mood compatibility (low weight)
    if (template.moods.includes(request.style.mood)) score += 10;
    
    return score;
  }

  /**
   * Create base design specification
   */
  private async createBaseDesign(request: ThumbnailGenerationRequest, template: ThumbnailTemplate): Promise<ThumbnailDesign> {
    const { content, style, platform, options } = request;
    
    // Determine dimensions
    const dimensions = this.calculateDimensions(platform, options?.aspectRatio, options?.resolution);
    
    // Generate text elements
    const textElements = this.generateTextElements(content, template, dimensions);
    
    // Select color scheme
    const colors = this.selectColorScheme(style, request.branding);
    
    // Create composition
    const composition = this.createComposition(template, textElements, dimensions);
    
    // Generate AI prompt
    const aiPrompt = this.buildImagePrompt(content, style, template, colors, composition);
    
    return {
      prompt: aiPrompt,
      dimensions,
      colors,
      textElements,
      composition,
      template,
      metadata: {
        style: style.type,
        mood: style.mood,
        platform,
        aspectRatio: options?.aspectRatio || '16:9'
      }
    };
  }

  /**
   * Generate a single thumbnail from design specification
   */
  private async generateThumbnail(
    design: ThumbnailDesign, 
    request: ThumbnailGenerationRequest, 
    type: 'primary' | 'variation'
  ): Promise<GeneratedThumbnail> {
    const provider = await this.selectBestProvider(design);
    
    if (!provider) {
      throw new Error('No available image generation provider');
    }

    const generationOptions: ImageGenerationOptions = {
      width: design.dimensions.width,
      height: design.dimensions.height,
      quality: request.options?.resolution === '4k' ? 'ultra' : 'hd',
      style: design.metadata.style,
      steps: 50,
      guidance: 7.5
    };

    const imageUrl = await provider.generate(design.prompt, generationOptions);
    
    // Create text overlay data
    const thumbnailText = this.createTextOverlay(design, request);
    
    // Create style information
    const thumbnailStyle = this.createStyleInfo(design);
    
    // Calculate scores
    const scores = this.calculateThumbnailScores(design, request);

    return {
      id: this.generateId(),
      url: imageUrl,
      prompt: design.prompt,
      style: thumbnailStyle,
      text: thumbnailText,
      dimensions: {
        width: design.dimensions.width,
        height: design.dimensions.height,
        aspectRatio: design.metadata.aspectRatio
      },
      metadata: {
        generator: provider.name,
        generatedAt: new Date(),
        processingTime: 0, // Will be updated
        model: generationOptions.model
      },
      scores
    };
  }

  /**
   * Generate variation of base design
   */
  private async generateVariation(
    baseDesign: ThumbnailDesign, 
    request: ThumbnailGenerationRequest, 
    variationIndex: number
  ): Promise<GeneratedThumbnail | null> {
    try {
      // Create variation of the base design
      const variationDesign = this.createDesignVariation(baseDesign, variationIndex);
      
      const thumbnail = await this.generateThumbnail(variationDesign, request, 'variation');
      
      // Add variation metadata
      thumbnail.variations = [{
        id: `var_${variationIndex}`,
        type: this.getVariationType(variationIndex),
        description: this.getVariationDescription(variationIndex),
        url: thumbnail.url,
        differences: this.getVariationDifferences(baseDesign, variationDesign)
      }];

      return thumbnail;
    } catch (error) {
      logger.warn(`Failed to generate variation ${variationIndex}: ${error}`);
      return null;
    }
  }

  /**
   * Create variation of base design
   */
  private createDesignVariation(baseDesign: ThumbnailDesign, index: number): ThumbnailDesign {
    const variation = { ...baseDesign };
    
    switch (index % 4) {
      case 0: // Color variation
        variation.colors = this.generateColorVariation(baseDesign.colors);
        variation.prompt = this.modifyPromptForColors(baseDesign.prompt, variation.colors);
        break;
        
      case 1: // Text variation
        variation.textElements = this.generateTextVariation(baseDesign.textElements);
        variation.prompt = this.modifyPromptForText(baseDesign.prompt, variation.textElements);
        break;
        
      case 2: // Composition variation
        variation.composition = this.generateCompositionVariation(baseDesign.composition);
        variation.prompt = this.modifyPromptForComposition(baseDesign.prompt, variation.composition);
        break;
        
      case 3: // Style variation
        variation.prompt = this.generateStyleVariation(baseDesign.prompt);
        break;
    }
    
    return variation;
  }

  /**
   * Build AI image generation prompt
   */
  private buildImagePrompt(
    content: ThumbnailGenerationRequest['content'],
    style: ThumbnailGenerationRequest['style'],
    template: ThumbnailTemplate,
    colors: ColorScheme,
    composition: CompositionSpec
  ): string {
    let prompt = '';
    
    // Base scene description
    prompt += `Create a ${style.type} thumbnail image for "${content.title}". `;
    
    // Visual style
    prompt += `Style: ${style.type}, mood: ${style.mood}. `;
    
    // Color scheme
    prompt += `Colors: ${colors.primary.join(', ')} with ${colors.secondary.join(', ')} accents. `;
    
    // Composition
    prompt += `Composition: ${composition.layout}, ${composition.focus}. `;
    
    // Content-specific elements
    if (content.scenes && content.scenes.length > 0) {
      const visualCues = content.scenes
        .flatMap(scene => scene.visualCues)
        .slice(0, 3)
        .join(', ');
      prompt += `Visual elements: ${visualCues}. `;
    }
    
    // Template-specific additions
    prompt += `${template.promptModifiers.join(', ')}. `;
    
    // Quality and style modifiers
    prompt += 'High quality, professional design, eye-catching, clickable, ';
    prompt += 'perfect for social media, engaging, vibrant, clear, ';
    prompt += 'no text overlay, clean composition, modern design.';
    
    // Negative prompts
    prompt += ' | Avoid: blurry, low quality, text, watermarks, logos, cluttered, dark, boring.';
    
    return prompt;
  }

  /**
   * Calculate thumbnail performance metrics
   */
  private calculatePerformanceMetrics(
    thumbnails: GeneratedThumbnail[], 
    request: ThumbnailGenerationRequest
  ): ThumbnailGenerationResult['performanceMetrics'] {
    if (thumbnails.length === 0) {
      return {
        clickabilityScore: 0,
        brandAlignment: 0,
        platformOptimization: 0,
        visualAppeal: 0
      };
    }

    // Average scores across all thumbnails
    const avgScores = thumbnails.reduce((acc, thumbnail) => ({
      clickability: acc.clickability + thumbnail.scores.clickability,
      brandAlignment: acc.brandAlignment + thumbnail.scores.brandAlignment,
      platformFit: acc.platformFit + thumbnail.scores.platformFit,
      readability: acc.readability + thumbnail.scores.readability
    }), { clickability: 0, brandAlignment: 0, platformFit: 0, readability: 0 });

    const count = thumbnails.length;

    return {
      clickabilityScore: Math.round(avgScores.clickability / count),
      brandAlignment: Math.round(avgScores.brandAlignment / count),
      platformOptimization: Math.round(avgScores.platformFit / count),
      visualAppeal: Math.round(avgScores.readability / count)
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    thumbnails: GeneratedThumbnail[],
    request: ThumbnailGenerationRequest,
    metrics: ThumbnailGenerationResult['performanceMetrics']
  ): ThumbnailRecommendation[] {
    const recommendations: ThumbnailRecommendation[] = [];

    // Clickability recommendations
    if (metrics.clickabilityScore < 70) {
      recommendations.push({
        type: 'improvement',
        category: 'composition',
        message: 'Consider using brighter colors and more contrasting elements to improve clickability',
        impact: 'high',
        actionable: true,
        implementation: 'Try bold colors, larger text, or more dramatic visual elements'
      });
    }

    // Brand alignment recommendations
    if (request.branding && metrics.brandAlignment < 60) {
      recommendations.push({
        type: 'improvement',
        category: 'branding',
        message: 'Thumbnail could better reflect brand guidelines',
        impact: 'medium',
        actionable: true,
        implementation: 'Incorporate brand colors, fonts, or visual style more prominently'
      });
    }

    // Platform optimization recommendations
    if (metrics.platformOptimization < 75) {
      const platformTips: { [key: string]: string } = {
        youtube: 'Use larger text and brighter colors for better visibility in YouTube search results',
        tiktok: 'Consider more dynamic and energetic visual elements typical of TikTok content',
        instagram: 'Ensure the design works well in both feed and story formats'
      };

      recommendations.push({
        type: 'optimization',
        category: 'platform',
        message: `Optimize for ${request.platform} platform conventions`,
        impact: 'medium',
        actionable: true,
        implementation: platformTips[request.platform] || 'Follow platform-specific design guidelines'
      });
    }

    // Text readability recommendations
    const textIssues = thumbnails.filter(t => t.scores.readability < 60);
    if (textIssues.length > 0) {
      recommendations.push({
        type: 'improvement',
        category: 'text',
        message: 'Improve text readability with better contrast or positioning',
        impact: 'high',
        actionable: true,
        implementation: 'Use contrasting colors, add text shadows, or reposition text elements'
      });
    }

    return recommendations;
  }

  // Helper methods and utilities
  
  private calculateDimensions(platform: string, aspectRatio?: string, resolution?: string) {
    const ratios: { [key: string]: { [key: string]: [number, number] } } = {
      'youtube': { '16:9': [1280, 720], '16:10': [1280, 800] },
      'tiktok': { '9:16': [720, 1280], '1:1': [720, 720] },
      'instagram': { '1:1': [1080, 1080], '16:9': [1080, 608], '9:16': [1080, 1920] },
      'twitter': { '16:9': [1200, 675], '1:1': [1200, 1200] }
    };

    const platformRatios = ratios[platform] || ratios['youtube'];
    const ratio = aspectRatio || Object.keys(platformRatios)[0];
    let [width, height] = platformRatios[ratio] || [1280, 720];

    // Adjust for resolution
    if (resolution === '4k') {
      width *= 3;
      height *= 3;
    } else if (resolution === 'fullhd') {
      width = Math.max(width, 1920);
      height = Math.round(width * (height / width));
    }

    return { width, height };
  }

  private generateTextElements(
    content: ThumbnailGenerationRequest['content'],
    template: ThumbnailTemplate,
    dimensions: { width: number; height: number }
  ): TextElement[] {
    const elements: TextElement[] = [];
    
    // Primary text (usually the title)
    const title = this.optimizeTitleForThumbnail(content.title);
    elements.push({
      text: title,
      type: 'primary',
      position: template.textLayout.primary.position,
      size: this.calculateTextSize(title, dimensions.width, 'primary'),
      color: '#FFFFFF',
      weight: 'bold',
      shadow: true,
      outline: true
    });

    // Secondary text if needed
    if (template.textLayout.secondary && content.topic !== content.title) {
      elements.push({
        text: content.topic,
        type: 'secondary',
        position: template.textLayout.secondary.position,
        size: this.calculateTextSize(content.topic, dimensions.width, 'secondary'),
        color: '#FFFF00',
        weight: 'normal',
        shadow: false,
        outline: false
      });
    }

    return elements;
  }

  private optimizeTitleForThumbnail(title: string): string {
    // Keep title short and impactful for thumbnails
    if (title.length <= 30) return title;
    
    // Try to shorten while keeping key words
    const words = title.split(' ');
    if (words.length <= 4) return title;
    
    // Take first few words that fit
    let shortened = '';
    for (const word of words) {
      if ((shortened + ' ' + word).length <= 30) {
        shortened += (shortened ? ' ' : '') + word;
      } else {
        break;
      }
    }
    
    return shortened || title.substring(0, 27) + '...';
  }

  private calculateTextSize(text: string, containerWidth: number, type: 'primary' | 'secondary'): number {
    const baseSize = type === 'primary' ? containerWidth / 20 : containerWidth / 30;
    const lengthFactor = Math.max(0.6, 1 - (text.length / 100));
    return Math.round(baseSize * lengthFactor);
  }

  private selectColorScheme(
    style: ThumbnailGenerationRequest['style'],
    branding?: ThumbnailGenerationRequest['branding']
  ): ColorScheme {
    // Use brand colors if available
    if (branding?.brandColors && branding.brandColors.length > 0) {
      return {
        primary: branding.brandColors.slice(0, 2),
        secondary: branding.brandColors.slice(2, 4) || ['#FFFFFF', '#000000'],
        accent: ['#FFD700'] // Gold accent
      };
    }

    // Style-based color schemes
    const schemes: { [key: string]: ColorScheme } = {
      bold: {
        primary: ['#FF0000', '#FF6B00'],
        secondary: ['#FFFFFF', '#000000'],
        accent: ['#FFD700']
      },
      minimal: {
        primary: ['#2C3E50', '#34495E'],
        secondary: ['#ECF0F1', '#BDC3C7'],
        accent: ['#3498DB']
      },
      colorful: {
        primary: ['#E74C3C', '#F39C12'],
        secondary: ['#9B59B6', '#1ABC9C'],
        accent: ['#F1C40F']
      },
      professional: {
        primary: ['#2C3E50', '#3498DB'],
        secondary: ['#FFFFFF', '#95A5A6'],
        accent: ['#E67E22']
      }
    };

    return schemes[style.type] || schemes.bold;
  }

  private createComposition(
    template: ThumbnailTemplate,
    textElements: TextElement[],
    dimensions: { width: number; height: number }
  ): CompositionSpec {
    return {
      layout: template.composition.layout,
      focus: template.composition.focus,
      textArea: {
        x: 0.1 * dimensions.width,
        y: 0.1 * dimensions.height,
        width: 0.8 * dimensions.width,
        height: 0.3 * dimensions.height
      },
      imageArea: {
        x: 0,
        y: 0.4 * dimensions.height,
        width: dimensions.width,
        height: 0.6 * dimensions.height
      }
    };
  }

  private createTextOverlay(design: ThumbnailDesign, request: ThumbnailGenerationRequest): ThumbnailText {
    const primary = design.textElements.find(e => e.type === 'primary');
    const secondary = design.textElements.find(e => e.type === 'secondary');

    if (!primary) {
      throw new Error('Primary text element is required');
    }

    return {
      primary: {
        text: primary.text,
        fontSize: primary.size,
        fontWeight: primary.weight === 'bold' ? 'bold' : 'normal',
        color: primary.color,
        position: { x: primary.position.x, y: primary.position.y },
        shadow: primary.shadow,
        outline: primary.outline
      },
      secondary: secondary ? {
        text: secondary.text,
        fontSize: secondary.size,
        fontWeight: secondary.weight === 'bold' ? 'bold' : 'normal',
        color: secondary.color,
        position: { x: secondary.position.x, y: secondary.position.y }
      } : undefined
    };
  }

  private createStyleInfo(design: ThumbnailDesign): ThumbnailStyle {
    return {
      primaryColors: design.colors.primary,
      secondaryColors: design.colors.secondary,
      effects: ['shadow', 'gradient'],
      composition: design.composition.layout as any,
      backgroundType: 'gradient'
    };
  }

  private calculateThumbnailScores(design: ThumbnailDesign, request: ThumbnailGenerationRequest) {
    return {
      clickability: this.scoreClickability(design, request),
      readability: this.scoreReadability(design),
      brandAlignment: this.scoreBrandAlignment(design, request.branding),
      platformFit: this.scorePlatformFit(design, request.platform)
    };
  }

  private scoreClickability(design: ThumbnailDesign, request: ThumbnailGenerationRequest): number {
    let score = 70; // Base score

    // Color contrast
    if (this.hasGoodContrast(design.colors)) score += 15;

    // Text length (shorter is better for thumbnails)
    const titleLength = design.textElements.find(e => e.type === 'primary')?.text.length || 50;
    if (titleLength <= 30) score += 10;

    // Emotional appeal
    if (this.hasEmotionalTriggers(request.content.title)) score += 5;

    return Math.min(100, score);
  }

  private scoreReadability(design: ThumbnailDesign): number {
    let score = 60;

    const primaryText = design.textElements.find(e => e.type === 'primary');
    if (!primaryText) return 0;

    // Text size
    if (primaryText.size >= 40) score += 20;

    // Text effects
    if (primaryText.shadow || primaryText.outline) score += 15;

    // Color contrast
    if (this.isReadableColor(primaryText.color, design.colors.primary[0])) score += 5;

    return Math.min(100, score);
  }

  private scoreBrandAlignment(design: ThumbnailDesign, branding?: ThumbnailGenerationRequest['branding']): number {
    if (!branding) return 85; // Good default if no branding specified

    let score = 50;

    // Brand colors
    if (branding.brandColors) {
      const colorMatch = branding.brandColors.some(brandColor =>
        design.colors.primary.includes(brandColor) || design.colors.secondary.includes(brandColor)
      );
      if (colorMatch) score += 30;
    } else {
      score += 20; // No brand colors to match
    }

    // Brand consistency
    score += 20; // Assume consistent style

    return Math.min(100, score);
  }

  private scorePlatformFit(design: ThumbnailDesign, platform: string): number {
    let score = 60;

    const platformBonus: { [key: string]: number } = {
      youtube: design.colors.primary.some(c => this.isBrightColor(c)) ? 25 : 10,
      tiktok: design.metadata.mood === 'exciting' ? 30 : 15,
      instagram: design.metadata.style === 'colorful' ? 25 : 15,
      twitter: design.textElements.length <= 2 ? 20 : 10
    };

    score += platformBonus[platform] || 15;

    return Math.min(100, score);
  }

  // Utility methods
  private hasGoodContrast(colors: ColorScheme): boolean {
    // Simplified contrast check
    return colors.primary.length > 0 && colors.secondary.length > 0;
  }

  private hasEmotionalTriggers(title: string): boolean {
    const triggers = /amazing|incredible|shocking|secret|ultimate|best|worst|revealed/i;
    return triggers.test(title);
  }

  private isReadableColor(textColor: string, backgroundColor: string): boolean {
    // Simplified readability check
    return textColor !== backgroundColor;
  }

  private isBrightColor(color: string): boolean {
    // Simplified brightness check
    return ['#FF', '#00FF', '#FFFF'].some(bright => color.includes(bright));
  }

  private async selectBestProvider(design: ThumbnailDesign): Promise<AIImageProvider | null> {
    const availableProviders = [];
    
    for (const [name, provider] of this.imageProviders) {
      if (await provider.isAvailable()) {
        availableProviders.push({ name, provider });
      }
    }

    // Simple selection - return first available
    return availableProviders[0]?.provider || null;
  }

  private generateId(): string {
    return `thumb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Template and variation methods
  private initializeTemplates(): ThumbnailTemplate[] {
    return [
      {
        id: 'youtube-educational',
        name: 'YouTube Educational',
        platforms: ['youtube'],
        styles: ['professional', 'minimal'],
        contentTypes: ['educational', 'general'],
        moods: ['educational', 'calm'],
        composition: {
          layout: 'centered',
          focus: 'text'
        },
        textLayout: {
          primary: {
            position: { x: 0.1, y: 0.1 },
            maxLines: 2
          }
        },
        promptModifiers: [
          'clean professional layout',
          'educational style',
          'clear typography'
        ]
      },
      {
        id: 'tiktok-viral',
        name: 'TikTok Viral',
        platforms: ['tiktok'],
        styles: ['bold', 'colorful'],
        contentTypes: ['entertainment', 'general'],
        moods: ['exciting', 'fun'],
        composition: {
          layout: 'dynamic',
          focus: 'visual'
        },
        textLayout: {
          primary: {
            position: { x: 0.1, y: 0.7 },
            maxLines: 1
          }
        },
        promptModifiers: [
          'dynamic energetic composition',
          'viral-style design',
          'eye-catching elements'
        ]
      }
      // More templates would be added here
    ];
  }

  private getDefaultTemplate(): ThumbnailTemplate {
    return {
      id: 'default',
      name: 'Default',
      platforms: ['all'],
      styles: ['any'],
      contentTypes: ['general'],
      moods: ['calm'],
      composition: {
        layout: 'centered',
        focus: 'balanced'
      },
      textLayout: {
        primary: {
          position: { x: 0.1, y: 0.1 },
          maxLines: 2
        }
      },
      promptModifiers: ['clean design', 'professional look']
    };
  }

  private generateColorVariation(baseColors: ColorScheme): ColorScheme {
    // Simple color variation logic
    return {
      ...baseColors,
      primary: baseColors.secondary,
      secondary: baseColors.primary
    };
  }

  private generateTextVariation(baseElements: TextElement[]): TextElement[] {
    return baseElements.map(element => ({
      ...element,
      weight: element.weight === 'bold' ? 'normal' : 'bold'
    }));
  }

  private generateCompositionVariation(baseComposition: CompositionSpec): CompositionSpec {
    const layouts: Array<CompositionSpec['layout']> = ['centered', 'left-aligned', 'right-aligned'];
    const currentIndex = layouts.indexOf(baseComposition.layout);
    const nextIndex = (currentIndex + 1) % layouts.length;

    return {
      ...baseComposition,
      layout: layouts[nextIndex]
    };
  }

  private generateStyleVariation(basePrompt: string): string {
    const styleModifiers = ['vibrant', 'dramatic', 'elegant', 'modern'];
    const randomModifier = styleModifiers[Math.floor(Math.random() * styleModifiers.length)];
    return basePrompt.replace(/Style: \w+/, `Style: ${randomModifier}`);
  }

  private modifyPromptForColors(prompt: string, colors: ColorScheme): string {
    return prompt.replace(/Colors: [^.]+\./, `Colors: ${colors.primary.join(', ')} with ${colors.secondary.join(', ')} accents.`);
  }

  private modifyPromptForText(prompt: string, textElements: TextElement[]): string {
    return prompt + ` Text style: ${textElements[0]?.weight || 'normal'} weight.`;
  }

  private modifyPromptForComposition(prompt: string, composition: CompositionSpec): string {
    return prompt.replace(/Composition: [^.]+\./, `Composition: ${composition.layout}, ${composition.focus}.`);
  }

  private getVariationType(index: number): ThumbnailVariation['type'] {
    const types: ThumbnailVariation['type'][] = ['color', 'text', 'composition', 'style'];
    return types[index % types.length];
  }

  private getVariationDescription(index: number): string {
    const descriptions = [
      'Alternative color scheme',
      'Different text styling',
      'Modified composition layout',
      'Alternative visual style'
    ];
    return descriptions[index % descriptions.length];
  }

  private getVariationDifferences(base: ThumbnailDesign, variation: ThumbnailDesign): string[] {
    const differences: string[] = [];
    
    if (JSON.stringify(base.colors) !== JSON.stringify(variation.colors)) {
      differences.push('Color scheme modified');
    }
    
    if (JSON.stringify(base.textElements) !== JSON.stringify(variation.textElements)) {
      differences.push('Text styling changed');
    }
    
    if (JSON.stringify(base.composition) !== JSON.stringify(variation.composition)) {
      differences.push('Composition layout adjusted');
    }
    
    return differences;
  }

  // Cache methods
  private async checkCache(request: ThumbnailGenerationRequest): Promise<ThumbnailGenerationResult | null> {
    const cacheKey = this.generateCacheKey(request);
    return await this.cacheService.get<ThumbnailGenerationResult>(cacheKey);
  }

  private async cacheResult(request: ThumbnailGenerationRequest, result: ThumbnailGenerationResult): Promise<void> {
    const cacheKey = this.generateCacheKey(request);
    const ttl = 7200; // 2 hours
    await this.cacheService.set(cacheKey, result, ttl, ['thumbnails']);
  }

  private generateCacheKey(request: ThumbnailGenerationRequest): string {
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify({
        title: request.content.title,
        style: request.style,
        platform: request.platform,
        options: request.options
      }))
      .digest('hex');
    return `thumbnail:${hash}`;
  }
}

// Supporting interfaces and classes

type ContentCategory = 'educational' | 'entertainment' | 'business' | 'news' | 'general';

interface ThumbnailTemplate {
  id: string;
  name: string;
  platforms: string[];
  styles: string[];
  contentTypes: ContentCategory[];
  moods: string[];
  composition: {
    layout: 'centered' | 'left-aligned' | 'right-aligned' | 'split' | 'dynamic';
    focus: 'text' | 'visual' | 'balanced';
  };
  textLayout: {
    primary: {
      position: { x: number; y: number };
      maxLines: number;
    };
    secondary?: {
      position: { x: number; y: number };
      maxLines: number;
    };
  };
  promptModifiers: string[];
}

interface ThumbnailDesign {
  prompt: string;
  dimensions: { width: number; height: number };
  colors: ColorScheme;
  textElements: TextElement[];
  composition: CompositionSpec;
  template: ThumbnailTemplate;
  metadata: {
    style: string;
    mood: string;
    platform: string;
    aspectRatio: string;
  };
}

interface ColorScheme {
  primary: string[];
  secondary: string[];
  accent: string[];
}

interface TextElement {
  text: string;
  type: 'primary' | 'secondary' | 'callout';
  position: { x: number; y: number };
  size: number;
  color: string;
  weight: 'normal' | 'bold';
  shadow: boolean;
  outline: boolean;
}

interface CompositionSpec {
  layout: 'centered' | 'left-aligned' | 'right-aligned' | 'split' | 'dynamic';
  focus: 'text' | 'visual' | 'balanced';
  textArea: { x: number; y: number; width: number; height: number };
  imageArea: { x: number; y: number; width: number; height: number };
}

class ThumbnailPerformanceAnalyzer {
  analyzePerformance(thumbnails: GeneratedThumbnail[]): any {
    // Placeholder for performance analysis
    return {
      averageScore: 75,
      recommendations: []
    };
  }
}