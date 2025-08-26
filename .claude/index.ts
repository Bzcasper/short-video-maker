// Main Claude Code CLI integration entry point
import ClaudeAgentManager from './claude-agent-manager';
import HiveMindBridge from './integrations/hive-mind-bridge';
import ClaudeFlowBridge from './integrations/claude-flow-bridge';
import MCPServiceBridge from './integrations/mcp-service-bridge';
import ServiceIntegrationHooks from './hooks/service-integration';
import { ShortCreator } from '../src/short-creator/ShortCreator';
import { logger } from '../src/logger';

export class ClaudeIntegration {
  private agentManager: ClaudeAgentManager;
  private hiveMindBridge: HiveMindBridge;
  private claudeFlowBridge: ClaudeFlowBridge;
  private mcpBridge: MCPServiceBridge;
  private serviceHooks: ServiceIntegrationHooks;
  private initialized: boolean = false;

  constructor(private basePath: string = process.cwd()) {
    // Initialize components
    this.hiveMindBridge = new HiveMindBridge(basePath);
    this.claudeFlowBridge = new ClaudeFlowBridge(basePath);
  }

  public async initialize(shortCreator: ShortCreator): Promise<void> {
    try {
      // Initialize MCP bridge with ShortCreator
      this.mcpBridge = new MCPServiceBridge(shortCreator);
      
      // Initialize service hooks
      this.serviceHooks = new ServiceIntegrationHooks(
        this.hiveMindBridge,
        this.claudeFlowBridge,
        this.mcpBridge
      );

      // Initialize agent manager
      this.agentManager = new ClaudeAgentManager(this.basePath, this.mcpBridge);

      // Setup integrations
      await this.setupIntegrations();

      this.initialized = true;
      logger.info('Claude integration initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Claude integration:', error);
      throw error;
    }
  }

  private async setupIntegrations(): Promise<void> {
    // Enable HiveMind shared memory
    this.hiveMindBridge.enableSharedMemory();

    // Optimize worker distribution
    await this.hiveMindBridge.optimizeWorkerDistribution();

    // Setup cross-component event handling
    this.agentManager.on('task-completed', (task) => {
      this.claudeFlowBridge.recordNeuralEvent('agent-task-completed', {
        agentId: task.agentId,
        duration: task.endTime ? task.endTime - task.startTime : 0,
        workflow: task.workflow
      });
    });

    this.agentManager.on('task-failed', (task) => {
      this.claudeFlowBridge.recordNeuralEvent('agent-task-failed', {
        agentId: task.agentId,
        error: task.error?.message,
        workflow: task.workflow
      });
    });

    logger.info('Cross-component integrations configured');
  }

