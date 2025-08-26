import fs from "fs-extra";
import path from "path";
import { logger } from "../logger";
import type { MusicMoodEnum, VoiceEnum, OrientationEnum } from "../types/shorts";

export enum ContentType {
  EDUCATIONAL = "educational",
  ENTERTAINMENT = "entertainment", 
  MARKETING = "marketing",
  NEWS_TRENDS = "news_trends"
}

export enum Platform {
  TIKTOK = "tiktok",
  YOUTUBE_SHORTS = "youtube_shorts", 
  INSTAGRAM_REELS = "instagram_reels"
}

export interface ScriptTemplate {
  id: string;
  name: string;
  contentType: ContentType;
  description: string;
  template: string;
  variables: TemplateVariable[];
  hooks: ScriptHook[];
  platform?: Platform;
  idealLength: {
    min: number; // seconds
    max: number; // seconds
  };
  recommendedSettings: {
    voice?: VoiceEnum;
    music?: MusicMoodEnum;
    orientation?: OrientationEnum;
  };
  tags: string[];
}

export interface TemplateVariable {
  name: string;
  type: "string" | "number" | "array" | "boolean";
  required: boolean;
  description: string;
  defaultValue?: any;
  options?: string[]; // For enum-like variables
}

export interface ScriptHook {
  position: "opening" | "middle" | "closing";
  text: string;
  purpose: string; // e.g., "attention_grabber", "call_to_action", "curiosity_gap"
}

export interface ScriptGenerationRequest {
  templateId: string;
  variables: Record<string, any>;
  platform?: Platform;
  targetLength?: number; // seconds
  customization?: {
    tone?: "casual" | "professional" | "energetic" | "educational" | "humorous";
    audience?: "general" | "teens" | "adults" | "professionals";
    includeCallToAction?: boolean;
    callToActionText?: string;
  };
}

export interface GeneratedScript {
  id: string;
  templateId: string;
  platform?: Platform;
  content: {
    fullScript: string;
    scenes: ScriptScene[];
    estimatedDuration: number;
    wordCount: number;
  };
  metadata: {
    createdAt: Date;
    variables: Record<string, any>;
    template: string;
  };
  validation: {
    isValid: boolean;
    score: number;
    issues: string[];
    recommendations: string[];
  };
}

export interface ScriptScene {
  text: string;
  searchTerms: string[];
  duration: number;
  hook?: ScriptHook;
  emphasis?: "high" | "medium" | "low";
}

