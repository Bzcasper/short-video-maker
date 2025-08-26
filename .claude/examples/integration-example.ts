import { ShortCreator } from '../../src/short-creator/ShortCreator';
import { logger } from '../../src/logger';
import ClaudeIntegration from '../index';

// Example of integrating Claude agents with the Short Video Maker
export class IntegrationExample {
  private claudeIntegration: ClaudeIntegration;
  private shortCreator: ShortCreator;

  constructor() {
    this.claudeIntegration = new ClaudeIntegration();
    this.shortCreator = new ShortCreator();
  }

  public async initializeSystem(): Promise<void> {
    try {
      logger.info('Initializing Claude integration system...');
      
      // Initialize Claude integration with ShortCreator
      await this.claudeIntegration.initialize(this.shortCreator);
      
      logger.info('Claude integration initialized successfully');
      
      // Check system health
      const status = this.claudeIntegration.getSystemStatus();
      logger.info('System status:', status);
      
    } catch (error) {
      logger.error('Failed to initialize system:', error);
      throw error;
    }
  }

  public async createSingleVideo(): Promise<void> {
    logger.info('Creating single video with Claude integration...');

    try {
      const result = await this.claudeIntegration.executeVideoGenerationWorkflow(
        "The Future of Artificial Intelligence in Healthcare",
        {
          platform: 'youtube',
          targetAudience: 'professionals',
          tone: 'educational',
          qualityThreshold: 88,
          maxCost: 0.60
        }
      );

      logger.info('Video creation completed:', {
        workflowId: result.workflowId,
        status: result.status,
        qualityScore: result.quality?.qualityScore,
        totalCost: result.cost?.cost,
        totalTime: result.metrics?.totalTime
      });

    } catch (error) {
      logger.error('Single video creation failed:', error);
      throw error;
    }
  }

  public async createBatchVideos(): Promise<void> {
    logger.info('Creating batch videos with Claude integration...');

    const videoRequests = [
      {
        topic: "5 Benefits of Remote Work",
        options: {
          platform: 'tiktok',
          targetAudience: 'professionals',
          tone: 'casual'
        }
      },
      {
        topic: "How to Start Investing in 2025",
        options: {
          platform: 'instagram',
          targetAudience: 'adults',
          tone: 'educational'
        }
      },
      {
        topic: "Latest Tech Trends Explained",
        options: {
          platform: 'youtube',
          targetAudience: 'general',
          tone: 'energetic'
        }
      },
      {
        topic: "Sustainable Living Tips",
        options: {
          platform: 'tiktok',
          targetAudience: 'teens',
          tone: 'humorous'
        }
      }
    ];

    try {
      const batchResult = await this.claudeIntegration.executeBatchProcessing(
        videoRequests,
        {
          maxConcurrent: 2,
          priorityOrder: 'cost'
        }
      );

      logger.info('Batch processing completed:', {
        batchId: batchResult.batchId,
        totalRequests: batchResult.totalRequests,
        successful: batchResult.successful,
        failed: batchResult.failed
      });

      // Log individual results
      batchResult.results.forEach((result: any, index: number) => {
        if (result.error) {
          logger.error(`Video ${index + 1} failed:`, result.error);
        } else {
          logger.info(`Video ${index + 1} completed:`, {
            topic: videoRequests[index].topic,
            qualityScore: result.quality?.qualityScore,
            cost: result.cost?.cost
          });
        }
      });

    } catch (error) {
      logger.error('Batch video creation failed:', error);
      throw error;
    }
  }

  public async monitorSystemHealth(): Promise<void> {
    logger.info('Monitoring system health...');

    // Get current system status
    const status = this.claudeIntegration.getSystemStatus();
    
    logger.info('System Health Report:', {
      status: status.status,
      agents: {
        total: status.agentManager?.agents,
        activeTasks: status.agentManager?.activeTasks
      },
      hiveMind: {
        maxWorkers: status.hiveMind?.defaults?.maxWorkers,
        mcpEnabled: status.hiveMind?.mcpTools?.enabled
      },
      claudeFlow: {
        successRate: status.claudeFlow?.successRate,
        averageTaskDuration: status.claudeFlow?.averageTaskDuration,
        systemUptime: status.claudeFlow?.systemUptime
      },
      mcp: {
        totalConnections: status.mcp?.totalConnections,
        activeAgents: status.mcp?.activeAgents
      }
    });
  }

  public async demonstrateAgentCapabilities(): Promise<void> {
    logger.info('Demonstrating individual agent capabilities...');

    try {
      // Get workflow templates
      const templates = await this.claudeIntegration.getWorkflowTemplates();
      logger.info('Available workflow templates:', Object.keys(templates));

      // Show system capabilities
      const systemStatus = this.claudeIntegration.getSystemStatus();
      logger.info('System capabilities demonstrated:', {
        integratedSystems: [
          'HiveMind distributed processing',
          'Claude Flow metrics tracking', 
          'MCP tool integration',
          'Service hook coordination'
        ],
        agentSpecializations: [
          'Video content planning',
          'Multi-provider script generation',
          'GPU-optimized video rendering',
          'Quality assurance and validation',
          'Cost optimization and provider selection'
        ],
        performanceFeatures: [
          'Parallel processing',
          'Cost-aware provider selection',
          'Quality-first validation',
          'Real-time metrics tracking',
          'Automatic error recovery'
        ]
      });

    } catch (error) {
      logger.error('Agent capabilities demonstration failed:', error);
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    logger.info('Cleaning up Claude integration...');
    
    try {
      this.claudeIntegration.destroy();
      logger.info('Claude integration cleaned up successfully');
    } catch (error) {
      logger.error('Cleanup failed:', error);
      throw error;
    }
  }

  public async runCompleteDemo(): Promise<void> {
    try {
      // Initialize the system
      await this.initializeSystem();

      // Monitor initial health
      await this.monitorSystemHealth();

      // Demonstrate capabilities
      await this.demonstrateAgentCapabilities();

      // Create a single video
      await this.createSingleVideo();

      // Create batch videos
      await this.createBatchVideos();

      // Final health check
      await this.monitorSystemHealth();

      logger.info('Complete demo finished successfully');

    } catch (error) {
      logger.error('Demo failed:', error);
      throw error;
    } finally {
      // Always cleanup
      await this.cleanup();
    }
  }
}

// Usage example
export async function runIntegrationDemo(): Promise<void> {
  const demo = new IntegrationExample();
  await demo.runCompleteDemo();
}

// Export for use in other modules
export default IntegrationExample;