  public async executeVideoGenerationWorkflow(
    topic: string,
    options?: {
      platform?: 'tiktok' | 'instagram' | 'youtube';
      targetAudience?: 'general' | 'teens' | 'adults' | 'professionals';
      tone?: 'casual' | 'professional' | 'energetic' | 'educational' | 'humorous';
      qualityThreshold?: number;
      maxCost?: number;
    }
  ): Promise<any> {
    if (!this.initialized) {
      throw new Error('Claude integration not initialized');
    }

    const workflowId = `video-gen-${Date.now()}`;
    logger.info(`Starting video generation workflow: ${workflowId}`);

    try {
      // Stage 1: Content Planning
      const contentPlan = await this.agentManager.executeTask(
        `${workflowId}-content-planning`,
        'video-specialist',
        'analyze-topic-requirements',
        { topic, ...options },
        workflowId,
        'content-planning'
      );

      // Stage 2: Script Generation
      const scriptResult = await this.agentManager.executeTask(
        `${workflowId}-script-generation`,
        'script-coordinator',
        'generate-script-variants',
        { topic, contentPlan, ...options },
        workflowId,
        'script-generation'
      );

      // Stage 3: Quality Validation (parallel with cost optimization)
      const [qualityResult, costResult] = await Promise.all([
        this.agentManager.executeTask(
          `${workflowId}-quality-validation`,
          'quality-assurance',
          'validate-content-quality',
          { script: scriptResult, ...options },
          workflowId,
          'quality-validation'
        ),
        this.agentManager.executeTask(
          `${workflowId}-cost-optimization`,
          'cost-optimizer',
          'analyze-generation-costs',
          { script: scriptResult, ...options },
          workflowId,
          'cost-optimization'
        )
      ]);

      // Stage 4: Video Rendering (if quality passes)
      if (qualityResult.qualityScore >= (options?.qualityThreshold || 80)) {
        const renderResult = await this.agentManager.executeTask(
          `${workflowId}-video-rendering`,
          'framepack-orchestrator',
          'execute-video-rendering',
          { script: scriptResult, quality: qualityResult, cost: costResult },
          workflowId,
          'video-rendering'
        );

        // Final validation
        const finalValidation = await this.agentManager.executeTask(
          `${workflowId}-final-validation`,
          'quality-assurance',
          'validate-content-quality',
          { video: renderResult },
          workflowId,
          'final-validation'
        );

        return {
          workflowId,
          status: 'completed',
          video: renderResult,
          quality: finalValidation,
          cost: costResult,
          metrics: {
            totalTime: Date.now() - parseInt(workflowId.split('-')[2]),
            stages: 5,
            qualityScore: finalValidation.qualityScore
          }
        };
      } else {
        throw new Error(`Quality threshold not met: ${qualityResult.qualityScore} < ${options?.qualityThreshold || 80}`);
      }

    } catch (error) {
      logger.error(`Video generation workflow ${workflowId} failed:`, error);
      throw error;
    }
  }

  public async executeBatchProcessing(
    requests: Array<{ topic: string; options?: Record<string, any> }>,
    batchOptions?: {
      maxConcurrent?: number;
      priorityOrder?: 'fifo' | 'cost' | 'complexity';
    }
  ): Promise<any[]> {
    if (!this.initialized) {
      throw new Error('Claude integration not initialized');
    }

    const batchId = `batch-${Date.now()}`;
    const maxConcurrent = batchOptions?.maxConcurrent || 4;
    
    logger.info(`Starting batch processing: ${batchId} with ${requests.length} requests`);

    // Execute batch processing workflow
    const results = [];
    const chunks = this.chunkArray(requests, maxConcurrent);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(request =>
        this.executeVideoGenerationWorkflow(request.topic, request.options)
          .catch(error => ({ error: error.message, topic: request.topic }))
      );

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return {
      batchId,
      totalRequests: requests.length,
      successful: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      results
    };
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  public getSystemStatus(): Record<string, any> {
    if (!this.initialized) {
      return { status: 'not-initialized' };
    }

    return {
      status: 'initialized',
      agentManager: this.agentManager.getSystemHealth(),
      hiveMind: this.hiveMindBridge.getHiveMindStatus(),
      claudeFlow: this.claudeFlowBridge.getSystemHealth(),
      mcp: this.mcpBridge.getConnectionHealth()
    };
  }

  public async getWorkflowTemplates(): Promise<Record<string, any>> {
    const workflowFiles = [
      'video-generation.json',
      'batch-processing.json'
    ];

    const workflows: Record<string, any> = {};

    for (const file of workflowFiles) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const workflowPath = path.join(this.basePath, '.claude/workflows', file);
        const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
        workflows[workflow.id] = workflow;
      } catch (error) {
        logger.warn(`Failed to load workflow template: ${file}`, error);
      }
    }

    return workflows;
  }

  public destroy(): void {
    if (this.agentManager) {
      this.agentManager.destroy();
    }
    if (this.hiveMindBridge) {
      this.hiveMindBridge.destroy();
    }
    if (this.claudeFlowBridge) {
      this.claudeFlowBridge.destroy();
    }
    if (this.mcpBridge) {
      this.mcpBridge.destroy();
    }
    if (this.serviceHooks) {
      this.serviceHooks.destroy();
    }

    this.initialized = false;
    logger.info('Claude integration destroyed');
  }
}

// Export individual components
export {
  ClaudeAgentManager,
  HiveMindBridge,
  ClaudeFlowBridge,
  MCPServiceBridge,
  ServiceIntegrationHooks
};

// Default export
export default ClaudeIntegration;