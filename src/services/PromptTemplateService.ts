import { logger } from "../logger";
import { CacheService } from "./CacheService";
import {
  PromptTemplate,
  PromptCategoryEnum,
  TargetAudienceEnum,
  ContentComplexityEnum,
  VideoLengthEnum,
  ABTestConfig,
  validatePromptTemplate,
  validateABTestConfig
} from "../schemas/PromptSchema";
import { RedisConnection } from "../server/redis";
import Redis from "ioredis";

export interface TemplateSearchOptions {
  category?: PromptCategoryEnum;
  targetAudience?: TargetAudienceEnum;
  complexity?: ContentComplexityEnum;
  recommendedLength?: VideoLengthEnum;
  tags?: string[];
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

export interface VariableSubstitutionOptions {
  strict?: boolean; // If true, throw error on missing required variables
  defaultValues?: Record<string, any>;
  transformers?: Record<string, (value: any) => any>;
}

export interface TemplateUsageMetrics {
  totalUsage: number;
  successRate: number;
  averageQualityScore: number;
  lastUsed?: string;
  errorRate: number;
  avgProcessingTime: number;
}

export class PromptTemplateService {
  private redis: Redis;
  private cacheService: CacheService;
  private readonly TEMPLATE_PREFIX = "svm:templates:";
  private readonly CATEGORY_INDEX_PREFIX = "svm:templates:category:";
  private readonly TAG_INDEX_PREFIX = "svm:templates:tags:";
  private readonly USAGE_METRICS_PREFIX = "svm:templates:usage:";
  private readonly AB_TEST_PREFIX = "svm:abtests:";

  constructor(cacheService: CacheService) {
    this.redis = RedisConnection.getInstance();
    this.cacheService = cacheService;
  }

