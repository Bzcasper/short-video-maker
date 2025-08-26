import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { logger } from "../logger";
import { Config } from "../config";

export interface ProcessResourceInfo {
  pid: number;
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage?: number;
  gpuMemoryUsage?: number;
  uptime: number;
}

export interface ProcessLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxGpuMemoryMB?: number;
  timeoutMs: number;
}

export interface ProcessMetrics {
  startTime: number;
  endTime?: number;
  peakMemoryMB: number;
  averageCpuPercent: number;
  totalFramesProcessed: number;
  errorsOccurred: number;
}

export interface FramePackEvents {
  spawned: () => void;
  processError: () => void;
  recoverableError: () => void;
  processStarted: () => void;
  resourceUpdate: (processId: string, resourceInfo: ProcessResourceInfo) => void;
  resourceLimitExceeded: (processId: string, warnings: string[], resourceInfo: ProcessResourceInfo) => void;
  progressUpdate: (processId: string, progress: number) => void;
  framesUpdate: (processId: string, frames: number) => void;
  stepUpdate: (processId: string, step: string) => void;
  processExit: (processId: string, code: number | null, signal: NodeJS.Signals | null) => void;
}

export declare interface FramePackProcessManager {
  on<U extends keyof FramePackEvents>(event: U, listener: FramePackEvents[U]): this;
  emit<U extends keyof FramePackEvents>(event: U, ...args: Parameters<FramePackEvents[U]>): boolean;
}

export class FramePackProcessManager extends EventEmitter {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private processMetrics: Map<string, ProcessMetrics> = new Map();
  private resourceMonitors: Map<string, NodeJS.Timeout> = new Map();
  private processLimits: ProcessLimits;

  constructor(private config: Config, limits?: Partial<ProcessLimits>) {
    super();
    
    // Set default limits based on system capabilities
    this.processLimits = {
      maxMemoryMB: limits?.maxMemoryMB || 8192, // 8GB default
      maxCpuPercent: limits?.maxCpuPercent || 90,
      maxGpuMemoryMB: limits?.maxGpuMemoryMB || 6144, // 6GB default
      timeoutMs: limits?.timeoutMs || 30 * 60 * 1000, // 30 minutes default
      ...limits,
    };
  }

