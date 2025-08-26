import { EventEmitter } from 'events';
import { logger } from '../../src/logger';
import { MCPRouter } from '../../src/server/routers/mcp';
import { ShortCreator } from '../../src/short-creator/ShortCreator';

interface MCPServiceConfig {
  enabled: boolean;
  router: string;
  tools: string[];
  transport: string;
  parallel: boolean;
}

interface AgentToolMapping {
  agentId: string;
  availableTools: string[];
  preferredTools: string[];
  fallbackTools: string[];
}

export class MCPServiceBridge extends EventEmitter {
  private mcpRouter: MCPRouter;
  private shortCreator: ShortCreator;
  private agentToolMappings: Map<string, AgentToolMapping> = new Map();
  private activeConnections: Map<string, any> = new Map();

  constructor(shortCreator: ShortCreator) {
    super();
    this.shortCreator = shortCreator;
    this.mcpRouter = new MCPRouter(shortCreator);
    this.initializeAgentMappings();
  }

  private initializeAgentMappings(): void {
    // Video Specialist - primary video creation agent
    this.agentToolMappings.set('video-specialist', {
      agentId: 'video-specialist',
      availableTools: ['get-video-status', 'create-short-video'],
      preferredTools: ['create-short-video'],
      fallbackTools: ['get-video-status']
    });

    // Script Coordinator - script generation focused
    this.agentToolMappings.set('script-coordinator', {
      agentId: 'script-coordinator',
      availableTools: ['get-video-status'],
      preferredTools: [],
      fallbackTools: ['get-video-status']
    });

    // FramePack Orchestrator - video rendering management
    this.agentToolMappings.set('framepack-orchestrator', {
      agentId: 'framepack-orchestrator',
      availableTools: ['get-video-status', 'create-short-video'],
      preferredTools: ['get-video-status'],
      fallbackTools: ['create-short-video']
    });

    // Quality Assurance - monitoring and validation
    this.agentToolMappings.set('quality-assurance', {
      agentId: 'quality-assurance',
      availableTools: ['get-video-status'],
      preferredTools: ['get-video-status'],
      fallbackTools: []
    });

    // Cost Optimizer - cost tracking
    this.agentToolMappings.set('cost-optimizer', {
      agentId: 'cost-optimizer',
      availableTools: ['get-video-status'],
      preferredTools: ['get-video-status'],
      fallbackTools: []
    });

    logger.info('Agent-MCP tool mappings initialized');
  }

  public async executeToolForAgent(
    agentId: string,
    toolName: string,
    parameters: Record<string, any>
  ): Promise<any> {
    try {
      const mapping = this.agentToolMappings.get(agentId);
      if (!mapping) {
        throw new Error(`No MCP tool mapping found for agent: ${agentId}`);
      }

      if (!mapping.availableTools.includes(toolName)) {
        throw new Error(`Tool ${toolName} not available for agent ${agentId}`);
      }

      const result = await this.executeMCPTool(toolName, parameters);
      
      this.emit('tool-executed', {
        agentId,
        toolName,
        parameters,
        result,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      logger.error(`Failed to execute MCP tool for agent ${agentId}:`, error);
      this.emit('tool-error', { agentId, toolName, error });
      throw error;
    }
  }

  private async executeMCPTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    switch (toolName) {
      case 'get-video-status':
        return this.getVideoStatus(parameters.videoId);
      
      case 'create-short-video':
        return this.createShortVideo(parameters.scenes, parameters.config);
      
      default:
        throw new Error(`Unknown MCP tool: ${toolName}`);
    }
  }

  private async getVideoStatus(videoId: string): Promise<any> {
    try {
      const status = this.shortCreator.status(videoId);
      return {
        videoId,
        status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get video status for ${videoId}:`, error);
      throw error;
    }
  }

  private async createShortVideo(scenes: any[], config: any): Promise<any> {
    try {
      const videoId = await this.shortCreator.addToQueue(scenes, config);
      return {
        videoId,
        status: 'queued',
        scenes: scenes.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to create short video:', error);
      throw error;
    }
  }

  public getAvailableToolsForAgent(agentId: string): string[] {
    const mapping = this.agentToolMappings.get(agentId);
    return mapping ? mapping.availableTools : [];
  }

  public getPreferredToolsForAgent(agentId: string): string[] {
    const mapping = this.agentToolMappings.get(agentId);
    return mapping ? mapping.preferredTools : [];
  }

  public async executeParallelTools(
    agentId: string,
    toolExecutions: Array<{ toolName: string; parameters: Record<string, any> }>
  ): Promise<any[]> {
    try {
      const promises = toolExecutions.map(execution => 
        this.executeToolForAgent(agentId, execution.toolName, execution.parameters)
      );

      const results = await Promise.allSettled(promises);
      
      this.emit('parallel-tools-executed', {
        agentId,
        executions: toolExecutions.length,
        results: results.length,
        timestamp: new Date().toISOString()
      });

      return results.map(result => 
        result.status === 'fulfilled' ? result.value : { error: result.reason }
      );
    } catch (error) {
      logger.error(`Failed to execute parallel tools for agent ${agentId}:`, error);
      throw error;
    }
  }

  public registerAgentConnection(agentId: string, connection: any): void {
    this.activeConnections.set(agentId, connection);
    this.emit('agent-connected', { agentId, timestamp: new Date().toISOString() });
    logger.info(`Agent ${agentId} connected to MCP service bridge`);
  }

  public unregisterAgentConnection(agentId: string): void {
    this.activeConnections.delete(agentId);
    this.emit('agent-disconnected', { agentId, timestamp: new Date().toISOString() });
    logger.info(`Agent ${agentId} disconnected from MCP service bridge`);
  }

  public getActiveConnections(): string[] {
    return Array.from(this.activeConnections.keys());
  }

  public getConnectionHealth(): Record<string, any> {
    const connections = Array.from(this.activeConnections.keys());
    return {
      totalConnections: connections.length,
      activeAgents: connections,
      mcpRouterStatus: 'active',
      shortCreatorStatus: 'active',
      timestamp: new Date().toISOString()
    };
  }

  public async broadcastToAgents(message: any): Promise<void> {
    const activeAgents = Array.from(this.activeConnections.keys());
    
    for (const agentId of activeAgents) {
      try {
        const connection = this.activeConnections.get(agentId);
        if (connection && connection.send) {
          await connection.send(message);
        }
      } catch (error) {
        logger.error(`Failed to broadcast to agent ${agentId}:`, error);
      }
    }

    this.emit('broadcast-sent', {
      message,
      recipients: activeAgents.length,
      timestamp: new Date().toISOString()
    });
  }

  public destroy(): void {
    this.activeConnections.clear();
    this.agentToolMappings.clear();
    this.removeAllListeners();
    logger.info('MCP Service Bridge destroyed');
  }
}

export default MCPServiceBridge;