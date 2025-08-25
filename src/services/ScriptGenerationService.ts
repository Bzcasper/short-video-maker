import path from "path";
import { logger } from "../logger";
import { ScriptTemplateEngine, type ScriptGenerationRequest, type GeneratedScript, type ScriptScene } from "./ScriptTemplateEngine";
import { ContentValidator } from "./ContentValidator";
import type { SceneInput, RenderConfig } from "../types/shorts";

export interface ScriptToScenesOptions {
  maxScenes?: number;
  minSceneDuration?: number;
  maxSceneDuration?: number;
  optimizeSearchTerms?: boolean;
}

export interface EnhancedSceneInput extends SceneInput {
  emphasis?: "high" | "medium" | "low";
  visualCues?: string[];
  duration?: number;
}

export class ScriptGenerationService {
  private templateEngine: ScriptTemplateEngine;
  private contentValidator: ContentValidator;

  constructor(templatesDir?: string) {
    this.templateEngine = new ScriptTemplateEngine(templatesDir);
    this.contentValidator = new ContentValidator();
  }

  /**
   * Generate a script from a template and convert it to SceneInput format
   */
  public async generateScriptAndScenes(
    request: ScriptGenerationRequest,
    options: ScriptToScenesOptions = {}
  ): Promise<{
    script: GeneratedScript;
    scenes: EnhancedSceneInput[];
    validation: any;
  }> {
    logger.debug("Generating script and converting to scenes", {
      templateId: request.templateId,
      platform: request.platform ?? undefined
    });

    // Generate the script
    let script = await this.templateEngine.generateScript(request);

    // Validate the script
    script = await this.contentValidator.validateScript(script);

    // Convert script scenes to SceneInput format
    const scenes = this.convertScriptToScenes(script, options);

    // Get engagement metrics for additional insights
    const engagementMetrics = await this.contentValidator.calculateEngagementMetrics(script);

    logger.info(`Generated script with ${scenes.length} scenes`, {
      scriptId: script.id,
      validationScore: script.validation?.score ?? undefined,
      estimatedDuration: script.content.estimatedDuration
    });

    return {
      script,
      scenes,
      validation: {
        ...script.validation,
        engagementMetrics
      }
    };
  }

  /**
   * Convert GeneratedScript to SceneInput array for ShortCreator
   */
  private convertScriptToScenes(
    script: GeneratedScript,
    options: ScriptToScenesOptions
  ): EnhancedSceneInput[] {
    const { scenes: scriptScenes } = script.content;
    const {
      maxScenes = 10,
      minSceneDuration = 3,
      maxSceneDuration = 15,
      optimizeSearchTerms = true
    } = options;

    let convertedScenes: EnhancedSceneInput[] = scriptScenes.map((scene, index) => {
      let searchTerms = [...scene.searchTerms];

      // Optimize search terms if requested
      if (optimizeSearchTerms) {
        searchTerms = this.optimizeSearchTerms(scene, script);
      }

      return {
        text: scene.text,
        searchTerms,
        emphasis: scene.emphasis,
        visualCues: this.extractVisualCues(scene.text),
        duration: scene.duration
      };
    });

    // Limit scenes if needed
    if (convertedScenes.length > maxScenes) {
      // Remove lowest emphasis scenes first
      convertedScenes = convertedScenes
        .sort((a, b) => {
          const emphasisOrder = { low: 0, medium: 1, high: 2 };
          const aOrder = emphasisOrder[a.emphasis || "medium"];
          const bOrder = emphasisOrder[b.emphasis || "medium"];
          return bOrder - aOrder; // Higher emphasis first
        })
        .slice(0, maxScenes)
        .sort((a, b) => {
          // Restore original order
          const originalA = scriptScenes.findIndex(s => s.text === a.text);
          const originalB = scriptScenes.findIndex(s => s.text === b.text);
          return originalA - originalB;
        });
    }

    // Adjust scene durations to fit constraints
    convertedScenes = convertedScenes.map(scene => ({
      ...scene,
      duration: Math.max(minSceneDuration, Math.min(maxSceneDuration, scene.duration || 5))
    }));

    return convertedScenes;
  }

  /**
   * Optimize search terms based on scene content and script context
   */
  private optimizeSearchTerms(scene: ScriptScene, script: GeneratedScript): string[] {
    const baseTerms = [...scene.searchTerms];
    const sceneWords = scene.text.toLowerCase().split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !/^(and|the|for|are|but|not|you|all|can|had|her|was|one|our|out|day|get|has|him|his|how|its|new|now|old|see|two|way|who|boy|did|man|may|she|use|her|him|how)$/.test(word));

    // Add relevant scene-specific terms
    const relevantWords = sceneWords
      .slice(0, 2) // Take first 2 relevant words
      .filter(word => !baseTerms.some(term => term.toLowerCase().includes(word)));

