/**
 * Comprehensive example demonstrating the caching and structured prompting system
 * This shows how to:
 * - Create and manage prompt templates
 * - Generate scripts with quality validation
 * - Use intelligent caching for performance
 * - Handle A/B testing scenarios
 */

import { CacheService } from '../services/CacheService';
import { PromptTemplateService } from '../services/PromptTemplateService';
import { ScriptGeneratorService } from '../services/ScriptGeneratorService';
import {
  PromptTemplate,
  PromptCategoryEnum,
  TargetAudienceEnum,
  ContentComplexityEnum,
  VideoLengthEnum,
  ScriptGenerationRequest,
  QualityScoreEnum
} from '../schemas/PromptSchema';
import { logger } from '../logger';

export class CachingSystemExample {
  private cacheService: CacheService;
  private templateService: PromptTemplateService;
  private scriptGenerator: ScriptGeneratorService;

  constructor() {
    // Initialize services directly
    const cacheConfig = {
      defaultTtl: 3600, // 1 hour
      maxSize: 1000,
      compressionEnabled: true,
      metrics: {
        enabled: true,
        reportingInterval: 300 // 5 minutes
      }
    };

    this.cacheService = new CacheService(cacheConfig);
    this.templateService = new PromptTemplateService(this.cacheService);
    this.scriptGenerator = new ScriptGeneratorService(
      this.cacheService,
      this.templateService
    );
  }

  /**
   * Example 1: Create educational video templates
   */
  async createEducationalTemplates(): Promise<void> {
    logger.info("Creating educational video templates...");

    const templates: Omit<PromptTemplate, 'metadata'>[] = [
      {
        id: "edu_science_explainer",
        name: "Science Concept Explainer",
        category: PromptCategoryEnum.educational,
        description: "Template for explaining complex scientific concepts in simple terms",
        template: "Explain {{concept}} to {{targetAudience}} in {{duration}} seconds. Start with a hook: '{{hook}}'. Break it down into {{numPoints}} main points: {{points}}. End with a practical application: {{application}}.",
        variables: [
          {
            name: "concept",
            type: "string",
            required: true,
            description: "The scientific concept to explain",
            validation: {
              minLength: 5,
              maxLength: 50
            }
          },
          {
            name: "targetAudience",
            type: "string",
            required: true,
            defaultValue: "high school students",
            description: "Target audience for the explanation",
            validation: {
              options: ["children", "teenagers", "adults", "professionals"]
            }
          },
          {
            name: "duration",
            type: "number",
            required: true,
            defaultValue: 60,
            description: "Video duration in seconds"
          },
          {
            name: "hook",
            type: "string",
            required: true,
            description: "Engaging opening statement"
          },
          {
            name: "numPoints",
            type: "number",
            required: false,
            defaultValue: 3,
            description: "Number of main points to cover"
          },
          {
            name: "points",
            type: "array",
            required: true,
            description: "Array of main points to cover"
          },
          {
            name: "application",
            type: "string",
            required: true,
            description: "Real-world application example"
          }
        ],
        targetAudience: TargetAudienceEnum.teens,
        complexity: ContentComplexityEnum.moderate,
        recommendedLength: VideoLengthEnum.medium,
        tags: ["science", "education", "explainer", "youth"],
        validationRules: {
          requiresFactChecking: true,
          maxScenes: 5,
          minScenes: 3,
          requiredElements: ["hook", "explanation", "application"]
        }
      },
      {
        id: "edu_history_story",
        name: "Historical Event Storyteller",
        category: PromptCategoryEnum.educational,
        description: "Template for narrating historical events as engaging stories",
        template: "Tell the story of {{event}} that happened in {{year}}. Set the scene: {{setting}}. Introduce key figures: {{keyFigures}}. Build tension: {{conflict}}. Reveal the outcome: {{resolution}}. Connect to today: {{modernRelevance}}.",
        variables: [
          {
            name: "event",
            type: "string",
            required: true,
            description: "Historical event to cover"
          },
          {
            name: "year",
            type: "string",
            required: true,
            description: "When the event occurred"
          },
          {
            name: "setting",
            type: "string",
            required: true,
            description: "Historical context and location"
          },
          {
            name: "keyFigures",
            type: "array",
            required: true,
            description: "Important people involved"
          },
          {
            name: "conflict",
            type: "string",
            required: true,
            description: "The main tension or problem"
          },
          {
            name: "resolution",
            type: "string",
            required: true,
            description: "How the event concluded"
          },
          {
            name: "modernRelevance",
            type: "string",
            required: true,
            description: "Why this matters today"
          }
        ],
        targetAudience: TargetAudienceEnum.general,
        complexity: ContentComplexityEnum.moderate,
        recommendedLength: VideoLengthEnum.medium,
        tags: ["history", "storytelling", "education", "narrative"],
        validationRules: {
          requiresFactChecking: true,
          maxScenes: 6,
          minScenes: 4
        }
      }
    ];

    // Create templates
    for (const templateData of templates) {
      const template = await this.templateService.createTemplate(templateData);
      logger.info(`Created template: ${template.name} (${template.id})`);
    }
  }

