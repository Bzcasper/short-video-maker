import { spawn, ChildProcess } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { Queue, Job } from "bullmq";
import { RedisConnection } from "../server/redis";
import { logger } from "../logger";
import { Config } from "../config";

export interface FramePackConfig {
  imagePath: string;
  prompt: string;
  outputPath: string;
  duration: number; // in seconds
  seed?: number;
  steps?: number;
  cfg?: number;
  useTeaCache?: boolean;
  gpuMemoryPreservation?: number;
  mp4Crf?: number;
}

export interface FramePackResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
  framesGenerated?: number;
}

export interface FramePackProgress {
  status: "initializing" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  currentStep: string;
  framesGenerated: number;
  estimatedTimeRemaining?: number;
  error?: string;
}

export class FramePackService {
  private queue!: Queue; // Definite assignment assertion
  private framePackPath: string;
  private pythonPath: string;
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private progressCallbacks: Map<string, (progress: FramePackProgress) => void> = new Map();

  constructor(private config: Config) {
    this.framePackPath = path.join(process.cwd(), "FramePack");
    this.pythonPath = "python"; // Should be configurable based on environment
    this.initializeQueue();
  }

  private initializeQueue(): void {
    this.queue = new Queue("framepack-processing", {
      connection: RedisConnection.getInstance(),
      defaultJobOptions: {
        attempts: 2, // Less retries for GPU-intensive tasks
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 100,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });

    this.queue.on("error", (error: Error) => {
      logger.error(error, "FramePack queue error");
    });
  }

  public async generateVideo(
    config: FramePackConfig,
    jobId: string,
    onProgress?: (progress: FramePackProgress) => void
  ): Promise<FramePackResult> {
    logger.info({ jobId, config }, "Starting FramePack video generation");

    if (onProgress) {
      this.progressCallbacks.set(jobId, onProgress);
    }

    try {
      // Validate input image exists
      const imageExists = await fs.access(config.imagePath).then(() => true).catch(() => false);
      if (!imageExists) {
        throw new Error(`Input image not found: ${config.imagePath}`);
      }

      // Ensure output directory exists
      await fs.mkdir(path.dirname(config.outputPath), { recursive: true });

      // Check if FramePack is available
      const framePackExists = await fs.access(this.framePackPath).then(() => true).catch(() => false);
      if (!framePackExists) {
        throw new Error("FramePack directory not found. Please ensure FramePack is properly installed.");
      }

      // Generate video using Python subprocess
      const result = await this.runFramePackGeneration(config, jobId);
      
      this.progressCallbacks.delete(jobId);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ jobId, error: errorMessage }, "FramePack generation failed");
      
      if (onProgress) {
        onProgress({
          status: "failed",
          progress: 0,
          currentStep: "Error occurred",
          framesGenerated: 0,
          error: errorMessage,
        });
      }
      
      this.progressCallbacks.delete(jobId);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async runFramePackGeneration(
    config: FramePackConfig,
    jobId: string
  ): Promise<FramePackResult> {
    return new Promise((resolve, reject) => {
      const args = [
        path.join(this.framePackPath, "demo_framepack_api.py"),
        "--image", config.imagePath,
        "--prompt", config.prompt,
        "--output", config.outputPath,
        "--duration", config.duration.toString(),
        "--seed", (config.seed || 31337).toString(),
        "--steps", (config.steps || 25).toString(),
        "--cfg", (config.cfg || 1.0).toString(),
        "--gpu-memory-preservation", (config.gpuMemoryPreservation || 6).toString(),
        "--mp4-crf", (config.mp4Crf || 16).toString(),
      ];

      if (config.useTeaCache) {
        args.push("--use-teacache");
      }

      logger.debug({ jobId, args }, "Spawning FramePack process");

      const pythonProcess = spawn(this.pythonPath, args, {
        cwd: this.framePackPath,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PYTHONPATH: this.framePackPath,
          HF_HOME: path.join(this.framePackPath, "hf_download"),
        },
      });

      this.activeProcesses.set(jobId, pythonProcess);

      let outputBuffer = "";
      let errorBuffer = "";
      let currentProgress = 0;
      let framesGenerated = 0;

      const progressCallback = this.progressCallbacks.get(jobId);

      // Initial progress
      if (progressCallback) {
        progressCallback({
          status: "initializing",
          progress: 0,
          currentStep: "Starting FramePack generation",
          framesGenerated: 0,
        });
      }

      pythonProcess.stdout?.on("data", (data) => {
        const chunk = data.toString();
        outputBuffer += chunk;
        
        // Parse progress from FramePack output
        const progressMatch = chunk.match(/Progress: (\d+)%/);
        if (progressMatch) {
          currentProgress = parseInt(progressMatch[1]);
        }

        const framesMatch = chunk.match(/Frames generated: (\d+)/);
        if (framesMatch) {
          framesGenerated = parseInt(framesMatch[1]);
        }

        const stepMatch = chunk.match(/Step: (.+)/);
        let currentStep = "Processing";
        if (stepMatch) {
          currentStep = stepMatch[1];
        }

        if (progressCallback) {
          progressCallback({
            status: "processing",
            progress: currentProgress,
            currentStep,
            framesGenerated,
          });
        }

        logger.debug({ jobId, chunk: chunk.trim() }, "FramePack output");
      });

      pythonProcess.stderr?.on("data", (data) => {
        const chunk = data.toString();
        errorBuffer += chunk;
        logger.warn({ jobId, error: chunk.trim() }, "FramePack stderr");
      });

      pythonProcess.on("close", async (code) => {
        this.activeProcesses.delete(jobId);

        if (code === 0) {
          // Check if output file was created
          try {
            const stats = await fs.stat(config.outputPath);
            const duration = await this.getVideoDuration(config.outputPath);
            
            if (progressCallback) {
              progressCallback({
                status: "completed",
                progress: 100,
                currentStep: "Generation completed",
                framesGenerated,
              });
            }

            logger.info({ jobId, outputPath: config.outputPath, duration }, "FramePack generation completed");
            
            resolve({
              success: true,
              outputPath: config.outputPath,
              duration,
              framesGenerated,
            });
          } catch (error) {
            const errorMsg = `Output file not created: ${config.outputPath}`;
            logger.error({ jobId, error: errorMsg }, "FramePack output validation failed");
            reject(new Error(errorMsg));
          }
        } else {
          const errorMsg = `FramePack process exited with code ${code}: ${errorBuffer}`;
          logger.error({ jobId, code, errorBuffer }, "FramePack process failed");
          reject(new Error(errorMsg));
        }
      });

      pythonProcess.on("error", (error) => {
        this.activeProcesses.delete(jobId);
        logger.error({ jobId, error: error.message }, "Failed to spawn FramePack process");
        reject(error);
      });

      // Set up timeout (FramePack can take a long time for longer videos)
      const timeout = config.duration * 60 * 1000; // 1 minute per second of video
      setTimeout(() => {
        if (this.activeProcesses.has(jobId)) {
          logger.warn({ jobId }, "FramePack process timeout, killing process");
          pythonProcess.kill("SIGKILL");
          this.activeProcesses.delete(jobId);
          reject(new Error("FramePack generation timeout"));
        }
      }, timeout);
    });
  }

  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn("ffprobe", [
        "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        videoPath
      ]);

