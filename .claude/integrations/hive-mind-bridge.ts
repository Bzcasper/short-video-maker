import { EventEmitter } from 'events';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../../src/logger';

interface HiveMindConfig {
  version: string;
  initialized: string;
  defaults: {
    queenType: string;
    maxWorkers: number;
    consensusAlgorithm: string;
    memorySize: number;
    autoScale: boolean;
    encryption: boolean;
  };
  mcpTools: {
    enabled: boolean;
    parallel: boolean;
    timeout: number;
  };
}

interface ClaudeConfig {
  version: string;
  initialized: string;
  project: {
    name: string;
    type: string;
    domain: string;
    complexity: string;
  };
  integration: {
    hiveMind: {
      enabled: boolean;
      configPath: string;
      database: string;
      syncInterval: number;
      sharedMemory: boolean;
    };
  };
  agents: {
    maxConcurrent: number;
    coordination: string;
  };
}

export class HiveMindBridge extends EventEmitter {
  private hiveMindConfig: HiveMindConfig;
  private claudeConfig: ClaudeConfig;
  private syncInterval: NodeJS.Timeout | null = null;
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    super();
    this.basePath = basePath;
    this.loadConfigs();
    this.initializeSync();
  }

  private loadConfigs(): void {
    try {
      const hiveMindPath = join(this.basePath, '.hive-mind/config.json');
      const claudePath = join(this.basePath, '.claude/config.json');

      this.hiveMindConfig = JSON.parse(readFileSync(hiveMindPath, 'utf-8'));
      this.claudeConfig = JSON.parse(readFileSync(claudePath, 'utf-8'));

      logger.info('HiveMind-Claude bridge configs loaded successfully');
    } catch (error) {
      logger.error('Failed to load bridge configs:', error);
      throw error;
    }
  }

  private initializeSync(): void {
    if (!this.claudeConfig.integration.hiveMind.enabled) {
      logger.info('HiveMind integration disabled');
      return;
    }

    const syncInterval = this.claudeConfig.integration.hiveMind.syncInterval || 30000;
    this.syncInterval = setInterval(() => {
      this.syncStates();
    }, syncInterval);

    logger.info(`HiveMind sync initialized with ${syncInterval}ms interval`);
  }

  private syncStates(): void {
    try {
      // Sync agent counts
      const claudeMaxAgents = this.claudeConfig.agents.maxConcurrent;
      const hiveMindMaxWorkers = this.hiveMindConfig.defaults.maxWorkers;

      if (claudeMaxAgents !== hiveMindMaxWorkers) {
        logger.info(`Syncing agent counts: Claude=${claudeMaxAgents}, HiveMind=${hiveMindMaxWorkers}`);
        this.emit('agent-count-sync', { claude: claudeMaxAgents, hiveMind: hiveMindMaxWorkers });
      }

      // Sync MCP tool settings
      const mcpEnabled = this.hiveMindConfig.mcpTools.enabled;
      if (mcpEnabled) {
        this.emit('mcp-tools-sync', this.hiveMindConfig.mcpTools);
      }

      // Memory sharing sync
      if (this.claudeConfig.integration.hiveMind.sharedMemory) {
        this.emit('memory-sync-required');
      }

    } catch (error) {
      logger.error('Error during state sync:', error);
      this.emit('sync-error', error);
    }
  }

  public updateHiveMindConfig(updates: Partial<HiveMindConfig>): void {
    try {
      this.hiveMindConfig = { ...this.hiveMindConfig, ...updates };
      const configPath = join(this.basePath, '.hive-mind/config.json');
      writeFileSync(configPath, JSON.stringify(this.hiveMindConfig, null, 2));
      
      logger.info('HiveMind config updated successfully');
      this.emit('hive-mind-config-updated', this.hiveMindConfig);
    } catch (error) {
      logger.error('Failed to update HiveMind config:', error);
      throw error;
    }
  }

  public updateClaudeConfig(updates: Partial<ClaudeConfig>): void {
    try {
      this.claudeConfig = { ...this.claudeConfig, ...updates };
      const configPath = join(this.basePath, '.claude/config.json');
      writeFileSync(configPath, JSON.stringify(this.claudeConfig, null, 2));
      
      logger.info('Claude config updated successfully');
      this.emit('claude-config-updated', this.claudeConfig);
    } catch (error) {
      logger.error('Failed to update Claude config:', error);
      throw error;
    }
  }

  public getHiveMindStatus(): HiveMindConfig {
    return { ...this.hiveMindConfig };
  }

  public getClaudeStatus(): ClaudeConfig {
    return { ...this.claudeConfig };
  }

  public async optimizeWorkerDistribution(): Promise<void> {
    try {
      const totalCapacity = this.hiveMindConfig.defaults.maxWorkers;
      const claudeAgents = this.claudeConfig.agents.maxConcurrent;
      
      // Calculate optimal distribution based on current load
      const optimalDistribution = Math.min(claudeAgents, totalCapacity);
      
      if (optimalDistribution !== claudeAgents) {
        this.updateClaudeConfig({
          ...this.claudeConfig,
          agents: {
            ...this.claudeConfig.agents,
            maxConcurrent: optimalDistribution
          }
        });
      }

      logger.info(`Worker distribution optimized: ${optimalDistribution} agents`);
      this.emit('worker-distribution-optimized', { optimal: optimalDistribution });
    } catch (error) {
      logger.error('Failed to optimize worker distribution:', error);
      throw error;
    }
  }

  public enableSharedMemory(): void {
    this.updateClaudeConfig({
      ...this.claudeConfig,
      integration: {
        ...this.claudeConfig.integration,
        hiveMind: {
          ...this.claudeConfig.integration.hiveMind,
          sharedMemory: true
        }
      }
    });

    logger.info('Shared memory enabled between HiveMind and Claude');
  }

  public destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.removeAllListeners();
    logger.info('HiveMind-Claude bridge destroyed');
  }
}

export default HiveMindBridge;