  /**
   * Create or update a prompt template
   */
  public async createTemplate(template: Omit<PromptTemplate, 'metadata'>): Promise<PromptTemplate> {
    try {
      const now = new Date().toISOString();
      const fullTemplate: PromptTemplate = {
        ...template,
        metadata: {
          createdAt: now,
          updatedAt: now,
          createdBy: "system", // In real app, get from auth context
          version: "1.0.0",
          usage: {
            totalUsage: 0,
            lastUsed: undefined,
            successRate: undefined
          }
        }
      };

      // Validate template structure
      const validatedTemplate = validatePromptTemplate(fullTemplate);

      // Store template
      const templateKey = `${this.TEMPLATE_PREFIX}${validatedTemplate.id}`;
      await this.redis.set(templateKey, JSON.stringify(validatedTemplate));

      // Update indices
      await this.updateTemplateIndices(validatedTemplate);

      // Cache template for quick access
      await this.cacheService.set(
        `template:${validatedTemplate.id}`,
        validatedTemplate,
        3600, // 1 hour TTL
        [validatedTemplate.category, ...validatedTemplate.tags]
      );

      logger.info(`Template created: ${validatedTemplate.id} (${validatedTemplate.name})`);
      return validatedTemplate;

    } catch (error) {
      logger.error(`Failed to create template:`, error);
      throw new Error(`Template creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get template by ID with caching
   */
  public async getTemplate(id: string): Promise<PromptTemplate | null> {
    try {
      // Try cache first
      const cached = await this.cacheService.get<PromptTemplate>(`template:${id}`);
      if (cached) {
        logger.debug(`Template cache hit: ${id}`);
        return cached;
      }

      // Fallback to Redis storage
      const templateKey = `${this.TEMPLATE_PREFIX}${id}`;
      const data = await this.redis.get(templateKey);
      
      if (!data) {
        return null;
      }

      const template = validatePromptTemplate(JSON.parse(data));
      
      // Cache for future requests
      await this.cacheService.set(
        `template:${id}`,
        template,
        3600,
        [template.category, ...template.tags]
      );

      return template;

    } catch (error) {
      logger.error(`Failed to get template ${id}:`, error);
      return null;
    }
  }

  /**
   * Search templates with various filters
   */
  public async searchTemplates(options: TemplateSearchOptions = {}): Promise<{
    templates: PromptTemplate[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const {
        category,
        targetAudience,
        complexity,
        recommendedLength,
        tags,
        searchTerm,
        limit = 20,
        offset = 0
      } = options;

      // Build cache key for search results
      const searchKey = `search:${JSON.stringify(options)}`;
      const cached = await this.cacheService.get<{templates: PromptTemplate[]; total: number}>(`template_search:${searchKey}`);
      
      if (cached) {
        return {
          ...cached,
          hasMore: (offset + limit) < cached.total
        };
      }

      // Get all template keys
      const pattern = `${this.TEMPLATE_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      
      // Fetch all templates (in production, you'd want pagination at the Redis level)
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      let templates: PromptTemplate[] = [];
      
      if (results) {
        templates = results
          .map(([err, data]) => {
            if (err || !data) return null;
            try {
              return validatePromptTemplate(JSON.parse(data as string));
            } catch {
              return null;
            }
          })
          .filter(template => template !== null) as PromptTemplate[];
      }

      // Apply filters
      let filteredTemplates = templates;

      if (category) {
        filteredTemplates = filteredTemplates.filter(t => t.category === category);
      }

      if (targetAudience) {
        filteredTemplates = filteredTemplates.filter(t => t.targetAudience === targetAudience);
      }

      if (complexity) {
        filteredTemplates = filteredTemplates.filter(t => t.complexity === complexity);
      }

      if (recommendedLength) {
        filteredTemplates = filteredTemplates.filter(t => t.recommendedLength === recommendedLength);
      }

      if (tags && tags.length > 0) {
        filteredTemplates = filteredTemplates.filter(t => 
          tags.some(tag => t.tags.includes(tag))
        );
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredTemplates = filteredTemplates.filter(t =>
          t.name.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term) ||
          t.template.toLowerCase().includes(term) ||
          t.tags.some(tag => tag.toLowerCase().includes(term))
        );
      }

      // Sort by usage and quality
      filteredTemplates.sort((a, b) => {
        const aUsage = a.metadata.usage?.totalUsage || 0;
        const bUsage = b.metadata.usage?.totalUsage || 0;
        const aSuccess = a.metadata.usage?.successRate || 0;
        const bSuccess = b.metadata.usage?.successRate || 0;
        
        // Prioritize by success rate, then by usage
        if (aSuccess !== bSuccess) {
          return bSuccess - aSuccess;
        }
        return bUsage - aUsage;
      });

      const total = filteredTemplates.length;
      const paginatedTemplates = filteredTemplates.slice(offset, offset + limit);

      // Cache results for 5 minutes
      await this.cacheService.set(
        `template_search:${searchKey}`,
        { templates: paginatedTemplates, total },
        300,
        ['template_search']
      );

      return {
        templates: paginatedTemplates,
        total,
        hasMore: (offset + limit) < total
      };

    } catch (error) {
      logger.error(`Template search failed:`, error);
      return { templates: [], total: 0, hasMore: false };
    }
  }

  /**
   * Perform variable substitution in template
   */
  public async substituteVariables(
    templateId: string,
    variables: Record<string, any>,
    options: VariableSubstitutionOptions = {}
  ): Promise<{
    result: string;
    missingVariables: string[];
    errors: string[];
  }> {
    try {
      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const {
        strict = false,
        defaultValues = {},
        transformers = {}
      } = options;

      let result = template.template;
      const missingVariables: string[] = [];
      const errors: string[] = [];

      // Process each variable defined in the template
      for (const variableSpec of template.variables) {
        const variableName = variableSpec.name;
        const variablePattern = new RegExp(`\\{\\{\\s*${variableName}\\s*\\}\\}`, 'g');

        let value = variables[variableName];

        // Handle missing variables
        if (value === undefined || value === null) {
          if (defaultValues[variableName] !== undefined) {
            value = defaultValues[variableName];
          } else if (variableSpec.defaultValue !== undefined) {
            value = variableSpec.defaultValue;
          } else if (variableSpec.required) {
            missingVariables.push(variableName);
            if (strict) {
              errors.push(`Required variable '${variableName}' is missing`);
            }
            continue;
          } else {
            value = '';
          }
        }

        // Apply transformers
        if (transformers[variableName]) {
          try {
            value = transformers[variableName](value);
          } catch (transformError) {
            errors.push(`Transformer error for '${variableName}': ${transformError}`);
            continue;
          }
        }

        // Validate variable value
        try {
          this.validateVariableValue(variableSpec, value);
        } catch (validationError) {
          errors.push(`Validation error for '${variableName}': ${validationError}`);
          if (strict) {
            continue;
          }
        }

        // Perform substitution
        result = result.replace(variablePattern, String(value));
      }

      // Handle any remaining template variables not defined in schema
      const remainingVariables = result.match(/\{\{[^}]+\}\}/g);
      if (remainingVariables) {
        for (const match of remainingVariables) {
          const varName = match.replace(/[{}]/g, '').trim();
          if (variables[varName] !== undefined) {
            const varPattern = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'g');
            result = result.replace(varPattern, String(variables[varName]));
          } else {
            missingVariables.push(varName);
            if (!strict) {
              result = result.replace(match, '');
            }
          }
        }
      }

      // Update usage metrics
      await this.incrementTemplateUsage(templateId);

      return {
        result: result.trim(),
        missingVariables: [...new Set(missingVariables)], // Remove duplicates
        errors
      };

    } catch (error) {
      logger.error(`Variable substitution failed for template ${templateId}:`, error);
      throw error;
    }
  }

