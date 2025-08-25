# Caching and Structured Prompting System

This comprehensive system provides intelligent caching, structured prompt templates, and quality validation for video script generation in the Short Video Maker project.

## Overview

The system consists of four main components:

1. **Schema System** (`src/schemas/PromptSchema.ts`) - TypeScript interfaces and validation schemas
2. **Cache Service** (`src/services/CacheService.ts`) - Redis-based intelligent caching
3. **Template Service** (`src/services/PromptTemplateService.ts`) - Template management and variable substitution
4. **Script Generator** (`src/services/ScriptGeneratorService.ts`) - Script generation with quality validation

## Features

### Intelligent Caching
- Redis-based caching with compression and TTL management
- Content fingerprinting for cache validation
- Tag-based and dependency-based invalidation
- Performance metrics and monitoring
- Automatic cleanup and eviction policies

### Structured Prompting
- Template categories (educational, entertainment, marketing, etc.)
- Variable substitution with validation
- A/B testing framework
- Quality scoring and validation
- Template usage analytics

### Quality Validation
- Multi-criteria quality assessment (coherence, engagement, clarity, relevance, creativity)
- Automated feedback generation
- Quality threshold enforcement
- Script variations generation

## Quick Start

### 1. Initialize Services

```typescript
import { ServiceFactory } from '../services';

ServiceFactory.initialize({
  cache: {
    defaultTtl: 3600, // 1 hour
    maxSize: 1000,
    compressionEnabled: true,
    metrics: { enabled: true }
  }
});

const cacheService = ServiceFactory.getCacheService();
const templateService = ServiceFactory.getTemplateService();
const scriptGenerator = ServiceFactory.getScriptGeneratorService();
```

### 2. Create a Template

```typescript
const template = await templateService.createTemplate({
  id: "edu_science_explainer",
  name: "Science Concept Explainer", 
  category: PromptCategoryEnum.educational,
  description: "Template for explaining scientific concepts",
  template: "Explain {{concept}} to {{audience}} in {{duration}} seconds. {{details}}",
  variables: [
    {
      name: "concept",
      type: "string",
      required: true,
      validation: { minLength: 5, maxLength: 50 }
    },
    {
      name: "audience", 
      type: "string",
      required: true,
      defaultValue: "students"
    },
    {
      name: "duration",
      type: "number",
      required: true,
      defaultValue: 60
    },
    {
      name: "details",
      type: "string", 
      required: true
    }
  ],
  targetAudience: TargetAudienceEnum.teens,
  complexity: ContentComplexityEnum.moderate,
  recommendedLength: VideoLengthEnum.medium,
  tags: ["science", "education"]
});
```

### 3. Generate a Script

```typescript
const request: ScriptGenerationRequest = {
  templateId: "edu_science_explainer",
  variables: {
    concept: "Photosynthesis",
    audience: "high school students", 
    duration: 60,
    details: "Focus on the basic process and why it matters"
  },
  options: {
    enableQualityValidation: true,
    qualityThreshold: QualityScoreEnum.good,
    cacheResults: true,
    generateVariations: true,
    variationCount: 2
  },
  context: {
    requestId: "req_001",
    timestamp: new Date().toISOString(),
    source: "api"
  }
};

const result = await scriptGenerator.generateScript(request);

if (result.success) {
  console.log(`Generated ${result.script.scenes.length} scenes`);
  console.log(`Quality score: ${result.qualityValidation?.overallScore}`);
  console.log(`Cache hit: ${result.cacheInfo?.hit}`);
}
```

## Advanced Usage

### A/B Testing

```typescript
const abTest = await templateService.createABTest({
  id: "comedy_test_001",
  name: "Comedy Style Test",
  variants: [
    { id: "v1", templateId: "template1", weight: 0.5 },
    { id: "v2", templateId: "template2", weight: 0.5 }
  ],
  startDate: new Date().toISOString(),
  status: "active"
});

// Get template based on A/B test
const selected = await templateService.getABTestTemplate(abTest.id);
```

### Cache Management

```typescript
// Cache operations
await cacheService.set("key", data, 3600, ["tag1", "tag2"]);
const cached = await cacheService.get("key");
await cacheService.invalidateByTag("tag1");

// Performance monitoring
const stats = cacheService.getStats();
console.log(`Cache hit rate: ${stats.hitRate * 100}%`);
```

### Template Search