      let output = "";
      ffprobe.stdout?.on("data", (data) => {
        output += data.toString();
      });

      ffprobe.on("close", (code) => {
        if (code === 0) {
          const duration = parseFloat(output.trim());
          resolve(duration);
        } else {
          resolve(0); // Fallback duration
        }
      });

      ffprobe.on("error", () => {
        resolve(0); // Fallback duration
      });
    });
  }

  public async addToQueue(
    config: FramePackConfig,
    jobId: string,
    priority: number = 1
  ): Promise<void> {
    await this.queue.add(
      `framepack-${jobId}`,
      { config, jobId },
      {
        jobId,
        priority,
      }
    );

    logger.info({ jobId }, "FramePack job added to queue");
  }

  public cancelJob(jobId: string): void {
    const process = this.activeProcesses.get(jobId);
    if (process) {
      logger.info({ jobId }, "Canceling FramePack job");
      process.kill("SIGTERM");
      this.activeProcesses.delete(jobId);
    }
  }

  public isJobRunning(jobId: string): boolean {
    return this.activeProcesses.has(jobId);
  }

  public async getQueueStats(): Promise<{
    active: number;
    waiting: number;
    completed: number;
    failed: number;
  }> {
    const counts = await this.queue.getJobCounts();
    // Ensure the returned object has all required properties
    return {
      active: counts.active || 0,
      waiting: counts.waiting || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
    };
  }

  public async close(): Promise<void> {
    // Kill all active processes
    for (const [jobId, process] of this.activeProcesses) {
      logger.info({ jobId }, "Killing active FramePack process");
      process.kill("SIGKILL");
    }
    this.activeProcesses.clear();
    
    // Close queue
    await this.queue.close();
    logger.info("FramePack service closed");
  }

  public async checkSystemRequirements(): Promise<{
    hasGPU: boolean;
    gpuMemoryGB: number;
    pythonAvailable: boolean;
    framePackInstalled: boolean;
    requirements: string[];
  }> {
    const requirements = [];
    let hasGPU = false;
    let gpuMemoryGB = 0;
    let pythonAvailable = false;
    let framePackInstalled = false;

    try {
      // Check Python availability
      await new Promise<void>((resolve, reject) => {
        const python = spawn(this.pythonPath, ["--version"], { stdio: "pipe" });
        python.on("close", (code) => {
          if (code === 0) {
            pythonAvailable = true;
            resolve();
          } else {
            requirements.push("Python 3.10+ required");
            reject();
          }
        });
      });
    } catch {
      requirements.push("Python 3.10+ required");
    }

    try {
      // Check FramePack installation
      framePackInstalled = await fs.access(this.framePackPath).then(() => true).catch(() => false);
      if (!framePackInstalled) {
        requirements.push("FramePack directory not found");
      }
    } catch {
      requirements.push("FramePack installation required");
    }

    try {
      // Check GPU availability (simplified check)
      await new Promise<void>((resolve, reject) => {
        const nvidia = spawn("nvidia-smi", ["--query-gpu=memory.total", "--format=csv,noheader,nounits"], { stdio: "pipe" });
        let output = "";
        
        nvidia.stdout?.on("data", (data) => {
          output += data.toString();
        });
        
        nvidia.on("close", (code) => {
          if (code === 0 && output.trim()) {
            hasGPU = true;
            gpuMemoryGB = parseInt(output.trim()) / 1024; // Convert MB to GB
            if (gpuMemoryGB < 6) {
              requirements.push("At least 6GB GPU memory required");
            }
            resolve();
          } else {
            requirements.push("NVIDIA GPU with CUDA support required");
            reject();
          }
        });
      });
    } catch {
      requirements.push("NVIDIA GPU with CUDA support required");
    }

    return {
      hasGPU,
      gpuMemoryGB,
      pythonAvailable,
      framePackInstalled,
      requirements,
    };
  }
}