    // Add template-specific enhancements
    const template = this.templateEngine.getTemplate(script.templateId);
    if (template) {
      switch (template.contentType) {
        case "educational":
          relevantWords.push("learning", "education");
          break;
        case "entertainment":
          relevantWords.push("fun", "entertaining");
          break;
        case "marketing":
          relevantWords.push("product", "lifestyle");
          break;
        case "news_trends":
          relevantWords.push("trending", "current");
          break;
      }
    }

    // Combine and limit to reasonable number
    const allTerms = [...baseTerms, ...relevantWords];
    return allTerms.slice(0, 5); // Limit to 5 search terms
  }

  /**
   * Extract visual cues from scene text for better video matching
   */
  private extractVisualCues(text: string): string[] {
    const visualWords = [
      "show", "see", "look", "watch", "display", "reveal", "appear", "demonstrate",
      "beautiful", "stunning", "amazing", "incredible", "bright", "colorful",
      "close-up", "zoom", "pan", "move", "action", "fast", "slow"
    ];

    const cues: string[] = [];
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      const cleanWord = word.replace(/[^a-z]/g, '');
      if (visualWords.includes(cleanWord)) {
        cues.push(cleanWord);
      }
    }

    return cues;
  }

  /**
   * Get all available templates
   */
  public getTemplates() {
    return this.templateEngine.getTemplates();
  }

  /**
   * Get templates by content type
   */
  public getTemplatesByType(contentType: string) {
    return this.templateEngine.getTemplatesByType(contentType as any);
  }

  /**
   * Get templates by platform
   */
  public getTemplatesByPlatform(platform: string) {
    return this.templateEngine.getTemplatesByPlatform(platform as any);
  }

  /**
   * Search templates
   */
  public searchTemplates(query: string) {
    return this.templateEngine.searchTemplates(query);
  }

  /**
   * Get a specific template
   */
  public getTemplate(id: string) {
    return this.templateEngine.getTemplate(id);
  }

  /**
   * Generate scenes from a simple prompt using a smart template selection
   */
  public async generateScenesFromPrompt(
    prompt: string,
    options: {
      contentType?: string;
      platform?: string;
      targetDuration?: number;
    } = {}
  ): Promise<{
    scenes: EnhancedSceneInput[];
    selectedTemplate: string;
    script: GeneratedScript;
  }> {
    // Smart template selection based on prompt analysis
    const selectedTemplate = this.selectTemplateFromPrompt(prompt, options);
    
    if (!selectedTemplate) {
      throw new Error("Could not find suitable template for the provided prompt");
    }

    // Extract variables from prompt
    const variables = this.extractVariablesFromPrompt(prompt, selectedTemplate);

    // Generate script
    const request: ScriptGenerationRequest = {
      templateId: selectedTemplate.id,
      variables,
      platform: options.platform as any,
      targetLength: options.targetDuration
    };

    const result = await this.generateScriptAndScenes(request);
    
    return {
      scenes: result.scenes,
      selectedTemplate: selectedTemplate.name,
      script: result.script
    };
  }

  /**
   * Smart template selection based on prompt analysis
   */
  private selectTemplateFromPrompt(
    prompt: string, 
    options: { contentType?: string; platform?: string }
  ) {
    const lowerPrompt = prompt.toLowerCase();
    let templates = this.templateEngine.getTemplates();

    // Filter by content type if specified
    if (options.contentType) {
      templates = templates.filter(t => t.contentType === options.contentType);
    }

    // Filter by platform if specified
    if (options.platform) {
      templates = templates.filter(t => !t.platform || t.platform === options.platform);
    }

    // Score templates based on prompt keywords
    const scoredTemplates = templates.map(template => {
      let score = 0;

      // Check template tags
      for (const tag of template.tags) {
        if (lowerPrompt.includes(tag.toLowerCase())) {
          score += 10;
        }
      }

      // Check content type indicators
      const contentIndicators = {
        educational: ["how", "learn", "tutorial", "guide", "teach", "explain"],
        entertainment: ["story", "funny", "joke", "comedy", "entertain", "amusing"],
        marketing: ["product", "buy", "sell", "demo", "review", "promote"],
        news_trends: ["news", "trending", "viral", "current", "latest", "breaking"]
      };

      const indicators = contentIndicators[template.contentType as keyof typeof contentIndicators] || [];
      for (const indicator of indicators) {
        if (lowerPrompt.includes(indicator)) {
          score += 15;
        }
      }

      // Bonus for exact template name matches
      if (lowerPrompt.includes(template.name.toLowerCase())) {
        score += 20;
      }

      return { template, score };
    });

    // Sort by score and return the best match
    scoredTemplates.sort((a, b) => b.score - a.score);
    
    return scoredTemplates.length > 0 ? scoredTemplates[0].template : null;
  }

  /**
   * Extract variables from prompt for template
   */
  private extractVariablesFromPrompt(prompt: string, template: any): Record<string, any> {
    const variables: Record<string, any> = {};

    // Set default values for required variables
    for (const variable of template.variables) {
      if (variable.defaultValue !== undefined) {
        variables[variable.name] = variable.defaultValue;
      } else if (variable.required) {
        // Try to extract from prompt or provide reasonable defaults
        variables[variable.name] = this.extractVariableFromPrompt(prompt, variable);
      }
    }

    return variables;
  }

  /**
   * Extract a specific variable value from prompt
   */
  private extractVariableFromPrompt(prompt: string, variable: any): string | string[] {
    const lowerPrompt = prompt.toLowerCase();

    // Common extraction patterns based on variable name
    const extractionPatterns: Record<string, () => string> = {
      main_topic: () => this.extractMainTopic(prompt),
      hook_question: () => this.extractQuestion(prompt) || "Did you know this amazing fact?",
      pain_point: () => this.extractPainPoint(prompt) || "daily challenges",
      product_name: () => this.extractProductName(prompt) || "this amazing product",
      trending_topic: () => this.extractTrendingTopic(prompt) || "the latest viral trend",
      time_reference: () => this.extractTimeReference(prompt) || "recently",
      topic_category: () => this.extractCategory(prompt) || "amazing"
    };

    const extractor = extractionPatterns[variable.name];
    if (extractor) {
      return extractor();
    }

    // Generic fallbacks based on variable type
    switch (variable.type) {
      case "string":
        return this.extractGenericString(prompt, variable.description) || `[${variable.name}]`;
      case "number":
        return this.extractNumber(prompt) || "3";
      case "array":
        return this.extractArray(prompt) || [];
      default:
        return `[${variable.name}]`;
    }
  }

  private extractMainTopic(prompt: string): string {
    // Look for patterns like "how to...", "learn...", etc.
    const patterns = [
      /how to ([^.!?]+)/i,
      /learn (?:about )?([^.!?]+)/i,
      /teach (?:about )?([^.!?]+)/i,
      /explain ([^.!?]+)/i
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return "this topic";
  }

  private extractQuestion(prompt: string): string | null {
    const questionMatch = prompt.match(/([^.!]*\?)/);
    return questionMatch ? questionMatch[1].trim() : null;
  }

  private extractPainPoint(prompt: string): string | null {
    const painWords = ["problem", "issue", "struggle", "difficulty", "challenge", "trouble"];
    for (const word of painWords) {
      if (prompt.toLowerCase().includes(word)) {
        return word + "s";
      }
    }
    return null;
  }

  private extractProductName(prompt: string): string | null {
    // Look for product names (capitalized words)
    const productMatch = prompt.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
    return productMatch ? productMatch[1] : null;
  }

  private extractTrendingTopic(prompt: string): string | null {
    const trendingMatch = prompt.match(/(?:about|regarding|on)\s+([^.!?]+)/i);
    return trendingMatch ? trendingMatch[1].trim() : null;
  }

  private extractTimeReference(prompt: string): string {
    const timeWords = ["yesterday", "today", "last week", "this morning", "recently", "earlier"];
    for (const timeWord of timeWords) {
      if (prompt.toLowerCase().includes(timeWord)) {
        return timeWord;
      }
    }
    return "recently";
  }

  private extractCategory(prompt: string): string {
    const categories = ["science", "history", "nature", "space", "ocean", "animal", "technology"];
    for (const category of categories) {
      if (prompt.toLowerCase().includes(category)) {
        return category;
      }
    }
    return "interesting";
  }

  private extractGenericString(prompt: string, description: string): string | null {
    // Very basic extraction - in a real implementation, this could use NLP
    const words = prompt.split(" ").slice(0, 10);
    return words.length > 3 ? words.slice(0, 3).join(" ") : null;
  }

  private extractNumber(prompt: string): string | null {
    const numberMatch = prompt.match(/\b(\d+)\b/);
    return numberMatch ? numberMatch[1] : null;
  }

  private extractArray(prompt: string): string[] {
    // Extract comma-separated items or similar
    const listMatch = prompt.match(/(?:including|like|such as)\s+([^.!?]+)/i);
    if (listMatch) {
      return listMatch[1].split(/,\s*/).map(item => item.trim());
    }
    return [];
  }

  /**
   * Get validation rules for content
   */
  public getValidationRules() {
    return this.contentValidator.getValidationRules();
  }

  /**
   * Add custom validation rule
   */
  public addValidationRule(rule: any) {
    return this.contentValidator.addValidationRule(rule);
  }
}