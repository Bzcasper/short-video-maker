import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../src/logger';

interface PerformanceMetrics {
  startTime: number;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalAgents: number;
  activeAgents: number;
  neuralEvents: number;
}

interface TaskMetrics {
  taskId: string;
  agentId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  metrics?: {
    qualityScore?: number;
    costEfficiency?: number;
    resourceUtilization?: number;
    [key: string]: any;
  };
}

export class ClaudeFlowBridge extends EventEmitter {
  private basePath: string;
  private performanceMetrics: PerformanceMetrics;
  private taskMetrics: Map<string, TaskMetrics> = new Map();
  private metricsPath: string;

  constructor(basePath: string = process.cwd()) {
    super();
    this.basePath = basePath;
    this.metricsPath = join(basePath, '.claude-flow/metrics/');
    this.loadMetrics();
    this.initializeTracking();
  }

  private loadMetrics(): void {
    try {
      const performancePath = join(this.metricsPath, 'performance.json');
      const taskMetricsPath = join(this.metricsPath, 'task-metrics.json');

      if (existsSync(performancePath)) {
        this.performanceMetrics = JSON.parse(readFileSync(performancePath, 'utf-8'));
      } else {
        this.performanceMetrics = {
          startTime: Date.now(),
          totalTasks: 0,
          successfulTasks: 0,
          failedTasks: 0,
          totalAgents: 0,
          activeAgents: 0,
          neuralEvents: 0
        };
      }

      if (existsSync(taskMetricsPath)) {
        const taskData = JSON.parse(readFileSync(taskMetricsPath, 'utf-8'));
        if (Array.isArray(taskData)) {
          taskData.forEach(task => {
            this.taskMetrics.set(task.taskId, task);
          });
        }
      }

      logger.info('Claude Flow metrics loaded successfully');
    } catch (error) {
      logger.error('Failed to load Claude Flow metrics:', error);
      throw error;
    }
  }

  private initializeTracking(): void {
    // Auto-save metrics every 30 seconds
    setInterval(() => {
      this.saveMetrics();
    }, 30000);

    logger.info('Claude Flow tracking initialized');
  }

  private saveMetrics(): void {
    try {
      const performancePath = join(this.metricsPath, 'performance.json');
      const taskMetricsPath = join(this.metricsPath, 'task-metrics.json');

      writeFileSync(performancePath, JSON.stringify(this.performanceMetrics, null, 2));
      
      const taskArray = Array.from(this.taskMetrics.values());
      writeFileSync(taskMetricsPath, JSON.stringify(taskArray, null, 2));

      this.emit('metrics-saved', { timestamp: Date.now() });
    } catch (error) {
      logger.error('Failed to save Claude Flow metrics:', error);
      this.emit('metrics-error', error);
    }
  }

  public startTask(taskId: string, agentId: string): void {
    const task: TaskMetrics = {
      taskId,
      agentId,
      startTime: Date.now(),
      status: 'running'
    };

    this.taskMetrics.set(taskId, task);
    this.performanceMetrics.totalTasks++;
    this.performanceMetrics.activeAgents++;

    this.emit('task-started', task);
    logger.info(`Task ${taskId} started by agent ${agentId}`);
  }

  public completeTask(taskId: string, metrics?: Record<string, any>): void {
    const task = this.taskMetrics.get(taskId);
    if (!task) {
      logger.error(`Task ${taskId} not found`);
      return;
    }

    const endTime = Date.now();
    task.endTime = endTime;
    task.duration = endTime - task.startTime;
    task.status = 'completed';
    task.metrics = metrics;

    this.performanceMetrics.successfulTasks++;
    this.performanceMetrics.activeAgents = Math.max(0, this.performanceMetrics.activeAgents - 1);

    this.emit('task-completed', task);
    logger.info(`Task ${taskId} completed in ${task.duration}ms`);
  }

