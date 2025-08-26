// Integration utilities for the Short Video Maker package
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../src/logger';
import ClaudeIntegration from './index';
import { ShortCreator } from '../src/short-creator/ShortCreator';

export interface PackageIntegrationOptions {
  enableHiveMind?: boolean;
  enableClaudeFlow?: boolean;
  enableMCP?: boolean;
  autoInitialize?: boolean;
  basePath?: string;
}

export class PackageIntegration {
  private claudeIntegration?: ClaudeIntegration;
  private shortCreator?: ShortCreator;
  private basePath: string;
  private options: PackageIntegrationOptions;

  constructor(options: PackageIntegrationOptions = {}) {
    this.basePath = options.basePath || process.cwd();
    this.options = {
      enableHiveMind: true,
      enableClaudeFlow: true,
      enableMCP: true,
      autoInitialize: false,
      ...options
    };

    this.ensureDirectoryStructure();
  }

  private ensureDirectoryStructure(): void {
    const requiredDirs = [
      '.claude',
      '.claude/agents',
      '.claude/workflows', 
      '.claude/integrations',
      '.claude/hooks',
      '.claude/examples'
    ];

    for (const dir of requiredDirs) {
      const fullPath = join(this.basePath, dir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    }
  }

  public async initializeWithShortCreator(shortCreator: ShortCreator): Promise<ClaudeIntegration> {
    try {
      this.shortCreator = shortCreator;
      this.claudeIntegration = new ClaudeIntegration(this.basePath);
      
      await this.claudeIntegration.initialize(shortCreator);
      
      logger.info('Claude integration initialized with ShortCreator');
      return this.claudeIntegration;
    } catch (error) {
      logger.error('Failed to initialize Claude integration with ShortCreator:', error);
      throw error;
    }
  }

  public getClaudeIntegration(): ClaudeIntegration | undefined {
    return this.claudeIntegration;
  }

  public async createVideo(
    topic: string,
    platform: 'tiktok' | 'instagram' | 'youtube' = 'tiktok',
    options?: Record<string, any>
  ): Promise<any> {
    if (!this.claudeIntegration) {
      throw new Error('Claude integration not initialized. Call initializeWithShortCreator first.');
    }

    return this.claudeIntegration.executeVideoGenerationWorkflow(topic, {
      platform,
      ...options
    });
  }

  public async createBatch(
    topics: string[],
    platform: 'tiktok' | 'instagram' | 'youtube' = 'tiktok',
    options?: Record<string, any>
  ): Promise<any> {
    if (!this.claudeIntegration) {
      throw new Error('Claude integration not initialized. Call initializeWithShortCreator first.');
    }

    const requests = topics.map(topic => ({
      topic,
      options: { platform, ...options }
    }));

    return this.claudeIntegration.executeBatchProcessing(requests);
  }

  public getSystemHealth(): Record<string, any> {
    if (!this.claudeIntegration) {
      return { status: 'not-initialized' };
    }

    return this.claudeIntegration.getSystemStatus();
  }

  public async getWorkflowTemplates(): Promise<Record<string, any>> {
    if (!this.claudeIntegration) {
      return {};
    }

    return this.claudeIntegration.getWorkflowTemplates();
  }

  public destroy(): void {
    if (this.claudeIntegration) {
      this.claudeIntegration.destroy();
      this.claudeIntegration = undefined;
    }

    logger.info('Package integration destroyed');
  }
}

// Factory function for easy integration
export function createClaudeIntegration(
  shortCreator: ShortCreator,
  options?: PackageIntegrationOptions
): Promise<ClaudeIntegration> {
  const integration = new PackageIntegration(options);
  return integration.initializeWithShortCreator(shortCreator);
}

// Helper function for quick video creation
export async function createVideoWithClaude(
  shortCreator: ShortCreator,
  topic: string,
  platform: 'tiktok' | 'instagram' | 'youtube' = 'tiktok',
  options?: Record<string, any>
): Promise<any> {
  const claudeIntegration = await createClaudeIntegration(shortCreator);
  
  try {
    const result = await claudeIntegration.executeVideoGenerationWorkflow(topic, {
      platform,
      ...options
    });
    
    return result;
  } finally {
    claudeIntegration.destroy();
  }
}

export default PackageIntegration;