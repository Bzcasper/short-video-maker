# Roo Code Configuration for Short Video Maker

This directory contains optimized Roo Code VS Code extension configuration specifically tailored for the Short Video Maker project. The configuration enhances AI-assisted development for video generation, content pipeline services, and MCP protocol integration.

## Directory Structure

```
.roo/
├── config.json                    # Main project configuration
├── settings.json                  # Roo Code extension settings
├── README.md                      # This file
├── profiles/                      # AI model profiles for different tasks
│   ├── video-generation-profile.json
│   ├── coding-profile.json
│   └── script-generation-profile.json
├── rules/                         # Project-specific coding rules and guidelines
│   └── video-generation-rules.md
├── contexts/                      # Project context and documentation
│   ├── project-context.md
│   └── technology-stack.md
├── templates/                     # Code templates and patterns
│   ├── service-template.ts
│   └── mcp-tool-template.ts
└── workflows/                     # Development workflows and processes
    └── video-generation-workflow.md
```

## AI Model Configuration

### Primary Models
- **XAI Grok-3-Mini**: Primary model for general development and MCP integration
- **DeepSeek Chat**: Fallback model and specialized for script generation
- **Cerberus Qwen Coder-3**: Specialized for complex TypeScript coding tasks

### Profile-Based Intelligence
The system uses three specialized profiles that automatically switch based on the files you're working on:

1. **Video Generation Profile** (`video-generation-profile.json`)
   - Optimized for video processing services and AI content pipelines
   - Understands Remotion, FFmpeg, and GPU acceleration patterns
   - Specialized in MCP protocol integration

2. **Advanced Coding Profile** (`coding-profile.json`) 
   - Focused on TypeScript service architecture and performance optimization
   - Expertise in async patterns, memory optimization, and testing
   - Strict type safety and code quality enforcement

3. **Content Generation Profile** (`script-generation-profile.json`)
   - Specialized in AI content creation and optimization
   - Understanding of SEO, brand safety, and content validation
   - Multi-provider AI integration expertise

## Key Features

### Automatic Context Switching
Roo Code automatically switches between profiles based on the files you're editing:
- Working in `src/services/` → Advanced Coding Profile
- Editing MCP router files → Video Generation Profile  
- Creating script generation services → Content Generation Profile

### Project-Aware Intelligence
- **Architecture Understanding**: Knows your service-oriented architecture
- **Type System Integration**: Works with your Zod schemas and TypeScript types
- **Framework Awareness**: Understands Remotion, Express, BullMQ patterns
- **Best Practices**: Enforces project coding standards and error handling patterns

### Performance Optimization
- **GPU Acceleration**: Leverages CUDA when available for enhanced performance
- **Intelligent Caching**: Caches frequently used code patterns and suggestions
- **Resource Monitoring**: Tracks memory and processing performance
- **Background Processing**: Non-blocking AI assistance

## Usage Guidelines

### Getting Started
1. Ensure Roo Code VS Code extension is installed
2. Open this project in VS Code
3. The extension will automatically load the `.roo` configuration
4. Start coding - profiles will switch automatically based on file context

### Best Practices
- **Follow Service Templates**: Use provided templates for consistency
- **Leverage MCP Tools**: Utilize MCP integration patterns for AI tools
- **Maintain Type Safety**: Follow strict TypeScript guidelines
- **Error Handling**: Implement comprehensive error handling patterns

### Customization
You can modify configurations to suit your development preferences:
- **Model Selection**: Change AI models in `config.json`
- **Profile Behavior**: Adjust profile settings in individual profile files
- **Code Standards**: Update rules in `rules/video-generation-rules.md`
- **Workflow Preferences**: Customize development workflow settings

## Project-Specific Intelligence

### Service Architecture
Roo Code understands your service-oriented architecture:
```typescript
// Automatically suggests proper service structure
export class VideoProcessingService {
  private logger = logger.child({ service: 'VideoProcessingService' });
  
  constructor(private config: ServiceConfig) {}
  
  public async processVideo(input: VideoInput): Promise<VideoResult> {
    // AI assists with error handling, logging, and type safety
  }
}
```

### MCP Integration
Intelligent assistance for MCP tool creation:
```typescript
// Auto-completes MCP tool patterns
mcpServer.tool(
  "process-video",
  "Process video with AI enhancement",
  videoInputSchema.shape,
  async (input) => {
    // AI suggests proper error handling and response formatting
  }
);
```

### Content Pipeline
Understands video generation workflow:
```typescript
// Suggests optimal content pipeline patterns
const pipeline = new AIContentPipelineService(
  cacheService,
  scriptGenerator,
  templateEngine,
  contentValidator,
  aiProviders
);
```

## Troubleshooting

### Common Issues
1. **Profile Not Switching**: Check file path patterns in `settings.json`
2. **Model Not Responding**: Verify API keys and model availability
3. **Performance Issues**: Check GPU acceleration settings and resource limits
4. **Type Errors**: Ensure TypeScript strict mode is enabled

### Support
- Review project documentation in `contexts/` directory
- Check coding rules in `rules/` directory
- Use templates in `templates/` for consistent patterns
- Follow workflows in `workflows/` directory

## Contributing

When making changes to the Roo configuration:
1. Update relevant documentation
2. Test profile switching behavior
3. Verify AI model performance
4. Ensure compatibility with existing codebase patterns

## Version History

- **v1.0**: Initial configuration with basic profiles
- **v2.0**: Enhanced with specialized models and automatic context switching
- **Current**: Optimized for XAI Grok-3-Mini, DeepSeek Chat, and Cerberus Qwen Coder-3

---

This configuration is specifically optimized for the Short Video Maker project's video generation, AI content pipeline, and MCP integration requirements. It provides intelligent, context-aware assistance that understands your project's architecture and coding patterns.