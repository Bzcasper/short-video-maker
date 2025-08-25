import { logger } from "../logger";
import { CacheService } from "./CacheService";
import { PromptTemplateService } from "./PromptTemplateService";
import {
  ScriptGenerationRequest,
  ScriptGenerationResult,
  QualityValidationResult,
  QualityScoreEnum,
  ContentComplexityEnum,
  validateScriptGenerationRequest,
  validateScriptGenerationResult
} from "../schemas/PromptSchema";
import { SceneInput } from "../types/shorts";
import crypto from "crypto";

export interface QualityValidator {
  validateCoherence(text: string): Promise<number>;
  validateEngagement(text: string): Promise<number>;
  validateClarity(text: string): Promise<number>;
  validateRelevance(text: string, context?: any): Promise<number>;
  validateCreativity(text: string): Promise<number>;
}

export interface ScriptGeneratorOptions {
  enableCache?: boolean;
  enableQualityValidation?: boolean;
  maxRetries?: number;
  qualityThreshold?: QualityScoreEnum;
  generateVariations?: boolean;
  variationCount?: number;
}

export class ScriptGeneratorService {
  private cacheService: CacheService;
  private templateService: PromptTemplateService;
  private qualityValidator: QualityValidator;
  private readonly GENERATION_CACHE_PREFIX = "script_gen:";
  private readonly QUALITY_CACHE_PREFIX = "quality:";

  constructor(
    cacheService: CacheService,
    templateService: PromptTemplateService,
    qualityValidator?: QualityValidator
  ) {
    this.cacheService = cacheService;
    this.templateService = templateService;
    this.qualityValidator = qualityValidator || new DefaultQualityValidator();
  }

