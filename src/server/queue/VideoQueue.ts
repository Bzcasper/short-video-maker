import { Queue, Worker, Job } from "bullmq";
import { RedisConnection } from "../redis";
import { logger } from "../../logger";
import { ShortCreator } from "../../short-creator/ShortCreator";
import { SceneInput, RenderConfig } from "../../types/shorts";

export class VideoQueue {
  private queue!: Queue;
  private worker!: Worker;
  private shortCreator: ShortCreator;

  constructor(shortCreator: ShortCreator) {
    this.shortCreator = shortCreator;
    this.initializeQueue();
    this.initializeWorker();
  }

  private initializeQueue(): void {
    this.queue = new Queue("video-processing", {
      connection: RedisConnection.getInstance(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 3600, // keep completed jobs for 24 hours
          count: 1000, // keep up to 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // keep failed jobs for 7 days
        },
      },
    });

    this.queue.on("error", (error: Error) => {
      logger.error(error, "Video queue error");
    });
  }

  private initializeWorker(): void {
    this.worker = new Worker(
      "video-processing",
      async (job: Job) => {
        const { videoId, scenes, config } = job.data;
        
        logger.info(
          { jobId: job.id, videoId, attempts: job.attemptsMade },
          "Processing video job"
        );

        try {
          // Use the public method to add to queue instead of calling private createShort
          this.shortCreator.addToQueue(scenes, config);
          logger.info({ jobId: job.id, videoId }, "Video job added to creator queue");
          return { success: true, videoId };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error(
            { jobId: job.id, videoId, error: errorMessage },
            "Video job failed"
          );
          throw error;
        }
      },
      {
        connection: RedisConnection.getInstance(),
        concurrency: 3, // Process 3 videos concurrently
        limiter: {
          max: 10, // Max 10 jobs per second
          duration: 1000,
        },
      }
    );

    this.worker.on("completed", (job: Job, result: any) => {
      logger.info(
        { jobId: job.id, videoId: result.videoId },
        "Video job completed"
      );
    });

    this.worker.on("failed", (job: Job | undefined, error: Error) => {
      if (job) {
        logger.error(
          { jobId: job.id, videoId: job.data.videoId, error: error.message },
          "Video job failed"
        );
      } else {
        logger.error(error, "Video job failed (no job data)");
      }
    });

    this.worker.on("error", (error: Error) => {
      logger.error(error, "Video worker error");
    });
  }

  public async addJob(
    videoId: string,
    scenes: SceneInput[],
    config: RenderConfig,
    priority?: number
  ): Promise<void> {
    await this.queue.add(
      `video-${videoId}`,
      { videoId, scenes, config },
      {
        jobId: videoId,
        priority: priority || 1,
      }
    );

    logger.info({ videoId }, "Video job added to queue");
  }

  public async getJobCounts(): Promise<{
    active: number;
    waiting: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const counts = await this.queue.getJobCounts();
    // Convert the BullMQ counts object to match our expected interface
    return {
      active: counts.active || 0,
      waiting: counts.waiting || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  }

  public async getJob(videoId: string): Promise<Job | undefined> {
    return await this.queue.getJob(videoId);
  }

  public async pause(): Promise<void> {
    await this.queue.pause();
    logger.info("Video queue paused");
  }

  public async resume(): Promise<void> {
    await this.queue.resume();
    logger.info("Video queue resumed");
  }

  public async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    logger.info("Video queue closed");
  }

  public async cancelJob(videoId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(videoId);
      if (job) {
        await job.remove();
        logger.info({ videoId }, "Cancelled video job");
        return true;
      }
      logger.warn({ videoId }, "Job not found for cancellation");
      return false;
    } catch (error) {
      logger.error(error, "Failed to cancel job");
      return false;
    }
  }

  public async cleanOldJobs(): Promise<void> {
    // Clean jobs older than 7 days
    await this.queue.clean(7 * 24 * 3600 * 1000, 0, "completed");
    await this.queue.clean(7 * 24 * 3600 * 1000, 0, "failed");
    logger.info("Cleaned old queue jobs");
  }
}