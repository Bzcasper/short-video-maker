import { logger } from "../logger";
import { GeneratedScript, Platform, ContentType } from "./ScriptTemplateEngine";

export interface ValidationRule {
  name: string;
  weight: number; // 0-1, contribution to overall score
  validator: (script: GeneratedScript) => ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  message: string;
  severity: "error" | "warning" | "info";
  suggestion?: string;
}

export interface EngagementMetrics {
  hookStrength: number; // 0-100
  pacing: number; // 0-100
  clarity: number; // 0-100
  callToActionEffectiveness: number; // 0-100
  visualAppeal: number; // 0-100
  platformOptimization: number; // 0-100
}

export interface ContentSafetyResult {
  safe: boolean;
  flaggedContent: string[];
  suggestions: string[];
  confidence: number; // 0-100
}

export interface PlatformOptimization {
  platform: Platform;
  scoreAdjustments: Record<string, number>;
  requiredElements: string[];
  penalties: string[];
}

export class ContentValidator {
  private rules: ValidationRule[] = [];
  private platformOptimizations: Map<Platform, PlatformOptimization> = new Map();
  private bannedWords: Set<string> = new Set();
  private engagementKeywords: Set<string> = new Set();

  constructor() {
    this.initializeRules();
    this.initializePlatformOptimizations();
    this.initializeContentFilters();
    this.initializeEngagementKeywords();
  }

  private initializeRules(): void {
    this.rules = [
      {
        name: "length_optimization",
        weight: 0.2,
        validator: this.validateLength.bind(this)
      },
      {
        name: "engagement_hooks", 
        weight: 0.25,
        validator: this.validateEngagementHooks.bind(this)
      },
      {
        name: "pacing_validation",
        weight: 0.15,
        validator: this.validatePacing.bind(this)
      },
      {
        name: "clarity_check",
        weight: 0.15,
        validator: this.validateClarity.bind(this)
      },
      {
        name: "call_to_action",
        weight: 0.1,
        validator: this.validateCallToAction.bind(this)
      },
      {
        name: "platform_optimization",
        weight: 0.15,
        validator: this.validatePlatformOptimization.bind(this)
      }
    ];
  }

  private initializePlatformOptimizations(): void {
    this.platformOptimizations.set(Platform.TIKTOK, {
      platform: Platform.TIKTOK,
      scoreAdjustments: {
        "quick_hook": 15,
        "trending_language": 10,
        "under_60_seconds": 20,
        "visual_cues": 10
      },
      requiredElements: ["hook_within_3_seconds"],
      penalties: ["over_60_seconds", "slow_start"]
    });

    this.platformOptimizations.set(Platform.YOUTUBE_SHORTS, {
      platform: Platform.YOUTUBE_SHORTS,
      scoreAdjustments: {
        "clear_title_hook": 10,
        "under_60_seconds": 15,
        "educational_value": 15,
        "subscribe_cta": 10
      },
      requiredElements: ["clear_value_proposition"],
      penalties: ["over_60_seconds", "unclear_purpose"]
    });

    this.platformOptimizations.set(Platform.INSTAGRAM_REELS, {
      platform: Platform.INSTAGRAM_REELS,
      scoreAdjustments: {
        "visual_appeal": 20,
        "hashtag_potential": 10,
        "story_arc": 15,
        "aesthetic_language": 5
      },
      requiredElements: ["visual_focus"],
      penalties: ["text_heavy", "poor_visual_description"]
    });
  }

  private initializeContentFilters(): void {
    // Basic content safety - in production, integrate with more sophisticated services
    this.bannedWords = new Set([
      // Add inappropriate content filters
      "violence", "hate", "discriminatory", 
      // Add platform-specific banned terms
      "spam", "fake", "misleading"
    ]);
  }

  private initializeEngagementKeywords(): void {
    this.engagementKeywords = new Set([
      // High engagement starters
      "discover", "secret", "amazing", "incredible", "shocking", "revealed",
      "ultimate", "proven", "guaranteed", "insider", "exclusive", "breaking",
      // Question words that drive engagement
      "what", "how", "why", "when", "where", "which", "who",
      // Action words
      "learn", "master", "unlock", "transform", "achieve", "create", "build"
    ]);
  }