  /**
   * Generate script from template with full validation and caching
   */
  public async generateScript(request: ScriptGenerationRequest): Promise<ScriptGenerationResult> {
    const startTime = Date.now();
    let processingTimeMs = 0;

    try {
      // Validate request
      const validatedRequest = validateScriptGenerationRequest(request);
      const { templateId, variables, options = {}, context } = validatedRequest;

      // Create cache key from request fingerprint
      const requestFingerprint = this.generateRequestFingerprint(validatedRequest);
      const cacheKey = `${this.GENERATION_CACHE_PREFIX}${requestFingerprint}`;

      // Check cache if enabled
      if (options.useCache !== false) {
        const cached = await this.cacheService.get<ScriptGenerationResult>(cacheKey);
        if (cached) {
          logger.debug(`Script generation cache hit for template: ${templateId}`);
          return cached;
        }
      }

      // Get template
      const template = await this.templateService.getTemplate(templateId);
      if (!template) {
        return this.createErrorResult(
          'TEMPLATE_NOT_FOUND',
          `Template not found: ${templateId}`,
          false
        );
      }

      // Perform variable substitution
      const substitutionResult = await this.templateService.substituteVariables(
        templateId,
        variables,
        { strict: true }
      );

      if (substitutionResult.errors.length > 0) {
        return this.createErrorResult(
          'VARIABLE_SUBSTITUTION_ERROR',
          `Variable substitution failed: ${substitutionResult.errors.join(', ')}`,
          true,
          { missingVariables: substitutionResult.missingVariables }
        );
      }

      // Generate main script
      let mainScript: ScriptGenerationResult;
      let attempt = 0;
      const maxRetries = options.maxRetries || 3;

      while (attempt <= maxRetries) {
        try {
          mainScript = await this.generateScriptFromPrompt(
            substitutionResult.result,
            template,
            context.requestId
          );

          // Quality validation if enabled
          if (options.enableQualityValidation !== false) {
            const qualityResult = await this.validateScriptQuality(
              mainScript.script!,
              options.qualityThreshold || QualityScoreEnum.good
            );

            mainScript.qualityValidation = qualityResult;

            // Check if quality meets threshold
            if (!qualityResult.passesThreshold && attempt < maxRetries) {
              logger.warn(`Quality validation failed for template ${templateId}, retrying (attempt ${attempt + 1})`);
              attempt++;
              continue;
            }
          }

          break;

        } catch (error) {
          attempt++;
          logger.warn(`Script generation attempt ${attempt} failed for template ${templateId}:`, error);
          
          if (attempt > maxRetries) {
            return this.createErrorResult(
              'GENERATION_FAILED',
              `Script generation failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
              true
            );
          }
        }
      }

      // Generate variations if requested
      let variations: ScriptGenerationResult['variations'] = [];
      if (options.generateVariations && options.variationCount && options.variationCount > 1) {
        variations = await this.generateScriptVariations(
          substitutionResult.result,
          template,
          options.variationCount - 1, // -1 because main script counts as one
          context.requestId
        );
      }

      // Prepare final result
      processingTimeMs = Date.now() - startTime;
      const result: ScriptGenerationResult = {
        success: true,
        script: mainScript!.script,
        qualityValidation: mainScript!.qualityValidation,
        variations,
        cacheInfo: {
          hit: false,
          key: cacheKey
        }
      };

      // Update template metrics
      const qualityScore = mainScript!.qualityValidation?.overallScore;
      await this.templateService.updateTemplateMetrics(
        templateId,
        true,
        qualityScore ? this.qualityScoreToNumber(qualityScore) : undefined,
        processingTimeMs
      );

      // Cache result if enabled
      if (options.cacheResults !== false) {
        const cacheTtl = this.calculateCacheTtl(template.complexity, processingTimeMs);
        await this.cacheService.set(
          cacheKey,
          result,
          cacheTtl,
          [`template:${templateId}`, 'script_generation']
        );
      }

      const validatedResult = validateScriptGenerationResult(result);
      logger.info(`Script generated successfully for template ${templateId} in ${processingTimeMs}ms`);
      
      return validatedResult;

    } catch (error) {
      processingTimeMs = Date.now() - startTime;
      logger.error(`Script generation error:`, error);
      
      // Update template metrics for failure
      if (request.templateId) {
        await this.templateService.updateTemplateMetrics(
          request.templateId,
          false,
          undefined,
          processingTimeMs
        );
      }

      return this.createErrorResult(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'Unknown error occurred',
        true
      );
    }
  }

  /**
   * Validate script quality using multiple criteria
   */
  public async validateScriptQuality(
    script: any,
    threshold: QualityScoreEnum
  ): Promise<QualityValidationResult> {
    const startTime = Date.now();

    try {
      // Extract text content for validation
      const textContent = this.extractTextFromScript(script);
      
      // Check cache first
      const contentHash = crypto.createHash('sha256').update(textContent).digest('hex');
      const cacheKey = `${this.QUALITY_CACHE_PREFIX}${contentHash}`;
      
      const cached = await this.cacheService.get<QualityValidationResult>(cacheKey);
      if (cached) {
        return cached;
      }

      // Perform quality validation
      const [coherence, engagement, clarity, relevance, creativity] = await Promise.all([
        this.qualityValidator.validateCoherence(textContent),
        this.qualityValidator.validateEngagement(textContent),
        this.qualityValidator.validateClarity(textContent),
        this.qualityValidator.validateRelevance(textContent),
        this.qualityValidator.validateCreativity(textContent)
      ]);

      // Calculate overall score
      const averageScore = (coherence + engagement + clarity + relevance + creativity) / 5;
      const overallScore = this.numberToQualityScore(averageScore);

      // Generate feedback
      const feedback = this.generateQualityFeedback({
        coherence,
        engagement, 
        clarity,
        relevance,
        creativity
      });

      // Generate improvement suggestions
      const improvementSuggestions = this.generateImprovementSuggestions({
        coherence,
        engagement,
        clarity,
        relevance,
        creativity
      });

      const result: QualityValidationResult = {
        overallScore,
        scores: {
          coherence,
          engagement,
          clarity,
          relevance,
          creativity
        },
        feedback,
        passesThreshold: this.qualityScoreToNumber(overallScore) >= this.qualityScoreToNumber(threshold),
        improvementSuggestions,
        metadata: {
          validatedAt: new Date().toISOString(),
          validatorVersion: "1.0.0",
          processingTimeMs: Date.now() - startTime,
          confidenceLevel: this.calculateConfidenceLevel(averageScore)
        }
      };

      // Cache result for 1 hour
      await this.cacheService.set(cacheKey, result, 3600, ['quality_validation']);

      return result;

    } catch (error) {
      logger.error(`Quality validation error:`, error);
      
      // Return default validation result
      return {
        overallScore: QualityScoreEnum.fair,
        scores: {
          coherence: 2,
          engagement: 2,
          clarity: 2,
          relevance: 2,
          creativity: 2
        },
        feedback: [{
          type: 'error',
          message: 'Quality validation failed',
          severity: 'medium',
          suggestion: 'Please review the script manually'
        }],
        passesThreshold: false,
        improvementSuggestions: ['Review script content manually'],
        metadata: {
          validatedAt: new Date().toISOString(),
          validatorVersion: "1.0.0",
          processingTimeMs: Date.now() - startTime,
          confidenceLevel: 0.5
        }
      };
    }
  }

  /**
   * Generate script from prompt text
   */
  private async generateScriptFromPrompt(
    prompt: string,
    template: any,
    requestId: string
  ): Promise<ScriptGenerationResult> {
    try {
      // This is a simplified script generation
      // In a real implementation, you would call an AI service like OpenAI, Claude, etc.
      const scenes = await this.parsePromptIntoScenes(prompt, template);
      
      if (!scenes || scenes.length === 0) {
        throw new Error('No scenes generated from prompt');
      }

      const script = {
        scenes,
        totalScenes: scenes.length,
        estimatedDuration: scenes.length * 10, // Assume 10 seconds per scene
        metadata: {
          templateId: template.id,
          generatedAt: new Date().toISOString(),
          processingTimeMs: 0, // Will be updated by caller
          version: "1.0.0",
          fingerprint: crypto.createHash('sha256').update(JSON.stringify(scenes)).digest('hex')
        }
      };

      return {
        success: true,
        script
      };

    } catch (error) {
      logger.error(`Failed to generate script from prompt:`, error);
      throw error;
    }
  }

  /**
   * Generate script variations
   */
  private async generateScriptVariations(
    prompt: string,
    template: any,
    count: number,
    requestId: string
  ): Promise<any[]> {
    const variations = [];

    for (let i = 0; i < count; i++) {
      try {
        // Add variation prompts to create different versions
        const variationPrompt = this.addVariationToPrompt(prompt, i + 1);
        const variationScript = await this.generateScriptFromPrompt(variationPrompt, template, requestId);
        
        if (variationScript.success && variationScript.script) {
          // Quick quality check for variation
          const qualityResult = await this.validateScriptQuality(variationScript.script, QualityScoreEnum.fair);
          
          variations.push({
            id: `var_${i + 1}`,
            script: variationScript.script,
            qualityScore: qualityResult.overallScore,
            differences: [`Variation ${i + 1} with modified approach`]
          });
        }
      } catch (error) {
        logger.warn(`Failed to generate variation ${i + 1}:`, error);
      }
    }

    return variations;
  }

  /**
   * Parse prompt into scene objects
   */
  private async parsePromptIntoScenes(prompt: string, template: any): Promise<SceneInput[]> {
    // This is a simplified implementation
    // In production, you'd use AI to parse the prompt intelligently
    
    const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const scenes: SceneInput[] = [];
    
    for (let i = 0; i < Math.min(sentences.length, 5); i++) { // Max 5 scenes
      const sentence = sentences[i].trim();
      if (sentence.length > 10) { // Minimum sentence length
        scenes.push({
          text: sentence,
          searchTerms: this.extractSearchTermsFromText(sentence)
        });
      }
    }

    // Ensure we have at least one scene
    if (scenes.length === 0) {
      scenes.push({
        text: prompt.substring(0, 200), // Truncate if too long
        searchTerms: this.extractSearchTermsFromText(prompt)
      });
    }

    return scenes;
  }

  /**
   * Extract search terms from text
   */
  private extractSearchTermsFromText(text: string): string[] {
    // Simple keyword extraction - in production use NLP
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));
    
    return [...new Set(words)].slice(0, 3); // Max 3 unique search terms
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'and', 'but', 'for', 'are', 'with', 'this', 'that', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time'];
    return stopWords.includes(word.toLowerCase());
  }

  /**
   * Add variation to prompt for generating different versions
   */
  private addVariationToPrompt(prompt: string, variationNumber: number): string {
    const variations = [
      "Create a more engaging version: ",
      "Make this more informative: ",
      "Add more creativity to: ",
      "Simplify this content: ",
      "Make this more dramatic: "
    ];
    
    const variation = variations[variationNumber % variations.length];
    return `${variation}${prompt}`;
  }

  /**
   * Generate quality feedback based on scores
   */
  private generateQualityFeedback(scores: any): any[] {
    const feedback = [];
    
    if (scores.coherence < 3) {
      feedback.push({
        type: 'warning',
        message: 'Content coherence could be improved',
        severity: 'medium',
        field: 'coherence',
        suggestion: 'Consider improving the logical flow between scenes'
      });
    }
    
    if (scores.engagement < 3) {
      feedback.push({
        type: 'suggestion',
        message: 'Content could be more engaging',
        severity: 'low',
        field: 'engagement',
        suggestion: 'Add more compelling hooks or interesting elements'
      });
    }
    
    if (scores.clarity < 3) {
      feedback.push({
        type: 'warning',
        message: 'Content clarity needs improvement',
        severity: 'high',
        field: 'clarity',
        suggestion: 'Simplify language and structure'
      });
    }

    return feedback;
  }

  /**
   * Generate improvement suggestions
   */
  private generateImprovementSuggestions(scores: any): string[] {
    const suggestions = [];
    
    if (scores.coherence < 3) {
      suggestions.push("Improve logical flow between scenes");
    }
    if (scores.engagement < 3) {
      suggestions.push("Add more engaging content or hooks");
    }
    if (scores.clarity < 3) {
      suggestions.push("Simplify language and improve clarity");
    }
    if (scores.creativity < 3) {
      suggestions.push("Add more creative elements or unique perspectives");
    }

    return suggestions;
  }

  /**
   * Helper methods
   */
  private generateRequestFingerprint(request: ScriptGenerationRequest): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({
      templateId: request.templateId,
      variables: request.variables,
      options: request.options
    }));
    return hash.digest('hex');
  }

  private createErrorResult(code: string, message: string, retryable: boolean, details?: any): ScriptGenerationResult {
    return {
      success: false,
      error: {
        code,
        message,
        details,
        retryable
      }
    };
  }

  private extractTextFromScript(script: any): string {
    if (!script?.scenes) return '';
    return script.scenes.map((scene: any) => scene.text || '').join(' ');
  }

  private qualityScoreToNumber(score: QualityScoreEnum): number {
    return score as number;
  }

  private numberToQualityScore(score: number): QualityScoreEnum {
    if (score >= 4.5) return QualityScoreEnum.outstanding;
    if (score >= 3.5) return QualityScoreEnum.excellent;
    if (score >= 2.5) return QualityScoreEnum.good;
    if (score >= 1.5) return QualityScoreEnum.fair;
    return QualityScoreEnum.poor;
  }

  private calculateConfidenceLevel(score: number): number {
    // Simple confidence calculation based on score consistency
    return Math.min(score / 5, 1);
  }

  private calculateCacheTtl(complexity: ContentComplexityEnum, processingTime: number): number {
    // Cache longer for complex content that took more time to generate
    const baseTime = 3600; // 1 hour
    const complexityMultiplier = complexity === ContentComplexityEnum.complex ? 2 : 
                                complexity === ContentComplexityEnum.advanced ? 3 : 1;
    const processingMultiplier = processingTime > 5000 ? 2 : 1;
    
    return baseTime * complexityMultiplier * processingMultiplier;
  }
}

/**
 * Default quality validator implementation
 */
class DefaultQualityValidator implements QualityValidator {
  async validateCoherence(text: string): Promise<number> {
    // Simple heuristic: longer sentences and connecting words indicate coherence
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = text.length / sentences.length;
    const connectingWords = (text.match(/\b(and|but|however|therefore|because|since|although)\b/gi) || []).length;
    
    let score = 3; // Base score
    if (avgSentenceLength > 50) score += 0.5; // Well-formed sentences
    if (connectingWords > 0) score += Math.min(connectingWords * 0.3, 1); // Logical connections
    
    return Math.min(Math.max(score, 1), 5);
  }

  async validateEngagement(text: string): Promise<number> {
    // Simple heuristic: questions, exclamations, and varied sentence structure
    const questions = (text.match(/\?/g) || []).length;
    const exclamations = (text.match(/!/g) || []).length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const lengthVariance = this.calculateSentenceLengthVariance(sentences);
    
    let score = 2.5; // Base score
    if (questions > 0) score += Math.min(questions * 0.5, 1);
    if (exclamations > 0) score += Math.min(exclamations * 0.3, 0.8);
    if (lengthVariance > 10) score += 0.7; // Varied sentence structure
    
    return Math.min(Math.max(score, 1), 5);
  }

  async validateClarity(text: string): Promise<number> {
    // Simple heuristic: shorter words, clear sentence structure
    const words = text.split(/\s+/);
    const avgWordLength = text.replace(/\s/g, '').length / words.length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = text.length / sentences.length;
    
    let score = 3; // Base score
    if (avgWordLength < 6) score += 1; // Simpler words
    if (avgSentenceLength < 100) score += 0.5; // Reasonable sentence length
    if (avgSentenceLength > 200) score -= 1; // Too long sentences
    
    return Math.min(Math.max(score, 1), 5);
  }

  async validateRelevance(text: string, context?: any): Promise<number> {
    // Without context, we'll use simple heuristics
    // In production, you'd compare against the template requirements
    let score = 3; // Base score
    
    // Check for typical video script elements
    if (text.includes('scene') || text.includes('visual') || text.includes('show')) score += 0.5;
    if (text.length > 50 && text.length < 500) score += 0.5; // Appropriate length
    
    return Math.min(Math.max(score, 1), 5);
  }

  async validateCreativity(text: string): Promise<number> {
    // Simple heuristic: unique words, varied vocabulary
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const vocabularyRichness = uniqueWords.size / words.length;
    
    let score = 2.5; // Base score
    if (vocabularyRichness > 0.7) score += 1.5; // Rich vocabulary
    if (vocabularyRichness > 0.8) score += 0.5; // Very rich vocabulary
    
    return Math.min(Math.max(score, 1), 5);
  }

  private calculateSentenceLengthVariance(sentences: string[]): number {
    if (sentences.length < 2) return 0;
    
    const lengths = sentences.map(s => s.length);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length;
    
    return Math.sqrt(variance);
  }
}