export class ScriptTemplateEngine {
  private templates: Map<string, ScriptTemplate> = new Map();
  private templatesDir: string;

  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir || path.join(__dirname, "../templates");
    this.loadTemplates();
  }

  private async loadTemplates(): Promise<void> {
    try {
      if (!fs.existsSync(this.templatesDir)) {
        logger.warn(`Templates directory not found: ${this.templatesDir}`);
        return;
      }

      const templateFiles = fs.readdirSync(this.templatesDir)
        .filter(file => file.endsWith('.json'));

      for (const file of templateFiles) {
        try {
          const templatePath = path.join(this.templatesDir, file);
          const templateData = fs.readJsonSync(templatePath) as ScriptTemplate;
          this.templates.set(templateData.id, templateData);
          logger.debug(`Loaded template: ${templateData.name} (${templateData.id})`);
        } catch (error) {
          logger.error(`Failed to load template ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      logger.info(`Loaded ${this.templates.size} script templates`);
    } catch (error) {
      logger.error(`Failed to load templates: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public getTemplates(): ScriptTemplate[] {
    return Array.from(this.templates.values());
  }

  public getTemplate(id: string): ScriptTemplate | undefined {
    return this.templates.get(id);
  }

  public getTemplatesByType(contentType: ContentType): ScriptTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.contentType === contentType);
  }

  public getTemplatesByPlatform(platform: Platform): ScriptTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => !template.platform || template.platform === platform);
  }

  public async generateScript(request: ScriptGenerationRequest): Promise<GeneratedScript> {
    const template = this.templates.get(request.templateId);
    if (!template) {
      throw new Error(`Template not found: ${request.templateId}`);
    }

    // Validate required variables
    const missingVariables = template.variables
      .filter(v => v.required && !(v.name in request.variables))
      .map(v => v.name);

    if (missingVariables.length > 0) {
      throw new Error(`Missing required variables: ${missingVariables.join(", ")}`);
    }

    // Merge with default values
    const variables = { ...this.getDefaultValues(template), ...request.variables };

    // Apply platform-specific optimizations
    const optimizedTemplate = this.optimizeForPlatform(template, request.platform);

    // Generate script content
    const scriptContent = this.interpolateTemplate(optimizedTemplate.template, variables);
    
    // Break into scenes
    const scenes = this.generateScenes(scriptContent, template, request);
    
    // Calculate estimated duration (average speaking rate: 150 words per minute)
    const wordCount = this.countWords(scriptContent);
    const estimatedDuration = (wordCount / 150) * 60; // seconds

    // Apply length optimization if needed
    const optimizedScenes = request.targetLength 
      ? this.optimizeForLength(scenes, request.targetLength)
      : scenes;

    const generatedScript: GeneratedScript = {
      id: this.generateId(),
      templateId: request.templateId,
      platform: request.platform,
      content: {
        fullScript: scriptContent,
        scenes: optimizedScenes,
        estimatedDuration,
        wordCount
      },
      metadata: {
        createdAt: new Date(),
        variables,
        template: template.name
      },
      validation: {
        isValid: true,
        score: 0,
        issues: [],
        recommendations: []
      }
    };

      // Temporary fix: Change to string logging to avoid type mismatch issues
      logger.debug(`Generated script from template ${template.name}: ID=${generatedScript.id}, Scenes=${scenes.length}, Duration=${estimatedDuration}, WordCount=${wordCount}`);

    return generatedScript;
  }

  private getDefaultValues(template: ScriptTemplate): Record<string, any> {
    const defaults: Record<string, any> = {};
    template.variables.forEach(variable => {
      if (variable.defaultValue !== undefined) {
        defaults[variable.name] = variable.defaultValue;
      }
    });
    return defaults;
  }

  private optimizeForPlatform(template: ScriptTemplate, platform?: Platform): ScriptTemplate {
    if (!platform) return template;

    // Clone template for platform-specific modifications
    const optimized = JSON.parse(JSON.stringify(template)) as ScriptTemplate;

    switch (platform) {
      case Platform.TIKTOK:
        // TikTok prefers quick hooks and trending language
        optimized.hooks = optimized.hooks.map(hook => ({
          ...hook,
          text: hook.text.replace(/\bHello\b/g, "Hey").replace(/\bLet's\b/g, "Let's")
        }));
        break;
      
      case Platform.YOUTUBE_SHORTS:
        // YouTube Shorts allow slightly longer content
        if (optimized.idealLength.max < 60) {
          optimized.idealLength.max = 60;
        }
        break;
      
      case Platform.INSTAGRAM_REELS:
        // Instagram prefers visual-first content
        optimized.template = optimized.template.replace(
          /\{visual_cue\}/g, 
          "Don't forget to watch for the visual cues! "
        );
        break;
    }

    return optimized;
  }

  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    
    // Replace simple variables {variable_name}
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value));
    });

    // Handle array variables {array_name[index]} or {array_name.join}
    Object.entries(variables).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        // Replace {array.join} or {array.join:separator}
        const joinRegex = new RegExp(`\\{${key}\\.join(?::(.*?))?\\}`, 'g');
        result = result.replace(joinRegex, (_, separator) => {
          return value.join(separator || ', ');
        });

        // Replace {array[index]}
        value.forEach((item, index) => {
          const indexRegex = new RegExp(`\\{${key}\\[${index}\\]\\}`, 'g');
          result = result.replace(indexRegex, String(item));
        });
      }
    });

    return result.trim();
  }

  private generateScenes(script: string, template: ScriptTemplate, request: ScriptGenerationRequest): ScriptScene[] {
    const scenes: ScriptScene[] = [];
    
    // Split script into logical segments (sentences or paragraphs)
    const segments = this.splitIntoSegments(script);
    const hooks = [...template.hooks];
    let hookIndex = 0;

    segments.forEach((segment, index) => {
      const isFirst = index === 0;
      const isLast = index === segments.length - 1;
      
      // Assign hooks based on position
      let assignedHook: ScriptHook | undefined;
      if (isFirst && hooks.some(h => h.position === "opening")) {
        assignedHook = hooks.find(h => h.position === "opening");
      } else if (isLast && hooks.some(h => h.position === "closing")) {
        assignedHook = hooks.find(h => h.position === "closing");
      } else if (hooks.some(h => h.position === "middle") && hookIndex < hooks.length) {
        assignedHook = hooks.find(h => h.position === "middle");
        hookIndex++;
      }

      // Generate search terms based on content
      const searchTerms = this.generateSearchTerms(segment, template.contentType);
      
      scenes.push({
        text: segment,
        searchTerms,
        duration: this.estimateSegmentDuration(segment),
        hook: assignedHook,
        emphasis: this.determineEmphasis(segment, isFirst, isLast)
      });
    });

    return scenes;
  }

  private splitIntoSegments(script: string): string[] {
    // Split by sentences, but keep segments reasonable for video scenes
    const sentences = script.match(/[^\.!?]+[\.!?]+/g) || [script];
    const segments: string[] = [];
    let currentSegment = "";

    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (!trimmed) return;

      // If adding this sentence would make the segment too long, start a new one
      if (currentSegment && (currentSegment + " " + trimmed).length > 200) {
        segments.push(currentSegment.trim());
        currentSegment = trimmed;
      } else {
        currentSegment = currentSegment ? currentSegment + " " + trimmed : trimmed;
      }
    });

    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }

    return segments.length > 0 ? segments : [script];
  }

  private generateSearchTerms(text: string, contentType: ContentType): string[] {
    // Extract key nouns and adjectives for search terms
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Content-type specific search term enhancement
    const baseTerms = words.slice(0, 3);
    
    switch (contentType) {
      case ContentType.EDUCATIONAL:
        return [...baseTerms, "learning", "education", "tutorial"];
      case ContentType.ENTERTAINMENT:
        return [...baseTerms, "fun", "entertainment", "engaging"];
      case ContentType.MARKETING:
        return [...baseTerms, "product", "business", "lifestyle"];
      case ContentType.NEWS_TRENDS:
        return [...baseTerms, "trending", "news", "current"];
      default:
        return baseTerms;
    }
  }

  private estimateSegmentDuration(text: string): number {
    const wordCount = this.countWords(text);
    return (wordCount / 150) * 60; // 150 words per minute
  }

  private determineEmphasis(text: string, isFirst: boolean, isLast: boolean): "high" | "medium" | "low" {
    if (isFirst || isLast) return "high";
    if (text.includes("!") || text.includes("?")) return "medium";
    return "low";
  }

  private optimizeForLength(scenes: ScriptScene[], targetLength: number): ScriptScene[] {
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
    
    if (Math.abs(totalDuration - targetLength) <= 5) {
      return scenes; // Close enough
    }

    if (totalDuration > targetLength) {
      // Need to shorten - remove or trim scenes
      return this.shortenScenes(scenes, targetLength);
    } else {
      // Need to lengthen - add pauses or extend scenes
      return this.lengthenScenes(scenes, targetLength);
    }
  }

  private shortenScenes(scenes: ScriptScene[], targetLength: number): ScriptScene[] {
    // Remove lowest emphasis scenes first
    let optimized = [...scenes].sort((a, b) => {
      const emphasisOrder = { low: 0, medium: 1, high: 2 };
      return emphasisOrder[a.emphasis || "medium"] - emphasisOrder[b.emphasis || "medium"];
    });

    while (optimized.reduce((sum, scene) => sum + scene.duration, 0) > targetLength && optimized.length > 1) {
      optimized.pop();
    }

    return optimized.sort((a, b) => scenes.indexOf(a) - scenes.indexOf(b));
  }

  private lengthenScenes(scenes: ScriptScene[], targetLength: number): ScriptScene[] {
    // Add brief pauses between scenes
    const currentDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
    const needed = targetLength - currentDuration;
    const pausePerScene = needed / (scenes.length - 1);

    return scenes.map((scene, index) => ({
      ...scene,
      duration: index < scenes.length - 1 ? scene.duration + pausePerScene : scene.duration
    }));
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  private generateId(): string {
    return `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public async addTemplate(template: ScriptTemplate): Promise<void> {
    // Validate template
    if (!template.id || !template.name || !template.template) {
      throw new Error("Template must have id, name, and template fields");
    }

    // Save to file system
    const templatePath = path.join(this.templatesDir, `${template.id}.json`);
    await fs.ensureDir(this.templatesDir);
    await fs.writeJson(templatePath, template, { spaces: 2 });
    
    // Add to memory
    this.templates.set(template.id, template);
    
    logger.info(`Added new template: ${template.name} (${template.id})`);
  }

  public async removeTemplate(id: string): Promise<boolean> {
    const template = this.templates.get(id);
    if (!template) return false;

    // Remove from file system
    const templatePath = path.join(this.templatesDir, `${id}.json`);
    if (fs.existsSync(templatePath)) {
      await fs.remove(templatePath);
    }

    // Remove from memory
    this.templates.delete(id);
    
    logger.info(`Removed template: ${template.name} (${id})`);
    return true;
  }

  public searchTemplates(query: string): ScriptTemplate[] {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter(template => 
      template.name.toLowerCase().includes(lowercaseQuery) ||
      template.description.toLowerCase().includes(lowercaseQuery) ||
      template.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
    );
  }
}