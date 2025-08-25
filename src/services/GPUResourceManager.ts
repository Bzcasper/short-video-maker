import { spawn } from "child_process";
import { EventEmitter } from "events";
import { logger } from "../logger";

export interface GPUInfo {
  index: number;
  name: string;
  totalMemoryMB: number;
  freeMemoryMB: number;
  usedMemoryMB: number;
  utilization: number;
  temperature?: number;
  powerDraw?: number;
  maxPowerLimit?: number;
}

export interface GPUResourceAllocation {
  gpuId: number;
  allocatedMemoryMB: number;
  processId: string;
  allocatedAt: string;
  priority: number;
}

export interface ResourceLimits {
  maxMemoryAllocationMB: number;
  maxUtilizationPercent: number;
  maxTemperature: number;
  reservedMemoryMB: number;
}

export class GPUResourceManager extends EventEmitter {
  private allocations: Map<string, GPUResourceAllocation> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private resourceLimits: ResourceLimits;
  private lastGPUInfo: GPUInfo[] = [];

  constructor(
    private monitorIntervalMs: number = 5000,
    limits?: Partial<ResourceLimits>
  ) {
    super();
    
    this.resourceLimits = {
      maxMemoryAllocationMB: limits?.maxMemoryAllocationMB || 5120, // 5GB default
      maxUtilizationPercent: limits?.maxUtilizationPercent || 90,
      maxTemperature: limits?.maxTemperature || 85,
      reservedMemoryMB: limits?.reservedMemoryMB || 1024, // 1GB reserved
      ...limits,
    };
  }

  /**
   * Initialize GPU monitoring
   */
  public async initialize(): Promise<boolean> {
    try {
      const gpuInfo = await this.getGPUInfo();
      if (gpuInfo.length === 0) {
        logger.warn("No NVIDIA GPUs detected");
        return false;
      }

      this.lastGPUInfo = gpuInfo;
      logger.info({ gpuCount: gpuInfo.length, gpus: gpuInfo }, "GPU resource manager initialized");

      this.startMonitoring();
      return true;
    } catch (error) {
      logger.error({ error: error.message }, "Failed to initialize GPU resource manager");
      return false;
    }
  }

  /**
   * Get current GPU information
   */
  public async getGPUInfo(): Promise<GPUInfo[]> {
    return new Promise((resolve, reject) => {
      const nvidia = spawn("nvidia-smi", [
        "--query-gpu=index,name,memory.total,memory.free,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit",
        "--format=csv,noheader,nounits"
      ], { stdio: "pipe" });

      let output = "";
      let error = "";

      nvidia.stdout?.on("data", (data) => {
        output += data.toString();
      });

      nvidia.stderr?.on("data", (data) => {
        error += data.toString();
      });

      nvidia.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`nvidia-smi failed: ${error}`));
          return;
        }

