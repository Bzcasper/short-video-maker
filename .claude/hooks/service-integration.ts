import { EventEmitter } from 'events';
import { logger } from '../../src/logger';
import { AIContentPipelineService } from '../../src/services/AIContentPipelineService';
import { ScriptGenerationService } from '../../src/services/ScriptGenerationService';
import { EnhancedShortCreator } from '../../src/services/EnhancedShortCreator';
import { CostOptimizationService } from '../../src/services/CostOptimizationService';
import { FramePackIntegrationService } from '../../src/services/FramePackIntegrationService';
import HiveMindBridge from '../integrations/hive-mind-bridge';
import ClaudeFlowBridge from '../integrations/claude-flow-bridge';
import MCPServiceBridge from '../integrations/mcp-service-bridge';

interface ServiceHook {
  serviceName: string;
  hookType: 'pre' | 'post' | 'error';
  agentId?: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

export class ServiceIntegrationHooks extends EventEmitter {
  private aiPipelineService?: AIContentPipelineService;
  private scriptService?: ScriptGenerationService;
  private shortCreator?: EnhancedShortCreator;
  private costOptimizer?: CostOptimizationService;
  private framePackService?: FramePackIntegrationService;
  
  private hiveMindBridge: HiveMindBridge;
  private claudeFlowBridge: ClaudeFlowBridge;
  private mcpBridge?: MCPServiceBridge;
  
  private activeHooks: Map<string, ServiceHook[]> = new Map();

  constructor(
    hiveMindBridge: HiveMindBridge,
    claudeFlowBridge: ClaudeFlowBridge,
    mcpBridge?: MCPServiceBridge
  ) {
    super();
    this.hiveMindBridge = hiveMindBridge;
    this.claudeFlowBridge = claudeFlowBridge;
    this.mcpBridge = mcpBridge;
    
    this.initializeHooks();
  }

  private initializeHooks(): void {
    // Initialize service-specific hooks
    this.setupAIContentPipelineHooks();
    this.setupScriptGenerationHooks();
    this.setupShortCreatorHooks();
    this.setupCostOptimizationHooks();
    this.setupFramePackHooks();

    logger.info('Service integration hooks initialized');
  }

  public setAIContentPipelineService(service: AIContentPipelineService): void {
    this.aiPipelineService = service;
    this.setupAIContentPipelineHooks();
  }

  public setScriptGenerationService(service: ScriptGenerationService): void {
    this.scriptService = service;
    this.setupScriptGenerationHooks();
  }

  public setEnhancedShortCreator(service: EnhancedShortCreator): void {
    this.shortCreator = service;
    this.setupShortCreatorHooks();
  }

  public setCostOptimizationService(service: CostOptimizationService): void {
    this.costOptimizer = service;
    this.setupCostOptimizationHooks();
  }

  public setFramePackIntegrationService(service: FramePackIntegrationService): void {
    this.framePackService = service;
    this.setupFramePackHooks();
  }

  private setupAIContentPipelineHooks(): void {
    if (!this.aiPipelineService) return;

    this.registerServiceHook('ai-content-pipeline', 'pre', async (context) => {
      const taskId = context.taskId || `ai-pipeline-${Date.now()}`;
      this.claudeFlowBridge.startTask(taskId, context.agentId || 'ai-content-pipeline');
      
      // Record neural event for content generation start
      this.claudeFlowBridge.recordNeuralEvent('content-generation-start', {
        agentId: context.agentId,
        contentType: context.metadata?.contentType
      });

      return { taskId };
    });

    this.registerServiceHook('ai-content-pipeline', 'post', async (context) => {
      if (context.taskId) {
        this.claudeFlowBridge.completeTask(context.taskId, {
          qualityScore: context.metadata?.qualityScore,
          costEfficiency: context.metadata?.costEfficiency,
          providerUsed: context.metadata?.providerUsed
        });
      }

      // Record successful content generation
      this.claudeFlowBridge.recordNeuralEvent('content-generation-complete', {
        success: true,
        agentId: context.agentId
      });
    });

    this.registerServiceHook('ai-content-pipeline', 'error', async (context) => {
      if (context.taskId) {
        this.claudeFlowBridge.failTask(context.taskId, context.metadata?.error);
      }

      // Record failed content generation
      this.claudeFlowBridge.recordNeuralEvent('content-generation-failed', {
        error: context.metadata?.error?.message,
        agentId: context.agentId
      });
    });
  }

  private setupScriptGenerationHooks(): void {
    if (!this.scriptService) return;

    this.registerServiceHook('script-generation', 'pre', async (context) => {
      const taskId = context.taskId || `script-gen-${Date.now()}`;
      this.claudeFlowBridge.startTask(taskId, context.agentId || 'script-coordinator');

      // Notify HiveMind of script generation start
      this.hiveMindBridge.emit('script-generation-start', {
        taskId,
        agentId: context.agentId,
        timestamp: new Date().toISOString()
      });

      return { taskId };
    });

    this.registerServiceHook('script-generation', 'post', async (context) => {
      if (context.taskId) {
        this.claudeFlowBridge.completeTask(context.taskId, {
          scriptLength: context.metadata?.scriptLength,
          qualityScore: context.metadata?.qualityScore,
          templateUsed: context.metadata?.templateUsed
        });
      }

      // Update HiveMind consensus on successful script generation
      this.hiveMindBridge.emit('consensus-update', {
        type: 'script-generation-success',
        data: context.metadata
      });
    });
  }