  /**
   * Get template usage metrics
   */
  public async getTemplateMetrics(templateId: string): Promise<TemplateUsageMetrics | null> {
    try {
      const metricsKey = `${this.USAGE_METRICS_PREFIX}${templateId}`;
      const data = await this.redis.get(metricsKey);
      
      if (!data) {
        return {
          totalUsage: 0,
          successRate: 0,
          averageQualityScore: 0,
          errorRate: 0,
          avgProcessingTime: 0
        };
      }

      return JSON.parse(data) as TemplateUsageMetrics;

    } catch (error) {
      logger.error(`Failed to get metrics for template ${templateId}:`, error);
      return null;
    }
  }

  /**
   * Update template usage and success metrics
   */
  public async updateTemplateMetrics(
    templateId: string,
    success: boolean,
    qualityScore?: number,
    processingTime?: number
  ): Promise<void> {
    try {
      const metricsKey = `${this.USAGE_METRICS_PREFIX}${templateId}`;
      const currentMetrics = await this.getTemplateMetrics(templateId) || {
        totalUsage: 0,
        successRate: 0,
        averageQualityScore: 0,
        errorRate: 0,
        avgProcessingTime: 0
      };

      const newTotalUsage = currentMetrics.totalUsage + 1;
      const successCount = Math.round(currentMetrics.totalUsage * currentMetrics.successRate) + (success ? 1 : 0);
      const newSuccessRate = successCount / newTotalUsage;
      const newErrorRate = 1 - newSuccessRate;

      let newAvgQualityScore = currentMetrics.averageQualityScore;
      if (qualityScore !== undefined) {
        newAvgQualityScore = (
          (currentMetrics.averageQualityScore * currentMetrics.totalUsage) + qualityScore
        ) / newTotalUsage;
      }

      let newAvgProcessingTime = currentMetrics.avgProcessingTime;
      if (processingTime !== undefined) {
        newAvgProcessingTime = (
          (currentMetrics.avgProcessingTime * currentMetrics.totalUsage) + processingTime
        ) / newTotalUsage;
      }

      const updatedMetrics: TemplateUsageMetrics = {
        totalUsage: newTotalUsage,
        successRate: newSuccessRate,
        averageQualityScore: newAvgQualityScore,
        lastUsed: new Date().toISOString(),
        errorRate: newErrorRate,
        avgProcessingTime: newAvgProcessingTime
      };

      await this.redis.set(metricsKey, JSON.stringify(updatedMetrics));

      // Update template metadata
      const template = await this.getTemplate(templateId);
      if (template) {
        template.metadata.usage = {
          totalUsage: newTotalUsage,
          lastUsed: updatedMetrics.lastUsed,
          successRate: newSuccessRate
        };
        template.metadata.updatedAt = new Date().toISOString();

        const templateKey = `${this.TEMPLATE_PREFIX}${templateId}`;
        await this.redis.set(templateKey, JSON.stringify(template));

        // Invalidate cache
        await this.cacheService.delete(`template:${templateId}`);
      }

    } catch (error) {
      logger.error(`Failed to update metrics for template ${templateId}:`, error);
    }
  }

  /**
   * Create A/B test configuration
   */
  public async createABTest(config: Omit<ABTestConfig, 'metadata'>): Promise<ABTestConfig> {
    try {
      const now = new Date().toISOString();
      const fullConfig: ABTestConfig = {
        ...config,
        metadata: {
          createdAt: now,
          updatedAt: now,
          createdBy: "system" // In real app, get from auth context
        }
      };

      const validatedConfig = validateABTestConfig(fullConfig);

      // Validate that all variant template IDs exist
      for (const variant of validatedConfig.variants) {
        const template = await this.getTemplate(variant.templateId);
        if (!template) {
          throw new Error(`Template not found for variant ${variant.id}: ${variant.templateId}`);
        }
      }

      // Store A/B test config
      const testKey = `${this.AB_TEST_PREFIX}${validatedConfig.id}`;
      await this.redis.set(testKey, JSON.stringify(validatedConfig));

      logger.info(`A/B test created: ${validatedConfig.id} (${validatedConfig.name})`);
      return validatedConfig;

    } catch (error) {
      logger.error(`Failed to create A/B test:`, error);
      throw error;
    }
  }