  public async validateScript(script: GeneratedScript): Promise<GeneratedScript> {
    logger.debug({
      templateId: script.templateId,
      platform: script.platform,
      duration: script.content.estimatedDuration
    }, `Validating script ${script.id}`);

    const validationResults: ValidationResult[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    // Run all validation rules
    for (const rule of this.rules) {
      try {
        const result = rule.validator(script);
        validationResults.push({
          ...result,
          message: `[${rule.name}] ${result.message}`
        });
        
        totalScore += result.score * rule.weight;
        totalWeight += rule.weight;
      } catch (error) {
        logger.error({ error }, `Validation rule ${rule.name} failed:`);
        validationResults.push({
          passed: false,
          score: 0,
          message: `[${rule.name}] Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          severity: "error"
        });
      }
    }

    // Calculate final score
    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

    // Perform content safety check
    const safetyResult = await this.checkContentSafety(script);
    
    // Compile validation results
    const issues = validationResults
      .filter(r => r.severity === "error" || r.severity === "warning")
      .map(r => r.message);
    
    const recommendations = validationResults
      .filter(r => r.suggestion)
      .map(r => r.suggestion!);

    // Add safety issues
    if (!safetyResult.safe) {
      issues.push(...safetyResult.flaggedContent);
      recommendations.push(...safetyResult.suggestions);
    }

    // Update script validation
    script.validation = {
      isValid: safetyResult.safe && finalScore >= 60, // Minimum score threshold
      score: finalScore,
      issues,
      recommendations
    };

    logger.debug({
      score: finalScore,
      isValid: script.validation.isValid,
      issuesCount: issues.length
    }, `Validation complete for script ${script.id}`);

    return script;
  }

  private validateLength(script: GeneratedScript): ValidationResult {
    const { estimatedDuration } = script.content;
    const idealRange = script.platform ? this.getPlatformIdealLength(script.platform) : { min: 15, max: 60 };
    
    if (estimatedDuration < idealRange.min) {
      return {
        passed: false,
        score: Math.max(0, 100 - ((idealRange.min - estimatedDuration) * 10)),
        message: `Script too short (${Math.round(estimatedDuration)}s). Ideal: ${idealRange.min}-${idealRange.max}s`,
        severity: "warning",
        suggestion: "Add more detail or extend scenes to reach ideal length"
      };
    }
    
    if (estimatedDuration > idealRange.max) {
      return {
        passed: false,
        score: Math.max(0, 100 - ((estimatedDuration - idealRange.max) * 5)),
        message: `Script too long (${Math.round(estimatedDuration)}s). Ideal: ${idealRange.min}-${idealRange.max}s`,
        severity: "warning",
        suggestion: "Remove less essential scenes or trim content to fit ideal length"
      };
    }

    return {
      passed: true,
      score: 100,
      message: `Perfect length (${Math.round(estimatedDuration)}s)`,
      severity: "info"
    };
  }

  private validateEngagementHooks(script: GeneratedScript): ValidationResult {
    const firstScene = script.content.scenes[0];
    if (!firstScene) {
      return {
        passed: false,
        score: 0,
        message: "No opening scene found",
        severity: "error"
      };
    }

    const firstWords = firstScene.text.toLowerCase().split(' ').slice(0, 5);
    const hasEngagementWords = firstWords.some(word => this.engagementKeywords.has(word));
    const hasQuestionHook = firstScene.text.includes('?');
    const hasHookStructure = firstScene.hook?.position === "opening";
    
    let score = 30; // Base score
    
    if (hasEngagementWords) score += 25;
    if (hasQuestionHook) score += 20;
    if (hasHookStructure) score += 25;

    // Check if hook appears quickly (within first 3 seconds)
    if (firstScene.duration <= 3) score += 20;
    
    const passed = score >= 60;
    
    return {
      passed,
      score: Math.min(100, score),
      message: passed ? "Strong engagement hook detected" : "Weak opening hook",
      severity: passed ? "info" : "warning",
      suggestion: passed ? undefined : "Start with a question, surprising fact, or compelling statement within the first 3 seconds"
    };
  }

  private validatePacing(script: GeneratedScript): ValidationResult {
    const scenes = script.content.scenes;
    if (scenes.length === 0) {
      return {
        passed: false,
        score: 0,
        message: "No scenes to validate pacing",
        severity: "error"
      };
    }

    // Check for consistent pacing (scenes shouldn't be too long or too short)
    const avgSceneDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0) / scenes.length;
    const variance = scenes.reduce((sum, scene) => sum + Math.pow(scene.duration - avgSceneDuration, 2), 0) / scenes.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Good pacing has low variance in scene duration
    const pacingScore = Math.max(0, 100 - (standardDeviation * 20));
    
    // Check for appropriate scene count based on total duration
    const totalDuration = script.content.estimatedDuration;
    const idealScenesCount = Math.ceil(totalDuration / 10); // Roughly 10 seconds per scene
    const sceneCountVariance = Math.abs(scenes.length - idealScenesCount);
    const sceneCountScore = Math.max(0, 100 - (sceneCountVariance * 15));
    
    const finalScore = Math.round((pacingScore + sceneCountScore) / 2);
    const passed = finalScore >= 70;
    
    return {
      passed,
      score: finalScore,
      message: passed ? "Good pacing maintained throughout" : "Inconsistent pacing detected",
      severity: passed ? "info" : "warning",
      suggestion: passed ? undefined : "Balance scene lengths for better flow and maintain viewer attention"
    };
  }

  private validateClarity(script: GeneratedScript): ValidationResult {
    const { fullScript, wordCount } = script.content;
    
    // Check readability metrics
    const sentences = fullScript.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = sentences.length > 0 ? wordCount / sentences.length : 0;
    
    // Check for complex words (more than 2 syllables - simplified check)
    const complexWords = fullScript.split(/\s+/).filter(word => {
      const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
      return cleanWord.length > 6; // Approximation for complexity
    });
    const complexityRatio = complexWords.length / wordCount;
    
    // Scoring
    let score = 100;
    
    // Penalize very long sentences
    if (avgWordsPerSentence > 15) {
      score -= Math.min(30, (avgWordsPerSentence - 15) * 2);
    }
    
    // Penalize high complexity
    if (complexityRatio > 0.3) {
      score -= Math.min(25, (complexityRatio - 0.3) * 100);
    }
    
    // Check for jargon or technical terms that might confuse general audience
    const jargonWords = ["implement", "utilize", "facilitate", "optimize", "leverage"];
    const jargonCount = jargonWords.reduce((count, jargon) => {
      return count + (fullScript.toLowerCase().match(new RegExp(jargon, 'g')) || []).length;
    }, 0);
    
    if (jargonCount > wordCount * 0.05) { // More than 5% jargon
      score -= 15;
    }
    
    score = Math.max(0, Math.round(score));
    const passed = score >= 75;
    
    return {
      passed,
      score,
      message: passed ? "Clear and accessible language" : "Language clarity could be improved",
      severity: passed ? "info" : "warning",
      suggestion: passed ? undefined : "Simplify complex sentences and reduce technical jargon for better audience comprehension"
    };
  }

  private validateCallToAction(script: GeneratedScript): ValidationResult {
    const { fullScript, scenes } = script.content;
    const lastScene = scenes[scenes.length - 1];
    
    // Common CTA patterns
    const ctaPatterns = [
      /follow|subscribe|like|share|comment/i,
      /check out|visit|click/i,
      /let me know|tell me|what do you think/i,
      /try|download|get/i
    ];
    
    const hasCTA = ctaPatterns.some(pattern => pattern.test(fullScript));
    const hasEndingCTA = lastScene && ctaPatterns.some(pattern => pattern.test(lastScene.text));
    const hasClosingHook = lastScene?.hook?.position === "closing";
    
    let score = 20; // Base score
    
    if (hasCTA) score += 30;
    if (hasEndingCTA) score += 25;
    if (hasClosingHook) score += 25;
    
    const passed = score >= 60;
    
    return {
      passed,
      score: Math.min(100, score),
      message: passed ? "Effective call-to-action present" : "Missing or weak call-to-action",
      severity: passed ? "info" : "warning",
      suggestion: passed ? undefined : "Add a clear call-to-action at the end to encourage viewer engagement"
    };
  }

  private validatePlatformOptimization(script: GeneratedScript): ValidationResult {
    if (!script.platform) {
      return {
        passed: true,
        score: 80, // Neutral score for non-platform-specific scripts
        message: "No platform-specific optimization needed",
        severity: "info"
      };
    }

    const optimization = this.platformOptimizations.get(script.platform);
    if (!optimization) {
      return {
        passed: true,
        score: 80,
        message: `No optimization rules defined for ${script.platform}`,
        severity: "info"
      };
    }

    let score = 50; // Base score
    const { fullScript } = script.content;
    const issues: string[] = [];
    const benefits: string[] = [];

    // Apply score adjustments
    Object.entries(optimization.scoreAdjustments).forEach(([feature, adjustment]) => {
      const hasFeature = this.checkPlatformFeature(script, feature);
      if (hasFeature) {
        score += adjustment;
        benefits.push(feature.replace('_', ' '));
      }
    });

    // Check required elements
    optimization.requiredElements.forEach(element => {
      const hasElement = this.checkPlatformFeature(script, element);
      if (!hasElement) {
        score -= 20;
        issues.push(`Missing required ${element.replace('_', ' ')}`);
      }
    });

    // Check for penalties
    optimization.penalties.forEach(penalty => {
      const hasPenalty = this.checkPlatformFeature(script, penalty);
      if (hasPenalty) {
        score -= 15;
        issues.push(`Penalty: ${penalty.replace('_', ' ')}`);
      }
    });

    score = Math.max(0, Math.min(100, Math.round(score)));
    const passed = score >= 70;
    
    return {
      passed,
      score,
      message: passed 
        ? `Well optimized for ${script.platform}${benefits.length ? ` (${benefits.join(', ')})` : ''}` 
        : `Poor ${script.platform} optimization${issues.length ? `: ${issues.join(', ')}` : ''}`,
      severity: passed ? "info" : "warning",
      suggestion: passed ? undefined : `Optimize for ${script.platform} by addressing: ${issues.join(', ')}`
    };
  }

  private checkPlatformFeature(script: GeneratedScript, feature: string): boolean {
    const { fullScript, scenes, estimatedDuration } = script.content;
    const firstScene = scenes[0];
    
    switch (feature) {
      case "quick_hook":
        return firstScene && firstScene.duration <= 3;
      
      case "trending_language":
        const trendingWords = ["viral", "trending", "popular", "hot", "latest"];
        return trendingWords.some(word => fullScript.toLowerCase().includes(word));
      
      case "under_60_seconds":
        return estimatedDuration <= 60;
      
      case "over_60_seconds":
        return estimatedDuration > 60;
      
      case "visual_cues":
        const visualWords = ["see", "watch", "look", "visual", "show"];
        return visualWords.some(word => fullScript.toLowerCase().includes(word));
      
      case "hook_within_3_seconds":
        const hasHook = firstScene && firstScene.hook;
        return firstScene && firstScene.duration <= 3 && (!!hasHook || firstScene.text.includes('?'));
      
      case "clear_title_hook":
        return firstScene && (firstScene.text.includes('?') || firstScene.text.toLowerCase().startsWith('how'));
      
      case "educational_value":
        const eduWords = ["learn", "how", "why", "what", "tutorial", "guide", "tip"];
        return eduWords.some(word => fullScript.toLowerCase().includes(word));
      
      case "subscribe_cta":
        return /subscribe|follow/i.test(fullScript);
      
      case "visual_appeal":
        const visualAppealWords = ["beautiful", "stunning", "amazing", "incredible", "gorgeous"];
        return visualAppealWords.some(word => fullScript.toLowerCase().includes(word));
      
      case "hashtag_potential":
        // Check if content has hashtag-worthy words
        const hashtagWords = ["challenge", "trend", "style", "fashion", "food", "travel"];
        return hashtagWords.some(word => fullScript.toLowerCase().includes(word));
      
      case "story_arc":
        return scenes.length >= 3; // Beginning, middle, end
      
      case "slow_start":
        return firstScene && firstScene.duration > 5;
      
      case "text_heavy":
        return script.content.wordCount > estimatedDuration * 3; // More than 3 words per second
      
      default:
        return false;
    }
  }

  private getPlatformIdealLength(platform: Platform): { min: number; max: number } {
    switch (platform) {
      case Platform.TIKTOK:
        return { min: 15, max: 60 };
      case Platform.YOUTUBE_SHORTS:
        return { min: 15, max: 60 };
      case Platform.INSTAGRAM_REELS:
        return { min: 15, max: 90 };
      default:
        return { min: 15, max: 60 };
    }
  }

  private async checkContentSafety(script: GeneratedScript): Promise<ContentSafetyResult> {
    const { fullScript } = script.content;
    const flaggedContent: string[] = [];
    const suggestions: string[] = [];
    
    // Check for banned words
    const words = fullScript.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (this.bannedWords.has(word)) {
        flaggedContent.push(`Inappropriate content detected: "${word}"`);
        suggestions.push(`Remove or replace "${word}" with appropriate alternative`);
      }
    }

    // Check for potential misleading claims
    const misleadingPhrases = [
      /guaranteed to/i,
      /100% effective/i,
      /miracle/i,
      /instant results/i,
      /secret that doctors don't want you to know/i
    ];

    for (const phrase of misleadingPhrases) {
      if (phrase.test(fullScript)) {
        flaggedContent.push(`Potentially misleading claim detected`);
        suggestions.push("Avoid making unsubstantiated claims or guarantees");
      }
    }

    // Check for excessive promotional content
    const promoWords = ["buy", "purchase", "sale", "discount", "deal"];
    const promoCount = promoWords.reduce((count, word) => {
      return count + (fullScript.toLowerCase().match(new RegExp(word, 'g')) || []).length;
    }, 0);

    if (promoCount > script.content.wordCount * 0.1) { // More than 10% promotional
      flaggedContent.push("Excessive promotional content detected");
      suggestions.push("Reduce promotional language to provide more value to viewers");
    }

    return {
      safe: flaggedContent.length === 0,
      flaggedContent,
      suggestions,
      confidence: flaggedContent.length === 0 ? 95 : Math.max(50, 95 - (flaggedContent.length * 15))
    };
  }

  public async calculateEngagementMetrics(script: GeneratedScript): Promise<EngagementMetrics> {
    const hookStrength = await this.calculateHookStrength(script);
    const pacing = await this.calculatePacing(script);
    const clarity = await this.calculateClarity(script);
    const callToActionEffectiveness = await this.calculateCTAEffectiveness(script);
    const visualAppeal = await this.calculateVisualAppeal(script);
    const platformOptimization = await this.calculatePlatformOptimization(script);

    return {
      hookStrength,
      pacing,
      clarity,
      callToActionEffectiveness,
      visualAppeal,
      platformOptimization
    };
  }

  private async calculateHookStrength(script: GeneratedScript): Promise<number> {
    const result = this.validateEngagementHooks(script);
    return result.score;
  }

  private async calculatePacing(script: GeneratedScript): Promise<number> {
    const result = this.validatePacing(script);
    return result.score;
  }

  private async calculateClarity(script: GeneratedScript): Promise<number> {
    const result = this.validateClarity(script);
    return result.score;
  }

  private async calculateCTAEffectiveness(script: GeneratedScript): Promise<number> {
    const result = this.validateCallToAction(script);
    return result.score;
  }

  private async calculateVisualAppeal(script: GeneratedScript): Promise<number> {
    const { fullScript } = script.content;
    const visualWords = [
      "beautiful", "stunning", "amazing", "incredible", "gorgeous", "spectacular",
      "see", "watch", "look", "visual", "show", "display", "reveal", "appear"
    ];
    
    const visualWordCount = visualWords.reduce((count, word) => {
      return count + (fullScript.toLowerCase().match(new RegExp(word, 'g')) || []).length;
    }, 0);
    
    const visualRatio = visualWordCount / script.content.wordCount;
    return Math.min(100, Math.round(visualRatio * 500)); // Scale appropriately
  }

  private async calculatePlatformOptimization(script: GeneratedScript): Promise<number> {
    const result = this.validatePlatformOptimization(script);
    return result.score;
  }

  public getValidationRules(): ValidationRule[] {
    return [...this.rules];
  }

  public addValidationRule(rule: ValidationRule): void {
    this.rules.push(rule);
    logger.info(`Added validation rule: ${rule.name}`);
  }

  public removeValidationRule(name: string): boolean {
    const index = this.rules.findIndex(rule => rule.name === name);
    if (index !== -1) {
      this.rules.splice(index, 1);
      logger.info(`Removed validation rule: ${name}`);
      return true;
    }
    return false;
  }
}