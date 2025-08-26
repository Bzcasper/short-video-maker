# Short Video Maker Project Context

## Project Overview
This is a comprehensive short video generation platform that creates TikTok, Instagram Reels, and YouTube Shorts using AI-powered content synthesis, the Model Context Protocol (MCP), and advanced video processing capabilities.

## Core Technologies

### Primary Stack
- **TypeScript**: All source code with strict typing
- **Node.js**: Backend runtime environment
- **Express**: Web framework for REST API and MCP endpoints
- **Remotion**: Video rendering and composition framework
- **React**: UI components and video composition

### AI & Content Generation
- **Multiple AI Providers**: DeepSeek-V3, Claude 3.5, GPT-4o-mini
- **TTS Services**: OpenAI TTS, ElevenLabs, multiple voice options
- **AI Video Generation**: FramePack integration for custom video content
- **Content Pipeline**: Automated script generation, quality assessment, SEO optimization

### Video Processing
- **FFmpeg**: Video/audio processing and manipulation
- **Sharp**: Image processing and optimization
- **Remotion Renderer**: React-based video composition
- **GPU Acceleration**: CUDA support for enhanced performance

### Infrastructure
- **Docker**: Multi-environment deployment (standard, CUDA, tiny)
- **Redis/BullMQ**: Job queue and caching system
- **WebSocket**: Real-time video processing updates
- **MCP Protocol**: Model Context Protocol for AI tool integration

## Key Services Architecture

### Content Generation Pipeline
```
Topic Input → Script Generation → Quality Assessment → Brand Safety → SEO Optimization → Video Production
```

### Core Services
- `AIContentPipelineService`: End-to-end content generation
- `EnhancedShortCreator`: Advanced video creation with AI integration
- `FramePackIntegrationService`: AI video generation and batch processing
- `ScriptGenerationService`: AI-powered script creation
- `TTSProvider`: Multi-provider text-to-speech synthesis
- `BrandSafetyService`: Content compliance and safety checks
- `SEOOptimizationService`: Platform-specific optimization
- `GPUResourceManager`: Hardware resource optimization

### MCP Integration
- **MCP Server**: Implements Model Context Protocol for AI tool integration
- **SSE Transport**: Server-sent events for real-time communication
- **Tool Registry**: Video status checking and creation tools
- **Session Management**: Multi-client connection handling

## File Structure Overview

### Source Organization
```
src/
├── services/           # Business logic and AI services
├── server/            # Express server and MCP routing
├── short-creator/     # Core video creation logic
├── types/             # TypeScript definitions and Zod schemas
├── components/        # React components for video rendering
├── utils/             # Utility functions and helpers
└── tests/             # Test suites and quality assurance
```

### Configuration Files
- `package.json`: Dependencies and build scripts
- `remotion.config.ts`: Video rendering configuration
- `tsconfig.json`: TypeScript compilation settings
- `vite.config.ts`: Build tool configuration
- `docker-compose.yml`: Multi-container deployment

## Development Patterns

### Error Handling Strategy
- Structured logging with contextual information
- Graceful degradation for external service failures
- Comprehensive error reporting with retry mechanisms
- User-friendly error messages with actionable feedback

### Performance Optimization
- Intelligent caching with TTL-based invalidation
- GPU acceleration for compute-intensive operations
- Streaming processing for large media files
- Background job processing for time-intensive tasks

### Quality Assurance
- Multi-dimensional quality assessment (engagement, clarity, relevance)
- Brand safety compliance checking
- Content validation with configurable thresholds
- Automated testing with comprehensive coverage

## Integration Capabilities

### External APIs
- **Pexels**: Stock video and image content
- **Multiple TTS Providers**: Voice synthesis options
- **AI Model Providers**: Script generation and content enhancement
- **Social Media Platforms**: Optimized output formats

### Deployment Options
- **Standard Docker**: General-purpose deployment
- **CUDA Docker**: GPU-accelerated processing
- **Tiny Docker**: Minimal footprint deployment
- **Native Installation**: Direct system deployment

## Security & Compliance

### Content Safety
- Brand guideline enforcement
- Inappropriate content detection
- Legal compliance checking
- Platform policy adherence

### Technical Security
- Input validation with Zod schemas
- Rate limiting and abuse prevention
- Secure file handling and cleanup
- Environment-based configuration management

## Performance Characteristics

### Scaling Capabilities
- Horizontal scaling through containerization
- Queue-based job processing for load distribution
- Caching strategies for improved response times
- Resource monitoring and optimization

### Quality Metrics
- Processing time optimization
- Content quality scoring
- Resource utilization monitoring
- Error rate tracking and alerting

## Development Workflow

### Code Standards
- TypeScript strict mode enforcement
- Comprehensive test coverage requirements
- Consistent coding patterns and conventions
- Automated linting and formatting

### Deployment Pipeline
- Multi-environment Docker builds
- Automated testing and validation
- Performance benchmarking
- Monitoring and observability integration