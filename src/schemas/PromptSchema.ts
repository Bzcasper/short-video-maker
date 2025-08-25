import z from "zod";

// Enums for different video categories and content types
export enum PromptCategoryEnum {
  educational = "educational",
  entertainment = "entertainment", 
  marketing = "marketing",
  news = "news",
  tutorial = "tutorial",
  review = "review",
  storytelling = "storytelling",
  comedy = "comedy",
  informational = "informational",
  promotional = "promotional"
}

export enum ContentComplexityEnum {
  simple = "simple",
  moderate = "moderate", 
  complex = "complex",
  advanced = "advanced"
}

export enum TargetAudienceEnum {
  children = "children",
  teens = "teens",
  adults = "adults",
  seniors = "seniors",
  professionals = "professionals",
  general = "general"
}

export enum VideoLengthEnum {
  short = "short", // 15-30 seconds
  medium = "medium", // 30-60 seconds  
  long = "long" // 60+ seconds
}

export enum QualityScoreEnum {
  poor = 1,
  fair = 2,
  good = 3,
  excellent = 4,
  outstanding = 5
}

// Schema for prompt template structure
export const promptTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  category: z.nativeEnum(PromptCategoryEnum),
  description: z.string().max(500),
  template: z.string().min(10),
  variables: z.array(z.object({
    name: z.string(),
    type: z.enum(["string", "number", "boolean", "array", "object"]),
    required: z.boolean().default(true),
    defaultValue: z.any().optional(),
    description: z.string().optional(),
    validation: z.object({
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
      options: z.array(z.string()).optional()
    }).optional()
  })),
  targetAudience: z.nativeEnum(TargetAudienceEnum),
  complexity: z.nativeEnum(ContentComplexityEnum),
  recommendedLength: z.nativeEnum(VideoLengthEnum),
  tags: z.array(z.string()),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string(),
    version: z.string(),
    usage: z.object({
      totalUsage: z.number().default(0),
      lastUsed: z.string().datetime().optional(),
      successRate: z.number().min(0).max(1).optional()
    }).optional()
  }),
  validationRules: z.object({
    requiresFactChecking: z.boolean().default(false),
    prohibitedWords: z.array(z.string()).optional(),
    requiredElements: z.array(z.string()).optional(),
    maxScenes: z.number().positive().optional(),
    minScenes: z.number().positive().optional()
  }).optional()
});

export type PromptTemplate = z.infer<typeof promptTemplateSchema>;

// Schema for cache entries
export const cacheEntrySchema = z.object({
  key: z.string(),
  content: z.any(),
  metadata: z.object({
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    accessCount: z.number().default(0),
    lastAccessed: z.string().datetime().optional(),
    size: z.number().optional(), // in bytes
    contentType: z.enum(["script", "prompt", "template", "validation_result", "quality_score"]),
    tags: z.array(z.string()).optional(),
    fingerprint: z.string(), // content hash for validation
    version: z.string().optional()
  }),
  dependencies: z.array(z.string()).optional(), // cache keys this entry depends on
  invalidationTriggers: z.array(z.string()).optional() // conditions that invalidate this cache
});

export type CacheEntry = z.infer<typeof cacheEntrySchema>;

// Schema for script generation requests
export const scriptGenerationRequestSchema = z.object({
  templateId: z.string(),
  variables: z.record(z.any()),
  options: z.object({
    enableQualityValidation: z.boolean().default(true),
    generateVariations: z.boolean().default(false),
    variationCount: z.number().min(1).max(5).default(1),
    qualityThreshold: z.nativeEnum(QualityScoreEnum).default(QualityScoreEnum.good),
    cacheResults: z.boolean().default(true),
    useCache: z.boolean().default(true),
    maxRetries: z.number().min(0).max(5).default(3)
  }).optional().default({
    enableQualityValidation: true,
    generateVariations: false,
    variationCount: 1,
    qualityThreshold: QualityScoreEnum.good,
    cacheResults: true,
    useCache: true,
    maxRetries: 3
  }),
  context: z.object({
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    requestId: z.string(),
    timestamp: z.string().datetime(),
    source: z.enum(["api", "ui", "batch", "test"]).default("api")
  })
});

export type ScriptGenerationRequest = z.infer<typeof scriptGenerationRequestSchema>;

// Schema for quality validation results
export const qualityValidationResultSchema = z.object({
  overallScore: z.nativeEnum(QualityScoreEnum),
  scores: z.object({
    coherence: z.number().min(0).max(5),
    engagement: z.number().min(0).max(5),
    clarity: z.number().min(0).max(5),
    relevance: z.number().min(0).max(5),
    creativity: z.number().min(0).max(5)
  }),
  feedback: z.array(z.object({
    type: z.enum(["error", "warning", "suggestion", "info"]),
    message: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    field: z.string().optional(),
    suggestion: z.string().optional()
  })),
  passesThreshold: z.boolean(),
  improvementSuggestions: z.array(z.string()),
  metadata: z.object({
    validatedAt: z.string().datetime(),
    validatorVersion: z.string(),
    processingTimeMs: z.number(),
    confidenceLevel: z.number().min(0).max(1)
  })
});

