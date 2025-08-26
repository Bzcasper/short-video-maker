# Technology Stack Context

## Core Framework & Runtime

### TypeScript & Node.js
- **TypeScript 5.8.3**: Strict type checking with comprehensive type definitions
- **Node.js**: Latest LTS for server runtime
- **ES2022**: Modern JavaScript features with async/await patterns
- **Strict Mode**: Zero tolerance for `any` types, comprehensive error handling

### Web Framework & APIs
- **Express.js 4.18.2**: RESTful API server with middleware support
- **Swagger/OpenAPI**: Comprehensive API documentation and validation
- **WebSocket (ws)**: Real-time communication for video processing updates
- **Server-Sent Events**: MCP protocol communication transport

## AI & Machine Learning Integration

### AI Model Providers
```json
{
  "primary": "xai-grok-3-mini",
  "fallback": "deepseek-chat", 
  "specialized": {
    "scriptGeneration": "deepseek-chat",
    "videoProcessing": "cerberus-qwen-coder-3",
    "mcpIntegration": "xai-grok-3-mini"
  }
}
```

### Text-to-Speech Services
- **OpenAI TTS**: High-quality neural voices with multiple personas
- **ElevenLabs**: Premium voice synthesis with emotional control
- **Voice Options**: 25+ voices across different accents and personas
- **Audio Processing**: FFmpeg integration for format conversion and optimization

### AI Video Generation
- **FramePack Integration**: Custom AI video generation service
- **Quality Levels**: Fast, Balanced, High quality rendering options
- **Style Support**: Multiple image and video style presets
- **Batch Processing**: Concurrent video generation with resource management

## Video Processing & Rendering

### Remotion Framework
```typescript
// Core video composition framework
import { Composition, Video, Audio, Img, staticFile } from 'remotion';
import { renderVideo } from '@remotion/renderer';
```
- **React-based**: Component-driven video composition
- **Programmatic Control**: Dynamic content generation and layout
- **Timeline Management**: Precise timing and synchronization
- **Asset Management**: Static file handling and optimization

### FFmpeg & Media Processing
- **FFmpeg 6.1+**: Professional video/audio processing
- **Sharp**: High-performance image processing and optimization
- **Format Support**: MP4, WebM, MOV output formats
- **Codec Options**: H.264, H.265, VP9 encoding with quality presets

### GPU Acceleration
```dockerfile
# CUDA support for enhanced performance
FROM nvidia/cuda:12.2-runtime-ubuntu20.04
RUN apt-get update && apt-get install -y \
    nvidia-docker2 \
    cuda-toolkit-12-2
```
- **CUDA 12.2**: GPU-accelerated video processing
- **Resource Management**: GPU memory monitoring and allocation
- **Fallback Support**: Automatic CPU fallback for non-CUDA environments
- **Docker Integration**: Containerized GPU workloads

## Data Management & Caching

### Redis & BullMQ
```typescript
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

// Job queue for video processing
const videoQueue = new Queue('video-processing', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 5,
    attempts: 3
  }
});
```
- **BullMQ**: Advanced job queue with priorities and delays
- **Redis Caching**: High-performance content and result caching
- **Session Management**: MCP protocol session state
- **Job Monitoring**: Queue health and processing metrics

### File System & Storage
- **Temporary Files**: Automatic cleanup with configurable TTL
- **Asset Management**: Organized storage for audio, video, and images
- **CDN Integration**: Optional content delivery network support
- **Backup Strategy**: Automated backup for generated content

## Model Context Protocol (MCP)

### MCP SDK Integration
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// MCP server with video generation tools
const mcpServer = new McpServer({
  name: "Short Creator",
  version: "0.0.1",
  capabilities: {
    resources: {},
    tools: {}
  }
});
```

### Available MCP Tools
- **get-video-status**: Real-time video processing status
- **create-short-video**: Initiate video generation with scenes and config
- **Session Management**: Multi-client SSE connection handling
- **Error Handling**: Comprehensive error reporting and recovery

## Development & Testing Framework

### Testing Stack
```json
{
  "testing": {
    "unit": "vitest",
    "integration": "vitest + nock",
    "e2e": "custom video validation",
    "coverage": "c8 + vitest"
  }
}
```
- **Vitest**: Fast unit and integration testing
- **Nock**: HTTP mocking for external API testing
- **Custom Validators**: Video quality and output validation
- **Coverage Requirements**: Minimum 80% code coverage

### Build & Development Tools
- **Vite**: Fast development and production builds
- **ESLint + Prettier**: Code quality and formatting
- **TypeScript Compiler**: Strict type checking and compilation
- **Nodemon**: Development server with hot reload

## Deployment & Infrastructure

### Docker Strategy
```dockerfile
# Multi-stage builds for different environments
FROM node:20-alpine AS base
FROM base AS deps
FROM base AS builder  
FROM nvidia/cuda:12.2-runtime AS cuda
```

### Container Variants
- **Standard**: General-purpose deployment without GPU
- **CUDA**: GPU-accelerated processing for high-performance scenarios
- **Tiny**: Minimal footprint for resource-constrained environments
- **Development**: Full development environment with debugging tools

### Environment Configuration
```typescript
// Environment-based configuration
const config = {
  development: {
    logLevel: 'debug',
    enableGPU: false,
    cacheTimeout: 300
  },
  production: {
    logLevel: 'info', 
    enableGPU: true,
    cacheTimeout: 3600
  }
};
```

## Security & Compliance

### Input Validation & Sanitization
```typescript
import z from 'zod';

// Comprehensive input validation
const videoRequestSchema = z.object({
  scenes: z.array(sceneInput),
  config: renderConfig,
  options: z.object({
    quality: z.enum(['fast', 'balanced', 'high']),
    enableGPU: z.boolean().optional()
  }).optional()
});
```

### Content Safety & Brand Compliance
- **Brand Safety Service**: Automated content screening
- **Content Validation**: Multi-layer validation pipeline
- **Rate Limiting**: API abuse prevention and fair usage
- **Audit Logging**: Comprehensive request and processing logging

## Performance Optimization

### Caching Strategy
```typescript
// Multi-level caching approach
const cacheConfig = {
  levels: {
    memory: { ttl: 300, maxSize: 100 },
    redis: { ttl: 3600, cluster: true },
    filesystem: { ttl: 86400, cleanup: true }
  }
};
```

### Resource Monitoring
- **Memory Usage**: Heap monitoring with garbage collection optimization
- **GPU Utilization**: CUDA memory and processing monitoring
- **Queue Health**: Job processing rates and error tracking
- **API Performance**: Response times and throughput metrics

### Scalability Considerations
- **Horizontal Scaling**: Multiple container instances with load balancing
- **Queue Distribution**: Work distribution across multiple workers
- **Resource Pooling**: Shared GPU and processing resources
- **Auto-scaling**: Dynamic resource allocation based on demand