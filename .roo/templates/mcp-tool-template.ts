import z from "zod";
import { logger } from "../logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Template for creating MCP tools in the video generation system
 * Follow this pattern for consistent MCP protocol implementation
 */

// Define tool input schema using Zod
const toolInputSchema = z.object({
  // Define your tool-specific parameters here
  videoId: z.string().describe("The ID of the video"),
  options: z.object({
    quality: z.enum(['fast', 'balanced', 'high']).optional().describe("Processing quality level"),
    priority: z.number().min(1).max(10).optional().describe("Processing priority")
  }).optional().describe("Optional processing parameters")
});

type ToolInput = z.infer<typeof toolInputSchema>;

/**
 * MCP Tool Registration Template
 * Use this pattern when adding new tools to the MCP server
 */
export function registerExampleTool(mcpServer: McpServer, dependencies: ToolDependencies) {
  mcpServer.tool(
    "example-video-operation",
    "Performs an example operation on a video with comprehensive error handling",
    toolInputSchema.shape, // Use the schema shape for tool definition
    async (input: ToolInput) => {
      const toolLogger = logger.child({ 
        tool: 'example-video-operation',
        videoId: input.videoId 
      });

      try {
        toolLogger.info('Starting video operation', input);

        // Validate input thoroughly
        const validatedInput = toolInputSchema.parse(input);

        // Execute the tool operation
        const result = await executeToolOperation(validatedInput, dependencies, toolLogger);

        toolLogger.info('Tool operation completed successfully', {
          videoId: validatedInput.videoId,
          resultType: typeof result
        });

        // Return properly formatted MCP response
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2)
            }
          ]
        };

      } catch (error) {
        toolLogger.error('Tool operation failed', {
          error: error instanceof Error ? error.message : String(error),
          videoId: input.videoId,
          stack: error instanceof Error ? error.stack : undefined
        });

        // Return error in proper MCP format
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: {
                  code: getErrorCode(error),
                  message: error instanceof Error ? error.message : 'Unknown error occurred',
                  videoId: input.videoId,
                  retryable: isRetryableError(error)
                }
              }, null, 2)
            }
          ]
        };
      }
    }
  );
}

/**
 * Dependencies interface - define what your tool needs
 */
interface ToolDependencies {
  // Define service dependencies here
  videoService?: {
    getStatus: (id: string) => Promise<string>;
    processVideo: (id: string, options?: any) => Promise<any>;
  };
  cacheService?: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any, ttl?: number) => Promise<void>;
  };
  // Add other service dependencies as needed
}

/**
 * Core tool operation implementation
 */
async function executeToolOperation(
  input: ToolInput, 
  dependencies: ToolDependencies,
  toolLogger: typeof logger
): Promise<ToolOperationResult> {
  const { videoId, options } = input;

  // Check cache first if available
  if (dependencies.cacheService) {
    const cacheKey = `video-operation-${videoId}-${JSON.stringify(options)}`;
    const cachedResult = await dependencies.cacheService.get(cacheKey);
    
    if (cachedResult) {
      toolLogger.debug('Using cached result', { videoId, cacheKey });
      return cachedResult;
    }
  }

  // Execute the actual operation
  const startTime = Date.now();
  
  // Example operation - replace with actual logic
  const operationResult = await performVideoOperation(videoId, options, dependencies);
  
  const processingTime = Date.now() - startTime;
  
  const result: ToolOperationResult = {
    success: true,
    videoId,
    operation: 'example-operation',
    result: operationResult,
    metadata: {
      processingTime,
      options: options || {},
      timestamp: new Date().toISOString()
    }
  };

  // Cache the result if caching is available
  if (dependencies.cacheService) {
    const cacheKey = `video-operation-${videoId}-${JSON.stringify(options)}`;
    await dependencies.cacheService.set(cacheKey, result, 300); // 5 minute TTL
  }

  return result;
}

/**
 * Perform the actual video operation
 */
async function performVideoOperation(
  videoId: string, 
  options: any, 
  dependencies: ToolDependencies
): Promise<any> {
  // TODO: Implement your actual video operation logic here
  
  // Example: Check video status first
  if (dependencies.videoService) {
    const status = await dependencies.videoService.getStatus(videoId);
    
    if (status === 'processing') {
      throw new Error(`Video ${videoId} is currently being processed`);
    }
    
    if (status === 'failed') {
      throw new Error(`Video ${videoId} processing has failed`);
    }
  }

  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    processed: true,
    videoId,
    quality: options?.quality || 'balanced',
    duration: Math.random() * 60, // Example duration
    outputPath: `/tmp/processed-${videoId}.mp4`
  };
}

/**
 * Result type for tool operations
 */
interface ToolOperationResult {
  success: boolean;
  videoId: string;
  operation: string;
  result: any;
  metadata: {
    processingTime: number;
    options: Record<string, any>;
    timestamp: string;
  };
}

/**
 * Error handling utilities
 */
function getErrorCode(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('not found')) return 'VIDEO_NOT_FOUND';
    if (error.message.includes('processing')) return 'VIDEO_PROCESSING_ERROR';
    if (error.message.includes('timeout')) return 'OPERATION_TIMEOUT';
    if (error.message.includes('validation')) return 'INPUT_VALIDATION_ERROR';
    if (error.message.includes('permission')) return 'PERMISSION_DENIED';
  }
  return 'UNKNOWN_ERROR';
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const retryableErrors = ['timeout', 'network', 'rate limit', 'temporary'];
    return retryableErrors.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }
  return false;
}

/**
 * Example of how to use this template:
 * 
 * // In your MCP router setup:
 * import { registerExampleTool } from './path/to/mcp-tool-template';
 * 
 * // Register the tool with your dependencies
 * registerExampleTool(this.mcpServer, {
 *   videoService: this.shortCreator,
 *   cacheService: this.cacheService
 * });
 */