  /**
   * Example 2: Create entertainment templates
   */
  async createEntertainmentTemplates(): Promise<void> {
    logger.info("Creating entertainment video templates...");

    const comedyTemplate: Omit<PromptTemplate, 'metadata'> = {
      id: "ent_comedy_sketch",
      name: "Comedy Sketch Generator",
      category: PromptCategoryEnum.entertainment,
      description: "Template for creating short comedy sketches",
      template: "Create a {{sketchLength}} second comedy sketch about {{topic}}. Setup: {{setup}}. Characters: {{characters}}. Running gag: {{runningGag}}. Punchline: {{punchline}}. Style: {{comedyStyle}}.",
      variables: [
        {
          name: "sketchLength",
          type: "number",
          required: true,
          defaultValue: 30,
          description: "Length of the comedy sketch in seconds"
        },
        {
          name: "topic",
          type: "string",
          required: true,
          description: "Main topic or theme for the sketch"
        },
        {
          name: "setup",
          type: "string",
          required: true,
          description: "Initial situation or premise"
        },
        {
          name: "characters",
          type: "array",
          required: true,
          description: "Characters involved in the sketch"
        },
        {
          name: "runningGag",
          type: "string",
          required: false,
          description: "Recurring joke or element"
        },
        {
          name: "punchline",
          type: "string",
          required: true,
          description: "Final joke or twist"
        },
        {
          name: "comedyStyle",
          type: "string",
          required: false,
          defaultValue: "observational",
          description: "Type of comedy (slapstick, observational, etc.)",
          validation: {
            options: ["slapstick", "observational", "deadpan", "absurdist", "wordplay"]
          }
        }
      ],
      targetAudience: TargetAudienceEnum.adults,
      complexity: ContentComplexityEnum.moderate,
      recommendedLength: VideoLengthEnum.short,
      tags: ["comedy", "entertainment", "sketch", "humor"],
      validationRules: {
        requiresFactChecking: false,
        prohibitedWords: ["offensive", "inappropriate"],
        maxScenes: 4,
        minScenes: 2
      }
    };

    await this.templateService.createTemplate(comedyTemplate);
    logger.info(`Created comedy template: ${comedyTemplate.name}`);
  }

  /**
   * Example 3: Generate scripts with caching
   */
  async generateScripts(): Promise<void> {
    logger.info("Generating scripts with caching demonstration...");

    // Generate a science explainer video
    const scienceRequest: ScriptGenerationRequest = {
      templateId: "edu_science_explainer",
      variables: {
        concept: "Photosynthesis",
        targetAudience: "teenagers",
        duration: 60,
        hook: "Did you know plants are actually solar-powered food factories?",
        numPoints: 3,
        points: [
          "Plants absorb sunlight through their leaves",
          "They combine CO2 and water to make glucose",
          "Oxygen is released as a bonus byproduct"
        ],
        application: "This process gives us the oxygen we breathe and the food we eat!"
      },
      options: {
        enableQualityValidation: true,
        qualityThreshold: QualityScoreEnum.good,
        cacheResults: true,
        generateVariations: true,
        variationCount: 2,
        useCache: true,
        maxRetries: 3
      },
      context: {
        requestId: "req_science_001",
        timestamp: new Date().toISOString(),
        source: "api",
        userId: "user123"
      }
    };

    logger.info("First generation (cache miss expected)...");
    const start1 = Date.now();
    const result1 = await this.scriptGenerator.generateScript(scienceRequest);
    const time1 = Date.now() - start1;
    
    if (result1.success) {
      logger.info(`Script generated successfully in ${time1}ms`);
      logger.info(`Quality score: ${result1.qualityValidation?.overallScore}`);
      logger.info(`Scenes: ${result1.script?.scenes.length}`);
      logger.info(`Variations: ${result1.variations?.length || 0}`);
    } else {
      logger.error(`Script generation failed: ${result1.error?.message}`);
    }

    // Generate the same script again (cache hit expected)
    logger.info("Second generation (cache hit expected)...");
    const start2 = Date.now();
    const result2 = await this.scriptGenerator.generateScript(scienceRequest);
    const time2 = Date.now() - start2;
    
    logger.info(`Second generation completed in ${time2}ms (${time1 - time2}ms faster)`);
    logger.info(`Cache hit: ${result2.cacheInfo?.hit}`);
  }