  public failTask(taskId: string, error?: any): void {
    const task = this.taskMetrics.get(taskId);
    if (!task) {
      logger.error(`Task ${taskId} not found`);
      return;
    }

    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    task.status = 'failed';
    task.metrics = { error: error?.message || 'Unknown error' };

    this.performanceMetrics.failedTasks++;
    this.performanceMetrics.activeAgents = Math.max(0, this.performanceMetrics.activeAgents - 1);

    this.emit('task-failed', task);
    logger.error(`Task ${taskId} failed: ${error?.message || 'Unknown error'}`);
  }

  public recordNeuralEvent(eventType: string, data?: Record<string, any>): void {
    this.performanceMetrics.neuralEvents++;

    this.emit('neural-event', {
      eventType,
      data,
      timestamp: Date.now()
    });

    logger.debug(`Neural event recorded: ${eventType}`);
  }

  public updateAgentCount(totalAgents: number): void {
    this.performanceMetrics.totalAgents = totalAgents;
    this.emit('agent-count-updated', { totalAgents, timestamp: Date.now() });
  }

  public getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  public getTaskMetrics(taskId?: string): TaskMetrics | TaskMetrics[] {
    if (taskId) {
      return this.taskMetrics.get(taskId) || null;
    }
    return Array.from(this.taskMetrics.values());
  }

  public getAgentPerformance(agentId: string): {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageDuration: number;
    averageQualityScore: number;
  } {
    const agentTasks = Array.from(this.taskMetrics.values())
      .filter(task => task.agentId === agentId);

    const completedTasks = agentTasks.filter(task => task.status === 'completed');
    const failedTasks = agentTasks.filter(task => task.status === 'failed');

    const totalDuration = completedTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
    const averageDuration = completedTasks.length > 0 ? totalDuration / completedTasks.length : 0;

    const qualityScores = completedTasks
      .map(task => task.metrics?.qualityScore)
      .filter(score => typeof score === 'number');
    const averageQualityScore = qualityScores.length > 0 
      ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length 
      : 0;

    return {
      totalTasks: agentTasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      averageDuration,
      averageQualityScore
    };
  }

  public getSystemHealth(): {
    successRate: number;
    averageTaskDuration: number;
    activeTaskCount: number;
    systemUptime: number;
  } {
    const activeTasks = Array.from(this.taskMetrics.values())
      .filter(task => task.status === 'running');

    const completedTasks = Array.from(this.taskMetrics.values())
      .filter(task => task.status === 'completed');

    const totalDuration = completedTasks.reduce((sum, task) => sum + (task.duration || 0), 0);
    const averageTaskDuration = completedTasks.length > 0 ? totalDuration / completedTasks.length : 0;

    const successRate = this.performanceMetrics.totalTasks > 0 
      ? this.performanceMetrics.successfulTasks / this.performanceMetrics.totalTasks 
      : 0;

    const systemUptime = Date.now() - this.performanceMetrics.startTime;

    return {
      successRate,
      averageTaskDuration,
      activeTaskCount: activeTasks.length,
      systemUptime
    };
  }

  public resetMetrics(): void {
    this.performanceMetrics = {
      startTime: Date.now(),
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      totalAgents: 0,
      activeAgents: 0,
      neuralEvents: 0
    };

    this.taskMetrics.clear();
    this.saveMetrics();

    this.emit('metrics-reset', { timestamp: Date.now() });
    logger.info('Claude Flow metrics reset');
  }

  public exportMetrics(): {
    performance: PerformanceMetrics;
    tasks: TaskMetrics[];
    timestamp: number;
  } {
    return {
      performance: this.getPerformanceMetrics(),
      tasks: Array.from(this.taskMetrics.values()),
      timestamp: Date.now()
    };
  }

  public destroy(): void {
    this.saveMetrics();
    this.removeAllListeners();
    logger.info('Claude Flow bridge destroyed');
  }
}

export default ClaudeFlowBridge;