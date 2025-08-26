# Video Generation Project Rules

## Core Architecture Principles

### 1. Service-Oriented Architecture
- All video processing logic should be encapsulated in services within `src/services/`
- Services must implement proper error handling and logging using the project's logger
- Services should be stateless and testable with clear interfaces

### 2. Type Safety First
- Always use TypeScript strict mode
- Define schemas using Zod for runtime validation
- Export types from `src/types/shorts.ts` for consistency
- Never use `any` type - prefer `unknown` with type guards

### 3. MCP Protocol Integration
- MCP tools must be defined in `src/server/routers/mcp.ts`
- Follow the established pattern: tool registration with Zod schemas
- All MCP responses should use the content array format with type "text"
- Implement proper session management for SSE connections

## Video Processing Guidelines

### 1. Scene Management
- Use the `SceneInput` type for all scene-related operations
- Support both stock video (`searchTerms`) and AI generation (`useAIGeneration`)
- Always validate scene duration and text content
- Implement proper error handling for video generation failures

### 2. Audio Pipeline
- TTS services should support multiple providers (OpenAI, ElevenLabs, etc.)
- Implement quality assessment for generated audio
- Support multiple voice options from the `VoiceEnum`
- Handle audio synchronization with video content

### 3. FramePack Integration
- Use `FramePackIntegrationService` for AI video generation
- Implement proper batch processing for multiple scenes
- Handle GPU resource management efficiently
- Support multiple quality levels (`AIGenerationQualityEnum`)

## Code Quality Standards

### 1. Error Handling
```typescript
// Preferred pattern
try {
  const result = await service.process(input);
  logger.info(`Operation completed: ${result.id}`);
  return result;
} catch (error) {
  logger.error(`Operation failed: ${error instanceof Error ? error.message : String(error)}`);
  throw new Error(`Service operation failed: ${error}`);
}
```

### 2. Service Implementation
```typescript
// Standard service structure
export class ExampleService {
  private logger = logger.child({ service: 'ExampleService' });
  
  constructor(private config: ServiceConfig) {}
  
  public async processContent(input: InputType): Promise<OutputType> {
    // Implementation with proper logging and error handling
  }
}
```

### 3. Testing Requirements
- Unit tests for all service methods
- Integration tests for MCP endpoints
- Mock external dependencies (APIs, file system)
- Test both success and error scenarios

## Performance Optimization

### 1. Caching Strategy
- Use `CacheService` for expensive operations
- Cache AI-generated content with proper TTL
- Implement cache invalidation for updated content
- Monitor cache hit rates and optimize accordingly

### 2. Resource Management
- Implement proper cleanup for video/audio files
- Use streaming for large file operations
- Implement queue-based processing for batch operations
- Monitor memory usage during video processing

### 3. GPU Utilization
- Use `GPUResourceManager` for CUDA operations
- Implement fallback to CPU for non-CUDA environments
- Monitor GPU memory usage and implement proper cleanup
- Support both Docker and local CUDA installations

## Security and Compliance

### 1. Content Safety
- Implement brand safety checks using `BrandSafetyService`
- Validate all user inputs with Zod schemas
- Sanitize file paths and prevent directory traversal
- Implement rate limiting for API endpoints

### 2. API Security
- Validate all MCP tool inputs
- Implement proper authentication for sensitive operations
- Log security events and suspicious activities
- Use environment variables for sensitive configuration

## Integration Patterns

### 1. AI Content Pipeline
- Use `AIContentPipelineService` for complex content generation
- Support multiple AI providers with fallback mechanisms
- Implement cost optimization and usage tracking
- Provide quality assessment and content validation

### 2. External Service Integration
- Implement retry logic with exponential backoff
- Use circuit breaker patterns for unreliable services
- Monitor external service health and availability
- Implement graceful degradation when services are unavailable

## Development Workflow

### 1. Feature Development
- Create feature branches from `main`
- Implement comprehensive tests before submitting PR
- Update documentation for new features
- Follow conventional commit message format

### 2. Code Review Requirements
- All code must pass TypeScript compilation
- Tests must achieve minimum 80% coverage
- Performance impact must be assessed
- Security implications must be reviewed

### 3. Deployment Considerations
- Support both Docker and native installations
- Implement proper health checks
- Use environment-based configuration
- Support graceful shutdown and cleanup