export type QualityValidationResult = z.infer<typeof qualityValidationResultSchema>;

// Schema for generated script results
export const scriptGenerationResultSchema = z.object({
  success: z.boolean(),
  script: z.object({
    scenes: z.array(z.object({
      text: z.string(),
      searchTerms: z.array(z.string()),
      duration: z.number().optional(),
      metadata: z.object({
        sceneNumber: z.number(),
        estimatedTokens: z.number().optional(),
        complexity: z.nativeEnum(ContentComplexityEnum).optional()
      }).optional()
    })),
    totalScenes: z.number(),
    estimatedDuration: z.number().optional(), // in seconds
    metadata: z.object({
      templateId: z.string(),
      generatedAt: z.string().datetime(),
      processingTimeMs: z.number(),
      version: z.string(),
      fingerprint: z.string() // content hash
    })
  }).optional(),
  qualityValidation: qualityValidationResultSchema.optional(),
  variations: z.array(z.object({
    id: z.string(),
    script: z.any(), // same structure as main script
    qualityScore: z.nativeEnum(QualityScoreEnum),
    differences: z.array(z.string())
  })).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
    retryable: z.boolean().default(false)
  }).optional(),
  cacheInfo: z.object({
    hit: z.boolean(),
    key: z.string().optional(),
    ttl: z.number().optional() // seconds remaining
  }).optional()
});

export type ScriptGenerationResult = z.infer<typeof scriptGenerationResultSchema>;

// Schema for A/B testing configuration
export const abTestConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  variants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    templateId: z.string(),
    weight: z.number().min(0).max(1), // percentage allocation
    metadata: z.record(z.any()).optional()
  })),
  targetAudience: z.nativeEnum(TargetAudienceEnum).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  metrics: z.array(z.enum(["conversion_rate", "engagement", "quality_score", "completion_rate"])),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled"]),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string()
  })
});

export type ABTestConfig = z.infer<typeof abTestConfigSchema>;

// Schema for performance metrics
export const performanceMetricsSchema = z.object({
  timestamp: z.string().datetime(),
  metrics: z.object({
    cache: z.object({
      hitRate: z.number().min(0).max(1),
      missRate: z.number().min(0).max(1),
      totalRequests: z.number(),
      averageResponseTime: z.number(), // milliseconds
      storageUsage: z.number(), // bytes
      evictions: z.number()
    }),
    scriptGeneration: z.object({
      totalRequests: z.number(),
      successRate: z.number().min(0).max(1),
      averageProcessingTime: z.number(), // milliseconds
      qualityScoreAverage: z.number().min(1).max(5),
      retryRate: z.number().min(0).max(1)
    }),
    templates: z.object({
      totalTemplates: z.number(),
      activeTemplates: z.number(),
      averageUsage: z.number(),
      topPerforming: z.array(z.object({
        templateId: z.string(),
        usageCount: z.number(),
        successRate: z.number()
      }))
    })
  }),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    intervalType: z.enum(["hourly", "daily", "weekly", "monthly"])
  })
});

export type PerformanceMetrics = z.infer<typeof performanceMetricsSchema>;

// Cache configuration schema
export const cacheConfigSchema = z.object({
  defaultTtl: z.number().positive().default(3600), // 1 hour in seconds
  maxSize: z.number().positive().default(1000), // max entries
  maxMemoryUsage: z.number().positive().default(100 * 1024 * 1024), // 100MB in bytes
  evictionPolicy: z.enum(["lru", "lfu", "ttl", "random"]).default("lru"),
  compressionEnabled: z.boolean().default(true),
  persistToDisk: z.boolean().default(false),
  metrics: z.object({
    enabled: z.boolean().default(true),
    reportingInterval: z.number().positive().default(300) // 5 minutes in seconds
  }).optional()
});

export type CacheConfig = z.infer<typeof cacheConfigSchema>;

// Export validation functions
export const validatePromptTemplate = (data: unknown): PromptTemplate => {
  return promptTemplateSchema.parse(data);
};

export const validateCacheEntry = (data: unknown): CacheEntry => {
  return cacheEntrySchema.parse(data);
};

export const validateScriptGenerationRequest = (data: unknown): ScriptGenerationRequest => {
  return scriptGenerationRequestSchema.parse(data);
};

export const validateQualityValidationResult = (data: unknown): QualityValidationResult => {
  return qualityValidationResultSchema.parse(data);
};

export const validateScriptGenerationResult = (data: unknown): ScriptGenerationResult => {
  return scriptGenerationResultSchema.parse(data);
};

export const validateABTestConfig = (data: unknown): ABTestConfig => {
  return abTestConfigSchema.parse(data);
};

export const validatePerformanceMetrics = (data: unknown): PerformanceMetrics => {
  return performanceMetricsSchema.parse(data);
};

export const validateCacheConfig = (data: unknown): CacheConfig => {
  return cacheConfigSchema.parse(data);
};