```typescript
const results = await templateService.searchTemplates({
  category: PromptCategoryEnum.educational,
  complexity: ContentComplexityEnum.moderate,
  tags: ["science"],
  limit: 10
});
```

## Integration with Existing System

### Video Queue Integration

```typescript
// In VideoQueue.ts - enhanced job processing
const processVideoWithTemplate = async (job: Job) => {
  const { videoId, templateId, variables, config } = job.data;
  
  if (templateId) {
    // Generate script using template
    const scriptRequest: ScriptGenerationRequest = {
      templateId,
      variables,
      context: { requestId: videoId, source: "queue" }
    };
    
    const scriptResult = await scriptGenerator.generateScript(scriptRequest);
    if (scriptResult.success) {
      // Use generated scenes
      const scenes = scriptResult.script.scenes;
      await shortCreator.createShort(videoId, scenes, config);
    }
  } else {
    // Fallback to original processing
    await shortCreator.createShort(videoId, job.data.scenes, config);
  }
};
```

### API Route Integration

```typescript
// Enhanced API route with template support
app.post('/api/v2/videos/generate-with-template', async (req, res) => {
  const { templateId, variables, config } = req.body;
  
  try {
    const scriptResult = await scriptGenerator.generateScript({
      templateId,
      variables,
      context: { 
        requestId: uuidv4(),
        source: "api",
        timestamp: new Date().toISOString()
      }
    });
    
    if (scriptResult.success) {
      const videoId = uuidv4();
      await videoQueue.addJob(videoId, scriptResult.script.scenes, config);
      res.json({ videoId, qualityScore: scriptResult.qualityValidation?.overallScore });
    } else {
      res.status(400).json({ error: scriptResult.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Performance Considerations

### Cache Optimization
- Use compression for large entries
- Set appropriate TTL based on content complexity
- Use tag-based invalidation for related content
- Monitor cache hit rates and adjust policies

### Memory Management
- Configure max cache size based on available Redis memory
- Use eviction policies (LRU recommended)
- Regular cleanup of expired entries
- Monitor memory usage patterns

### Scaling
- Use Redis clustering for high throughput
- Implement cache warming strategies
- Consider read replicas for template data
- Use connection pooling for Redis connections

## Monitoring and Metrics

### Cache Metrics
- Hit rate and miss rate
- Average response time
- Memory usage
- Eviction counts

### Template Metrics
- Usage frequency
- Success rates
- Quality scores
- Processing times

### Quality Metrics
- Overall quality distribution
- Validation failure rates
- Improvement suggestions effectiveness
- User satisfaction scores

## Troubleshooting

### Common Issues

**Cache Miss Issues**
- Check Redis connection
- Verify TTL settings
- Review invalidation patterns

**Quality Validation Failures**
- Adjust quality thresholds
- Review template variables
- Check validation logic

**Template Not Found**
- Verify template ID
- Check template storage
- Review cache invalidation

### Debugging

```typescript
// Enable detailed logging
const logger = require('../logger');
logger.level = 'debug';

// Cache diagnostics
const cacheInfo = await cacheService.getCacheInfo();
console.log('Cache diagnostics:', cacheInfo);

// Template metrics
const metrics = await templateService.getTemplateMetrics(templateId);
console.log('Template performance:', metrics);
```

## Examples

See `src/examples/CachingSystemExample.ts` for comprehensive usage examples including:
- Template creation and management
- Script generation with caching
- A/B testing scenarios  
- Performance monitoring
- Cache operations

Run the example with:
```bash
npm run example:caching-system
```

## API Reference

### CacheService
- `set(key, content, ttl?, tags?, dependencies?)` - Store data with metadata
- `get<T>(key)` - Retrieve cached data
- `delete(key)` - Remove cache entry
- `invalidateByTag(tag)` - Remove entries by tag
- `clear()` - Clear all cache
- `getStats()` - Get performance statistics

### PromptTemplateService  
- `createTemplate(template)` - Create new template
- `getTemplate(id)` - Get template by ID
- `searchTemplates(options)` - Search templates with filters
- `substituteVariables(templateId, variables, options?)` - Replace template variables
- `createABTest(config)` - Create A/B test configuration
- `getABTestTemplate(testId)` - Get template from A/B test

### ScriptGeneratorService
- `generateScript(request)` - Generate script with validation
- `validateScriptQuality(script, threshold)` - Quality validation only

This system provides a robust foundation for intelligent content generation with performance optimization and quality assurance.