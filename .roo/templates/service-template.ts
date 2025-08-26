import { logger } from "../logger";
import z from "zod";

/**
 * Template for creating new services in the video generation system
 * Follow this pattern for consistency and proper error handling
 */

// Define input/output schemas using Zod
export const serviceInputSchema = z.object({
  // Define your input validation schema here
  id: z.string().describe("Unique identifier"),
  data: z.unknown().describe("Service-specific data"),
});

export const serviceConfigSchema = z.object({
  // Define your configuration schema here
  enabled: z.boolean().default(true),
  timeout: z.number().default(30000),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;
export type ServiceConfig = z.infer<typeof serviceConfigSchema>;

export interface ServiceResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  metrics?: {
    processingTime: number;
    resourcesUsed: Record<string, number>;
  };
}

/**
 * Base service class template
 * Extend this for new services in the video generation pipeline
 */
export class ExampleService {
  private serviceLogger = logger.child({ service: 'ExampleService' });
  
  constructor(private config: ServiceConfig) {
    this.validateConfig();
    this.serviceLogger.info('Service initialized', { config: this.config });
  }

  /**
   * Main service method - implement your core logic here
   */
  public async processRequest(input: ServiceInput): Promise<ServiceResult> {
    const startTime = Date.now();
    
    try {
      // Validate input
      const validatedInput = serviceInputSchema.parse(input);
      this.serviceLogger.debug('Processing request', { inputId: validatedInput.id });

      // Implement your service logic here
      const result = await this.executeServiceLogic(validatedInput);

      const processingTime = Date.now() - startTime;
      this.serviceLogger.info('Request processed successfully', {
        inputId: validatedInput.id,
        processingTime
      });

      return {
        success: true,
        data: result,
        metrics: {
          processingTime,
          resourcesUsed: await this.getResourceMetrics()
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.serviceLogger.error('Request processing failed', {
        error: error instanceof Error ? error.message : String(error),
        processingTime,
        input: input
      });

      return {
        success: false,
        error: {
          code: this.getErrorCode(error),
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: this.isRetryableError(error)
        },
        metrics: {
          processingTime,
          resourcesUsed: {}
        }
      };
    }
  }

  /**
   * Implement your core service logic here
   */
  private async executeServiceLogic(input: ServiceInput): Promise<unknown> {
    // TODO: Implement your service-specific logic
    await this.simulateAsyncWork();
    return { processed: true, inputId: input.id };
  }

  /**
   * Validate service configuration on initialization
   */
  private validateConfig(): void {
    try {
      serviceConfigSchema.parse(this.config);
    } catch (error) {
      throw new Error(`Invalid service configuration: ${error}`);
    }
  }

  /**
   * Get resource usage metrics for monitoring
   */
  private async getResourceMetrics(): Promise<Record<string, number>> {
    // Implement resource monitoring specific to your service
    return {
      memoryUsage: process.memoryUsage().heapUsed,
      cpuTime: process.cpuUsage().user
    };
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Add your retry logic based on error types
      return error.message.includes('timeout') || 
             error.message.includes('network') ||
             error.message.includes('rate limit');
    }
    return false;
  }

  /**
   * Map errors to appropriate error codes
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('timeout')) return 'TIMEOUT_ERROR';
      if (error.message.includes('validation')) return 'VALIDATION_ERROR';
      if (error.message.includes('network')) return 'NETWORK_ERROR';
      if (error.message.includes('rate limit')) return 'RATE_LIMIT_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Simulate async work - replace with actual implementation
   */
  private async simulateAsyncWork(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Cleanup resources when service is no longer needed
   */
  public async cleanup(): Promise<void> {
    this.serviceLogger.info('Cleaning up service resources');
    // Implement cleanup logic (close connections, clear caches, etc.)
  }

  /**
   * Health check method for monitoring
   */
  public async healthCheck(): Promise<boolean> {
    try {
      // Implement health check logic
      await this.simulateAsyncWork();
      return true;
    } catch (error) {
      this.serviceLogger.error('Health check failed', { error });
      return false;
    }
  }
}