        try {
          const gpuInfo: GPUInfo[] = output.trim().split('\n').map(line => {
            const [index, name, totalMem, freeMem, usedMem, util, temp, powerDraw, powerLimit] = line.split(', ');
            
            return {
              index: parseInt(index),
              name: name.trim(),
              totalMemoryMB: parseInt(totalMem),
              freeMemoryMB: parseInt(freeMem),
              usedMemoryMB: parseInt(usedMem),
              utilization: parseInt(util),
              temperature: temp !== "[Not Supported]" ? parseInt(temp) : undefined,
              powerDraw: powerDraw !== "[Not Supported]" ? parseInt(powerDraw) : undefined,
              maxPowerLimit: powerLimit !== "[Not Supported]" ? parseInt(powerLimit) : undefined,
            };
          });

          resolve(gpuInfo);
        } catch (parseError) {
          reject(new Error(`Failed to parse GPU info: ${parseError.message}`));
        }
      });

      nvidia.on("error", reject);
    });
  }

  /**
   * Allocate GPU resources for a process
   */
  public async allocateResources(
    processId: string,
    requestedMemoryMB: number,
    priority: number = 1
  ): Promise<GPUResourceAllocation | null> {
    try {
      const gpuInfo = await this.getGPUInfo();
      const bestGPU = this.findBestGPU(gpuInfo, requestedMemoryMB);
      
      if (!bestGPU) {
        logger.warn({ 
          processId, 
          requestedMemoryMB, 
          availableGPUs: gpuInfo.map(gpu => ({ 
            index: gpu.index, 
            freeMB: gpu.freeMemoryMB 
          })) 
        }, "No suitable GPU found for allocation");
        return null;
      }

      const allocation: GPUResourceAllocation = {
        gpuId: bestGPU.index,
        allocatedMemoryMB: requestedMemoryMB,
        processId,
        allocatedAt: new Date().toISOString(),
        priority,
      };

      this.allocations.set(processId, allocation);
      
      logger.info({
        processId,
        gpuId: bestGPU.index,
        allocatedMemoryMB: requestedMemoryMB,
        gpuFreeBefore: bestGPU.freeMemoryMB,
        gpuFreeAfter: bestGPU.freeMemoryMB - requestedMemoryMB
      }, "GPU resources allocated");

      this.emit("resourceAllocated", allocation);
      return allocation;

    } catch (error) {
      logger.error({ processId, error: error.message }, "Failed to allocate GPU resources");
      return null;
    }
  }

  /**
   * Release GPU resources for a process
   */
  public releaseResources(processId: string): void {
    const allocation = this.allocations.get(processId);
    if (allocation) {
      this.allocations.delete(processId);
      
      logger.info({
        processId,
        gpuId: allocation.gpuId,
        releasedMemoryMB: allocation.allocatedMemoryMB,
      }, "GPU resources released");

      this.emit("resourceReleased", allocation);
    }
  }

  /**
   * Get current resource allocations
   */
  public getAllocations(): GPUResourceAllocation[] {
    return Array.from(this.allocations.values());
  }

  /**
   * Get allocation for a specific process
   */
  public getAllocation(processId: string): GPUResourceAllocation | null {
    return this.allocations.get(processId) || null;
  }

  /**
   * Check if resources are available for allocation
   */
  public async canAllocateResources(requestedMemoryMB: number): Promise<boolean> {
    try {
      const gpuInfo = await this.getGPUInfo();
      return this.findBestGPU(gpuInfo, requestedMemoryMB) !== null;
    } catch (error) {
      logger.error({ error: error.message }, "Failed to check resource availability");
      return false;
    }
  }

  /**
   * Get resource utilization summary
   */
  public getResourceSummary(): {
    totalGPUs: number;
    totalMemoryMB: number;
    freeMemoryMB: number;
    usedMemoryMB: number;
    activeAllocations: number;
    averageUtilization: number;
  } {
    const totalGPUs = this.lastGPUInfo.length;
    const totalMemoryMB = this.lastGPUInfo.reduce((sum, gpu) => sum + gpu.totalMemoryMB, 0);
    const freeMemoryMB = this.lastGPUInfo.reduce((sum, gpu) => sum + gpu.freeMemoryMB, 0);
    const usedMemoryMB = this.lastGPUInfo.reduce((sum, gpu) => sum + gpu.usedMemoryMB, 0);
    const averageUtilization = this.lastGPUInfo.reduce((sum, gpu) => sum + gpu.utilization, 0) / totalGPUs || 0;

    return {
      totalGPUs,
      totalMemoryMB,
      freeMemoryMB,
      usedMemoryMB,
      activeAllocations: this.allocations.size,
      averageUtilization,
    };
  }

  /**
   * Update resource limits
   */
  public updateLimits(limits: Partial<ResourceLimits>): void {
    this.resourceLimits = { ...this.resourceLimits, ...limits };
    logger.info({ limits: this.resourceLimits }, "GPU resource limits updated");
  }

  /**
   * Get current resource limits
   */
  public getLimits(): ResourceLimits {
    return { ...this.resourceLimits };
  }

  /**
   * Force cleanup of stale allocations
   */
  public async cleanupStaleAllocations(maxAgeMinutes: number = 60): Promise<void> {
    const staleTime = Date.now() - (maxAgeMinutes * 60 * 1000);
    const staleAllocations: string[] = [];

    for (const [processId, allocation] of this.allocations) {
      const allocationTime = new Date(allocation.allocatedAt).getTime();
      if (allocationTime < staleTime) {
        // Check if process is still running
        const isRunning = await this.isProcessRunning(processId);
        if (!isRunning) {
          staleAllocations.push(processId);
        }
      }
    }

    for (const processId of staleAllocations) {
      this.releaseResources(processId);
      logger.info({ processId }, "Cleaned up stale GPU resource allocation");
    }

    if (staleAllocations.length > 0) {
      this.emit("staleAllocationsCleanedUp", staleAllocations);
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  public shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Release all allocations
    const processIds = Array.from(this.allocations.keys());
    for (const processId of processIds) {
      this.releaseResources(processId);
    }

    logger.info("GPU resource manager shut down");
  }

  /**
   * Start periodic monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        const gpuInfo = await this.getGPUInfo();
        this.lastGPUInfo = gpuInfo;
        
        // Check for resource limit violations
        this.checkResourceLimits(gpuInfo);
        
        this.emit("gpuInfoUpdated", gpuInfo);
      } catch (error) {
        logger.warn({ error: error.message }, "GPU monitoring update failed");
      }
    }, this.monitorIntervalMs);
  }

  /**
   * Find the best GPU for allocation
   */
  private findBestGPU(gpuInfo: GPUInfo[], requestedMemoryMB: number): GPUInfo | null {
    // Filter GPUs that have enough free memory (including reserved memory)
    const availableGPUs = gpuInfo.filter(gpu => {
      const effectiveFreeMemory = gpu.freeMemoryMB - this.resourceLimits.reservedMemoryMB;
      return effectiveFreeMemory >= requestedMemoryMB && 
             gpu.utilization < this.resourceLimits.maxUtilizationPercent &&
             (gpu.temperature === undefined || gpu.temperature < this.resourceLimits.maxTemperature);
    });

    if (availableGPUs.length === 0) {
      return null;
    }

    // Sort by available memory (descending) and utilization (ascending)
    availableGPUs.sort((a, b) => {
      const aScore = a.freeMemoryMB - a.utilization;
      const bScore = b.freeMemoryMB - b.utilization;
      return bScore - aScore;
    });

    return availableGPUs[0];
  }

  /**
   * Check if resource limits are being exceeded
   */
  private checkResourceLimits(gpuInfo: GPUInfo[]): void {
    const warnings: string[] = [];

    for (const gpu of gpuInfo) {
      if (gpu.utilization > this.resourceLimits.maxUtilizationPercent) {
        warnings.push(`GPU ${gpu.index} utilization (${gpu.utilization}%) exceeds limit (${this.resourceLimits.maxUtilizationPercent}%)`);
      }

      if (gpu.temperature && gpu.temperature > this.resourceLimits.maxTemperature) {
        warnings.push(`GPU ${gpu.index} temperature (${gpu.temperature}°C) exceeds limit (${this.resourceLimits.maxTemperature}°C)`);
      }

      const freeMemoryPercent = (gpu.freeMemoryMB / gpu.totalMemoryMB) * 100;
      if (freeMemoryPercent < 10) { // Less than 10% free memory
        warnings.push(`GPU ${gpu.index} has low free memory (${freeMemoryPercent.toFixed(1)}%)`);
      }
    }

    if (warnings.length > 0) {
      logger.warn({ warnings, gpuInfo }, "GPU resource limit warnings");
      this.emit("resourceLimitWarning", warnings, gpuInfo);
    }
  }

  /**
   * Check if a process is still running
   */
  private async isProcessRunning(processId: string): Promise<boolean> {
    // This is a simplified check - in practice you might want to track PIDs
    // For now, we assume the process is running if the allocation exists
    return true;
  }

  /**
   * Get GPU memory usage by process
   */
  public async getProcessGPUUsage(): Promise<Array<{ pid: number; gpuId: number; memoryMB: number; name: string }>> {
    return new Promise((resolve, reject) => {
      const nvidia = spawn("nvidia-smi", [
        "--query-compute-apps=pid,gpu_uuid,used_memory,name",
        "--format=csv,noheader,nounits"
      ], { stdio: "pipe" });

      let output = "";
      let error = "";

      nvidia.stdout?.on("data", (data) => {
        output += data.toString();
      });

      nvidia.stderr?.on("data", (data) => {
        error += data.toString();
      });

      nvidia.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`nvidia-smi process query failed: ${error}`));
          return;
        }

        try {
          const processes = output.trim().split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
              const [pid, gpuUuid, memory, name] = line.split(', ');
              
              return {
                pid: parseInt(pid),
                gpuId: 0, // Would need to map UUID to ID
                memoryMB: parseInt(memory),
                name: name.trim(),
              };
            });

          resolve(processes);
        } catch (parseError) {
          reject(new Error(`Failed to parse process GPU usage: ${parseError.message}`));
        }
      });

      nvidia.on("error", reject);
    });
  }

  /**
   * Wait for GPU resources to become available
   */
  public async waitForResources(
    requestedMemoryMB: number,
    timeoutMs: number = 60000,
    checkIntervalMs: number = 5000
  ): Promise<boolean> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkAvailability = async () => {
        const available = await this.canAllocateResources(requestedMemoryMB);
        
        if (available) {
          resolve(true);
          return;
        }

        if (Date.now() - startTime >= timeoutMs) {
          resolve(false);
          return;
        }

        setTimeout(checkAvailability, checkIntervalMs);
      };

      checkAvailability();
    });
  }
}