  /**
   * Get template for A/B test (randomly selects variant based on weights)
   */
  public async getABTestTemplate(testId: string): Promise<{
    template: PromptTemplate;
    variantId: string;
  } | null> {
    try {
      const testKey = `${this.AB_TEST_PREFIX}${testId}`;
      const data = await this.redis.get(testKey);
      
      if (!data) {
        return null;
      }

      const abTest = validateABTestConfig(JSON.parse(data));

      // Check if test is active
      const now = new Date();
      const startDate = new Date(abTest.startDate);
      const endDate = abTest.endDate ? new Date(abTest.endDate) : null;

      if (abTest.status !== 'active' || now < startDate || (endDate && now > endDate)) {
        return null;
      }

      // Select variant based on weights
      const random = Math.random();
      let cumulativeWeight = 0;
      
      for (const variant of abTest.variants) {
        cumulativeWeight += variant.weight;
        if (random <= cumulativeWeight) {
          const template = await this.getTemplate(variant.templateId);
          if (template) {
            return {
              template,
              variantId: variant.id
            };
          }
        }
      }

      // Fallback to first variant
      const firstVariant = abTest.variants[0];
      const template = await this.getTemplate(firstVariant.templateId);
      return template ? { template, variantId: firstVariant.id } : null;

    } catch (error) {
      logger.error(`Failed to get A/B test template for ${testId}:`, error);
      return null;
    }
  }

  /**
   * Delete template and cleanup
   */
  public async deleteTemplate(id: string): Promise<boolean> {
    try {
      const templateKey = `${this.TEMPLATE_PREFIX}${id}`;
      const result = await this.redis.del(templateKey);
      
      if (result > 0) {
        // Clean up indices and cache
        await this.cleanupTemplateIndices(id);
        await this.cacheService.delete(`template:${id}`);
        
        // Clean up metrics
        const metricsKey = `${this.USAGE_METRICS_PREFIX}${id}`;
        await this.redis.del(metricsKey);
        
        logger.info(`Template deleted: ${id}`);
        return true;
      }
      
      return false;
      
    } catch (error) {
      logger.error(`Failed to delete template ${id}:`, error);
      return false;
    }
  }

  /**
   * Private helper methods
   */
  private async updateTemplateIndices(template: PromptTemplate): Promise<void> {
    const pipeline = this.redis.pipeline();

    // Category index
    const categoryKey = `${this.CATEGORY_INDEX_PREFIX}${template.category}`;
    pipeline.sadd(categoryKey, template.id);

    // Tags index
    template.tags.forEach(tag => {
      const tagKey = `${this.TAG_INDEX_PREFIX}${tag}`;
      pipeline.sadd(tagKey, template.id);
    });

    await pipeline.exec();
  }

  private async cleanupTemplateIndices(templateId: string): Promise<void> {
    // In a production system, you'd want to track which indices contain this template
    // For now, we'll skip this cleanup
  }

  private validateVariableValue(variableSpec: any, value: any): void {
    if (!variableSpec.validation) return;

    const { validation } = variableSpec;

    if (variableSpec.type === 'string' && typeof value === 'string') {
      if (validation.minLength && value.length < validation.minLength) {
        throw new Error(`Value too short (min: ${validation.minLength})`);
      }
      if (validation.maxLength && value.length > validation.maxLength) {
        throw new Error(`Value too long (max: ${validation.maxLength})`);
      }
      if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
        throw new Error(`Value does not match pattern: ${validation.pattern}`);
      }
      if (validation.options && !validation.options.includes(value)) {
        throw new Error(`Value must be one of: ${validation.options.join(', ')}`);
      }
    }
  }

  private async incrementTemplateUsage(templateId: string): Promise<void> {
    try {
      const metricsKey = `${this.USAGE_METRICS_PREFIX}${templateId}`;
      const currentMetrics = await this.getTemplateMetrics(templateId) || {
        totalUsage: 0,
        successRate: 0,
        averageQualityScore: 0,
        errorRate: 0,
        avgProcessingTime: 0
      };

      currentMetrics.totalUsage++;
      currentMetrics.lastUsed = new Date().toISOString();
      
      await this.redis.set(metricsKey, JSON.stringify(currentMetrics));
    } catch (error) {
      logger.error(`Failed to increment usage for template ${templateId}:`, error);
    }
  }
}