  /**
   * Example 4: A/B Testing demonstration
   */
  async demonstrateABTesting(): Promise<void> {
    logger.info("Setting up A/B testing scenario...");

    // Create A/B test for comedy templates
    const abTestConfig = {
      id: "comedy_ab_test_001",
      name: "Comedy Style A/B Test",
      description: "Testing different comedy approaches for engagement",
      variants: [
        {
          id: "variant_observational",
          name: "Observational Comedy",
          templateId: "ent_comedy_sketch",
          weight: 0.5,
          metadata: {
            comedyStyle: "observational"
          }
        },
        {
          id: "variant_absurdist", 
          name: "Absurdist Comedy",
          templateId: "ent_comedy_sketch",
          weight: 0.5,
          metadata: {
            comedyStyle: "absurdist"
          }
        }
      ],
      targetAudience: TargetAudienceEnum.adults,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      metrics: ["engagement", "quality_score", "completion_rate"] as ("quality_score" | "engagement" | "conversion_rate" | "completion_rate")[],
      status: "active" as const
    };

    const createdTest = await this.templateService.createABTest(abTestConfig);
    logger.info(`Created A/B test: ${createdTest.name}`);

    // Simulate A/B test selections
    for (let i = 0; i < 5; i++) {
      const selected = await this.templateService.getABTestTemplate(createdTest.id);
      if (selected) {
        logger.info(`A/B Test selection ${i + 1}: ${selected.variantId} - ${selected.template.name}`);
      }
    }
  }

  /**
   * Example 5: Performance monitoring
   */
  async monitorPerformance(): Promise<void> {
    logger.info("Monitoring system performance...");

    // Get cache statistics
    const cacheStats = this.cacheService.getStats();
    logger.info({
      hitRate: `${(cacheStats.hitRate * 100).toFixed(2)}%`,
      totalRequests: cacheStats.hits + cacheStats.misses,
      averageResponseTime: `${cacheStats.averageResponseTime.toFixed(2)}ms`,
      memoryUsage: `${(cacheStats.totalMemoryUsage / 1024 / 1024).toFixed(2)}MB`
    }, "Cache Statistics");

    // Get cache info
    const cacheInfo = await this.cacheService.getCacheInfo();
    logger.info({
      size: cacheInfo.size,
      memoryUsage: `${(cacheInfo.memoryUsage / 1024 / 1024).toFixed(2)}MB`
    }, "Cache Info");

    // Get template metrics
    const templateMetrics = await this.templateService.getTemplateMetrics("edu_science_explainer");
    if (templateMetrics) {
      logger.info({
        totalUsage: templateMetrics.totalUsage,
        successRate: `${(templateMetrics.successRate * 100).toFixed(2)}%`,
        averageQualityScore: templateMetrics.averageQualityScore.toFixed(2)
      }, "Template Metrics");
    }
  }

  /**
   * Example 6: Cache management operations
   */
  async manageCacheOperations(): Promise<void> {
    logger.info("Demonstrating cache management operations...");

    // Cache cleanup
    await this.cacheService.cleanup();
    logger.info("Cache cleanup completed");

    // Invalidate by tag
    const invalidatedCount = await this.cacheService.invalidateByTag("science");
    logger.info(`Invalidated ${invalidatedCount} entries with 'science' tag`);

    // Search templates
    const searchResults = await this.templateService.searchTemplates({
      category: PromptCategoryEnum.educational,
      complexity: ContentComplexityEnum.moderate,
      limit: 10
    });
    logger.info(`Found ${searchResults.templates.length} educational templates`);
  }

  /**
   * Run all examples
   */
  async runAllExamples(): Promise<void> {
    try {
      logger.info("Starting comprehensive caching system demonstration...");

      await this.createEducationalTemplates();
      await this.createEntertainmentTemplates();
      await this.generateScripts();
      await this.demonstrateABTesting();
      await this.monitorPerformance();
      await this.manageCacheOperations();

      logger.info("All examples completed successfully!");
      
    } catch (error) {
      logger.error({ error }, "Example execution failed");
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Services are managed independently, no factory cleanup needed
    logger.info("System cleanup completed");
  }
}

// Export a function to run the examples
export async function runCachingSystemDemo(): Promise<void> {
  const example = new CachingSystemExample();
  
  try {
    await example.runAllExamples();
  } finally {
    await example.cleanup();
  }
}

// If this file is run directly, execute the demo
if (require.main === module) {
  runCachingSystemDemo()
    .then(() => {
      logger.info("Demo completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Demo failed:", error);
      process.exit(1);
    });
}