  /**
   * Start a new FramePack process with resource monitoring
   */
  public async startProcess(
  processId: string,
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  } = {}
): Promise<ChildProcess> {
  if (this.activeProcesses.has(processId)) {
    throw new Error(`Process ${processId} is already running`);
  }

  logger.info("Starting FramePack process", { processId, command, args });

  const childProcess = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Emit event without additional data to avoid type issues
  // Remove arguments to avoid type issues
  this.emit('spawned');

  this.activeProcesses.set(processId, childProcess);
  
  // Initialize metrics tracking
  this.processMetrics.set(processId, {
    startTime: Date.now(),
    peakMemoryMB: 0,
    averageCpuPercent: 0,
    totalFramesProcessed: 0,
    errorsOccurred: 0,
  });

  // Set up resource monitoring
  this.startResourceMonitoring(processId, childProcess);

  // Set up timeout
  const timeout = options.timeout || this.processLimits.timeoutMs;
  setTimeout(() => {
    if (this.activeProcesses.has(processId)) {
      logger.warn("Process timeout reached, terminating");
      this.terminateProcess(processId, "SIGTERM");
    }
  }, timeout);

  // Handle process events
  childProcess.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    this.handleProcessExit(processId, code, signal);
  });

  childProcess.on("error", (error: Error) => {
    logger.error("Process error", { processId, error: error.message });
    // Emit event without additional data to avoid type issues
    // Remove arguments to avoid type issues
    this.emit("processError");
    this.updateErrorCount(processId);
  });

  // Monitor stdout for progress information
  childProcess.stdout?.on("data", (data: Buffer) => {
    this.parseProcessOutput(processId, data.toString());
  });

  childProcess.stderr?.on("data", (data: Buffer) => {
    const errorOutput = data.toString();
    logger.warn("Process stderr", { processId, stderr: errorOutput.trim() });
    
    // Check for specific error patterns that might require intervention
    if (this.isRecoverableError(errorOutput)) {
      // Emit event without additional data to avoid type issues
      // Remove arguments to avoid type issues
      this.emit("recoverableError");
    } else if (this.isFatalError(errorOutput)) {
      logger.error("Fatal error detected", { processId, stderr: errorOutput });
      this.terminateProcess(processId, "SIGKILL");
    }
  });

  // Emit event without additional data to avoid type issues
  // Remove arguments to avoid type issues
  this.emit("processStarted");
  return childProcess;
}

  /**
   * Gracefully terminate a process
   */
  public async terminateProcess(processId: string, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    const process = this.activeProcesses.get(processId);
    if (!process) {
      logger.warn("Process not found for termination", { processId });
      return;
    }

    logger.info("Terminating process");

    // Stop resource monitoring
    this.stopResourceMonitoring(processId);

    // Try graceful termination first
    if (signal === "SIGKILL" || !process.kill(signal)) {
      // Force kill if graceful termination fails
      process.kill("SIGKILL");
    }

    // Wait for process to exit or force cleanup after timeout
    setTimeout(() => {
      if (this.activeProcesses.has(processId)) {
        logger.warn("Process did not exit, forcing cleanup");
        this.cleanupProcess(processId);
      }
    }, 5000);
  }

  /**
   * Get current resource usage for a process
   */
  public async getProcessResourceUsage(processId: string): Promise<ProcessResourceInfo | null> {
    const process = this.activeProcesses.get(processId);
    if (!process || !process.pid) {
      return null;
    }

    try {
      // Get basic process information using ps command
      const { stdout } = await this.executeCommand("ps", [
        "-p", process.pid.toString(),
        "-o", "pid,pcpu,pmem,etime",
        "--no-headers"
      ]);

      const [pid, cpu, memory, etime] = stdout.trim().split(/\s+/);
      
      const resourceInfo: ProcessResourceInfo = {
        pid: parseInt(pid),
        cpuUsage: parseFloat(cpu),
        memoryUsage: parseFloat(memory),
        uptime: this.parseUptime(etime),
      };

      // Try to get GPU information if available
      try {
        const gpuInfo = await this.getGPUUsage(process.pid);
        if (gpuInfo) {
          resourceInfo.gpuUsage = gpuInfo.usage;
          resourceInfo.gpuMemoryUsage = gpuInfo.memory;
        }
      } catch (error) {
        // GPU monitoring is optional
        logger.debug("GPU monitoring not available", { processId, error: error.message });
      }

      return resourceInfo;
    } catch (error) {
      logger.error("Failed to get process resource usage", { processId, error: error.message });
      return null;
    }
  }

  /**
   * Get metrics for a process
   */
  public getProcessMetrics(processId: string): ProcessMetrics | null {
    return this.processMetrics.get(processId) || null;
  }

  /**
   * Get all active processes
   */
  public getActiveProcesses(): string[] {
    return Array.from(this.activeProcesses.keys());
  }

  /**
   * Check if a process is running
   */
  public isProcessRunning(processId: string): boolean {
    return this.activeProcesses.has(processId);
  }

  /**
   * Get process limits
   */
  public getProcessLimits(): ProcessLimits {
    return { ...this.processLimits };
  }

  /**
   * Update process limits
   */
  public updateProcessLimits(limits: Partial<ProcessLimits>): void {
    this.processLimits = { ...this.processLimits, ...limits };
    logger.info("Process limits updated");
  }

  /**
   * Clean up all processes
   */
  public async cleanup(): Promise<void> {
    const processIds = Array.from(this.activeProcesses.keys());
    
    logger.info("Cleaning up all FramePack processes");

    await Promise.all(
      processIds.map(processId => this.terminateProcess(processId, "SIGKILL"))
    );

    // Clear all tracking data
    this.activeProcesses.clear();
    this.processMetrics.clear();
    
    // Stop all resource monitors
    for (const [processId] of this.resourceMonitors) {
      this.stopResourceMonitoring(processId);
    }
  }

  /**
   * Start resource monitoring for a process
   */
  private startResourceMonitoring(processId: string, process: ChildProcess): void {
    const interval = setInterval(async () => {
      try {
        const resourceInfo = await this.getProcessResourceUsage(processId);
        if (!resourceInfo) {
          return; // Process might have exited
        }

        // Update metrics
        const metrics = this.processMetrics.get(processId);
        if (metrics) {
          metrics.peakMemoryMB = Math.max(metrics.peakMemoryMB, resourceInfo.memoryUsage);
          
          // Simple moving average for CPU
          const weight = 0.1;
          metrics.averageCpuPercent = metrics.averageCpuPercent * (1 - weight) + resourceInfo.cpuUsage * weight;
        }

        // Check resource limits
        this.checkResourceLimits(processId, resourceInfo);

        this.emit("resourceUpdate", processId, resourceInfo);
      } catch (error) {
        logger.debug("Resource monitoring error", { processId, error: error.message });
      }
    }, 5000); // Monitor every 5 seconds

    this.resourceMonitors.set(processId, interval);
  }

  /**
   * Stop resource monitoring for a process
   */
  private stopResourceMonitoring(processId: string): void {
    const interval = this.resourceMonitors.get(processId);
    if (interval) {
      clearInterval(interval);
      this.resourceMonitors.delete(processId);
    }
  }

  /**
   * Check if process is exceeding resource limits
   */
  private checkResourceLimits(processId: string, resourceInfo: ProcessResourceInfo): void {
    const warnings: string[] = [];

    if (resourceInfo.memoryUsage > this.processLimits.maxMemoryMB) {
      warnings.push(`Memory usage (${resourceInfo.memoryUsage}MB) exceeds limit (${this.processLimits.maxMemoryMB}MB)`);
    }

    if (resourceInfo.cpuUsage > this.processLimits.maxCpuPercent) {
      warnings.push(`CPU usage (${resourceInfo.cpuUsage}%) exceeds limit (${this.processLimits.maxCpuPercent}%)`);
    }

    if (resourceInfo.gpuMemoryUsage && this.processLimits.maxGpuMemoryMB) {
      if (resourceInfo.gpuMemoryUsage > this.processLimits.maxGpuMemoryMB) {
        warnings.push(`GPU memory usage (${resourceInfo.gpuMemoryUsage}MB) exceeds limit (${this.processLimits.maxGpuMemoryMB}MB)`);
      }
    }

    if (warnings.length > 0) {
      logger.warn("Process exceeding resource limits", { processId, warnings, resourceInfo });
      this.emit("resourceLimitExceeded", processId, warnings, resourceInfo);
    }
  }

  /**
   * Parse process output for progress and error information
   */
  private parseProcessOutput(processId: string, output: string): void {
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Parse progress information
      const progressMatch = trimmedLine.match(/Progress: (\d+)%/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1]);
        this.emit("progressUpdate", processId, progress);
      }

      // Parse frame count
      const frameMatch = trimmedLine.match(/Frames generated: (\d+)/);
      if (frameMatch) {
        const frames = parseInt(frameMatch[1]);
        const metrics = this.processMetrics.get(processId);
        if (metrics) {
          metrics.totalFramesProcessed = frames;
        }
        this.emit("framesUpdate", processId, frames);
      }

      // Parse step information
      const stepMatch = trimmedLine.match(/Step: (.+)/);
      if (stepMatch) {
        this.emit("stepUpdate", processId, stepMatch[1]);
      }

      // Log significant output
      logger.debug("Process output", { processId, output: trimmedLine });
    }
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(processId: string, code: number | null, signal: NodeJS.Signals | null): void {
    logger.info("Process exited", { processId, code, signal });

    const metrics = this.processMetrics.get(processId);
    if (metrics) {
      metrics.endTime = Date.now();
    }

    this.cleanupProcess(processId);
    this.emit("processExit", processId, code, signal);
  }

  /**
   * Clean up process tracking data
   */
  private cleanupProcess(processId: string): void {
    this.activeProcesses.delete(processId);
    this.stopResourceMonitoring(processId);
  }

  /**
   * Update error count for a process
   */
  private updateErrorCount(processId: string): void {
    const metrics = this.processMetrics.get(processId);
    if (metrics) {
      metrics.errorsOccurred++;
    }
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverableError(errorOutput: string): boolean {
    const recoverablePatterns = [
      /CUDA out of memory/i,
      /RuntimeError: out of memory/i,
      /connection timeout/i,
      /temporary failure/i,
    ];

    return recoverablePatterns.some(pattern => pattern.test(errorOutput));
  }

  /**
   * Check if error is fatal
   */
  private isFatalError(errorOutput: string): boolean {
    const fatalPatterns = [
      /Segmentation fault/i,
      /core dumped/i,
      /fatal error/i,
      /corrupted/i,
    ];

    return fatalPatterns.some(pattern => pattern.test(errorOutput));
  }

  /**
   * Get GPU usage information
   */
  private async getGPUUsage(pid: number): Promise<{ usage: number; memory: number } | null> {
    try {
      const { stdout } = await this.executeCommand("nvidia-smi", [
        "--query-compute-apps=pid,used_memory",
        "--format=csv,noheader,nounits"
      ]);

      for (const line of stdout.split('\n')) {
        const [processPid, memory] = line.trim().split(',');
        if (parseInt(processPid) === pid) {
          return {
            usage: 0, // nvidia-smi doesn't provide GPU usage per process
            memory: parseInt(memory),
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse uptime string
   */
  private parseUptime(etime: string): number {
    // Parse format like "00:05:30" or "1-00:05:30"
    const parts = etime.split('-');
    let totalSeconds = 0;

    if (parts.length === 2) {
      // Days included
      totalSeconds += parseInt(parts[0]) * 24 * 60 * 60;
      const timeParts = parts[1].split(':');
      totalSeconds += parseInt(timeParts[0]) * 60 * 60; // hours
      totalSeconds += parseInt(timeParts[1]) * 60; // minutes
      totalSeconds += parseInt(timeParts[2]); // seconds
    } else {
      // Only time
      const timeParts = parts[0].split(':');
      if (timeParts.length === 3) {
        totalSeconds += parseInt(timeParts[0]) * 60 * 60; // hours
        totalSeconds += parseInt(timeParts[1]) * 60; // minutes
        totalSeconds += parseInt(timeParts[2]); // seconds
      } else if (timeParts.length === 2) {
        totalSeconds += parseInt(timeParts[0]) * 60; // minutes
        totalSeconds += parseInt(timeParts[1]); // seconds
      }
    }

    return totalSeconds;
  }

  /**
   * Execute a command and return stdout
   */
  private async executeCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, { stdio: "pipe" });
      let stdout = "";
      let stderr = "";

      process.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      process.on("error", reject);
    });
  }
}