  private setupShortCreatorHooks(): void {
    if (!this.shortCreator) return;

    this.registerServiceHook('short-creator', 'pre', async (context) => {
      const taskId = context.taskId || `video-create-${Date.now()}`;
      this.claudeFlowBridge.startTask(taskId, context.agentId || 'video-specialist');

      // Notify MCP bridge if available
      if (this.mcpBridge) {
        await this.mcpBridge.broadcastToAgents({
          type: 'video-creation-start',
          taskId,
          agentId: context.agentId
        });
      }

      return { taskId };
    });

    this.registerServiceHook('short-creator', 'post', async (context) => {
      if (context.taskId) {
        this.claudeFlowBridge.completeTask(context.taskId, {
          videoId: context.metadata?.videoId,
          renderTime: context.metadata?.renderTime,
          qualityScore: context.metadata?.qualityScore
        });
      }

      // Notify completion through MCP
      if (this.mcpBridge && context.metadata?.videoId) {
        const status = await this.mcpBridge.executeToolForAgent(
          'video-specialist',
          'get-video-status',
          { videoId: context.metadata.videoId }
        );
        
        this.emit('video-creation-complete', {
          videoId: context.metadata.videoId,
          status,
          taskId: context.taskId
        });
      }
    });
  }

  private setupCostOptimizationHooks(): void {
    if (!this.costOptimizer) return;

    this.registerServiceHook('cost-optimization', 'pre', async (context) => {
      const taskId = context.taskId || `cost-opt-${Date.now()}`;
      this.claudeFlowBridge.startTask(taskId, context.agentId || 'cost-optimizer');

      return { taskId };
    });

    this.registerServiceHook('cost-optimization', 'post', async (context) => {
      if (context.taskId) {
        this.claudeFlowBridge.completeTask(context.taskId, {
          costSavings: context.metadata?.costSavings,
          optimizationStrategy: context.metadata?.strategy,
          providerSelection: context.metadata?.providerSelection
        });
      }

      // Update HiveMind with cost optimization results
      this.hiveMindBridge.emit('cost-optimization-complete', {
        savings: context.metadata?.costSavings,
        strategy: context.metadata?.strategy
      });
    });
  }

  private setupFramePackHooks(): void {
    if (!this.framePackService) return;

    this.registerServiceHook('framepack-integration', 'pre', async (context) => {
      const taskId = context.taskId || `framepack-${Date.now()}`;
      this.claudeFlowBridge.startTask(taskId, context.agentId || 'framepack-orchestrator');

      // Record neural event for video rendering start
      this.claudeFlowBridge.recordNeuralEvent('video-rendering-start', {
        agentId: context.agentId,
        gpuOptimized: context.metadata?.gpuOptimized
      });

      return { taskId };
    });

    this.registerServiceHook('framepack-integration', 'post', async (context) => {
      if (context.taskId) {
        this.claudeFlowBridge.completeTask(context.taskId, {
          renderTime: context.metadata?.renderTime,
          gpuUtilization: context.metadata?.gpuUtilization,
          memoryUsage: context.metadata?.memoryUsage,
          outputQuality: context.metadata?.outputQuality
        });
      }

      // Record successful rendering
      this.claudeFlowBridge.recordNeuralEvent('video-rendering-complete', {
        success: true,
        renderTime: context.metadata?.renderTime,
        agentId: context.agentId
      });
    });
  }

  private registerServiceHook(
    serviceName: string,
    hookType: 'pre' | 'post' | 'error',
    handler: (context: ServiceHook & { metadata?: any }) => Promise<any>
  ): void {
    const hookKey = `${serviceName}:${hookType}`;
    
    if (!this.activeHooks.has(hookKey)) {
      this.activeHooks.set(hookKey, []);
    }

    this.on(hookKey, handler);
    logger.debug(`Registered ${hookType} hook for ${serviceName}`);
  }

  public async executePreHook(
    serviceName: string,
    agentId?: string,
    taskId?: string,
    metadata?: Record<string, any>
  ): Promise<any> {
    const hookKey = `${serviceName}:pre`;
    const context: ServiceHook = {
      serviceName,
      hookType: 'pre',
      agentId,
      taskId,
      metadata
    };

    try {
      this.emit(hookKey, context);
      return context;
    } catch (error) {
      logger.error(`Pre-hook execution failed for ${serviceName}:`, error);
      throw error;
    }
  }

  public async executePostHook(
    serviceName: string,
    agentId?: string,
    taskId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const hookKey = `${serviceName}:post`;
    const context: ServiceHook = {
      serviceName,
      hookType: 'post',
      agentId,
      taskId,
      metadata
    };

    try {
      this.emit(hookKey, context);
    } catch (error) {
      logger.error(`Post-hook execution failed for ${serviceName}:`, error);
      // Don't throw for post-hooks to avoid breaking the main flow
    }
  }

  public async executeErrorHook(
    serviceName: string,
    error: Error,
    agentId?: string,
    taskId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const hookKey = `${serviceName}:error`;
    const context: ServiceHook = {
      serviceName,
      hookType: 'error',
      agentId,
      taskId,
      metadata: { ...metadata, error }
    };

    try {
      this.emit(hookKey, context);
    } catch (hookError) {
      logger.error(`Error-hook execution failed for ${serviceName}:`, hookError);
    }
  }

  public getActiveHooks(): string[] {
    return Array.from(this.activeHooks.keys());
  }

  public removeServiceHooks(serviceName: string): void {
    const hookKeys = Array.from(this.activeHooks.keys())
      .filter(key => key.startsWith(`${serviceName}:`));
    
    hookKeys.forEach(key => {
      this.removeAllListeners(key);
      this.activeHooks.delete(key);
    });

    logger.info(`Removed hooks for service: ${serviceName}`);
  }

  public destroy(): void {
    this.removeAllListeners();
    this.activeHooks.clear();
    logger.info('Service integration hooks destroyed');
  }
}

export default ServiceIntegrationHooks;