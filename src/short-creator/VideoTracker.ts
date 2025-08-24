import fs from "fs-extra";
import path from "path";
import { Config } from "../config";
import { logger } from "../logger";
import { VideoStatus, VideoProgress, VideoMetadata } from "../types/shorts";

export class VideoTracker {
  private progressData: Map<string, VideoProgress> = new Map();
  private metadata: Map<string, VideoMetadata> = new Map();
  private webSocketServer: any = null;
  private webhookService: any = null;

  constructor(private config: Config) {
    this.loadPersistedData();
  }

  public setWebSocketServer(webSocketServer: any): void {
    this.webSocketServer = webSocketServer;
  }

  public setWebhookService(webhookService: any): void {
    this.webhookService = webhookService;
  }

  private broadcastProgressUpdate(videoId: string): void {
    if (this.webSocketServer) {
      const progress = this.progressData.get(videoId);
      const metadata = this.metadata.get(videoId);
      
      if (progress && metadata) {
        this.webSocketServer.broadcastVideoEvent(
          videoId,
          "progress_update",
          { progress, metadata }
        );
      }
    }
  }

  private broadcastVideoEvent(videoId: string, eventType: string, data: any): void {
    if (this.webSocketServer) {
      this.webSocketServer.broadcastVideoEvent(videoId, eventType, data);
    }
  }

  public initializeVideo(videoId: string, scenesCount: number): void {
    const now = new Date().toISOString();
    const progress: VideoProgress = {
      status: "queued",
      progress: 0,
      startedAt: now,
      updatedAt: now,
    };

    const metadata: VideoMetadata = {
      id: videoId,
      status: "queued",
      progress,
      scenesCount,
      totalDuration: 0,
      createdAt: now,
    };

    this.progressData.set(videoId, progress);
    this.metadata.set(videoId, metadata);
    this.persistData();
  }

  public updateProgress(
    videoId: string,
    status: VideoStatus,
    progress: number,
    currentStep?: string,
    estimatedTimeRemaining?: number
  ): void {
    const videoProgress = this.progressData.get(videoId);
    if (!videoProgress) {
      logger.warn({ videoId }, "Attempted to update progress for unknown video");
      return;
    }

    videoProgress.status = status;
    videoProgress.progress = Math.max(0, Math.min(100, progress));
    videoProgress.currentStep = currentStep;
    videoProgress.estimatedTimeRemaining = estimatedTimeRemaining;
    videoProgress.updatedAt = new Date().toISOString();

    const videoMetadata = this.metadata.get(videoId);
    if (videoMetadata) {
      videoMetadata.status = status;
      videoMetadata.progress = videoProgress;
    }

    this.persistData();
    logger.debug({ videoId, status, progress }, "Video progress updated");
    
    // Broadcast progress update
    this.broadcastProgressUpdate(videoId);
  }

  public markFailed(videoId: string, error: string): void {
    this.updateProgress(videoId, "failed", 100, "failed");
    
    const videoProgress = this.progressData.get(videoId);
    if (videoProgress) {
      videoProgress.error = error;
    }

    const videoMetadata = this.metadata.get(videoId);
    if (videoMetadata) {
      videoMetadata.completedAt = new Date().toISOString();
    }

    this.persistData();
    logger.error({ videoId, error }, "Video processing failed");
    
    // Broadcast failure event
    this.broadcastVideoEvent(videoId, "video_failed", { error });
    
    // Trigger webhook
    if (this.webhookService) {
      this.webhookService.triggerWebhook("video.failed", videoId, {
        error,
        progress: videoProgress,
        metadata: videoMetadata
      }).catch((webhookError: unknown) => {
        logger.error(webhookError, "Error triggering webhook for video failure");
      });
    }
  }

  public markCompleted(videoId: string, totalDuration: number): void {
    this.updateProgress(videoId, "ready", 100, "completed");
    
    const videoMetadata = this.metadata.get(videoId);
    if (videoMetadata) {
      videoMetadata.totalDuration = totalDuration;
      videoMetadata.completedAt = new Date().toISOString();
    }

    this.persistData();
    logger.info({ videoId, totalDuration }, "Video processing completed");
    
    // Broadcast completion event
    this.broadcastVideoEvent(videoId, "video_completed", { totalDuration });
    
    // Trigger webhook
    if (this.webhookService) {
      this.webhookService.triggerWebhook("video.completed", videoId, {
        totalDuration,
        progress: this.progressData.get(videoId),
        metadata: videoMetadata
      }).catch((webhookError: unknown) => {
        logger.error(webhookError, "Error triggering webhook for video completion");
      });
    }
  }

  public getProgress(videoId: string): VideoProgress | undefined {
    return this.progressData.get(videoId);
  }

  public getMetadata(videoId: string): VideoMetadata | undefined {
    return this.metadata.get(videoId);
  }

  public getAllMetadata(): VideoMetadata[] {
    return Array.from(this.metadata.values());
  }

  private getProgressFilePath(): string {
    return path.join(this.config.dataDirPath, "video-progress.json");
  }

  private loadPersistedData(): void {
    const filePath = this.getProgressFilePath();
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readJsonSync(filePath);
        if (data.progressData && data.metadata) {
          this.progressData = new Map(Object.entries(data.progressData));
          this.metadata = new Map(Object.entries(data.metadata));
          logger.info("Loaded persisted video progress data");
        }
      } catch (error) {
        logger.error(error, "Failed to load persisted progress data");
      }
    }
  }

  private persistData(): void {
    const filePath = this.getProgressFilePath();
    try {
      const data = {
        progressData: Object.fromEntries(this.progressData),
        metadata: Object.fromEntries(this.metadata),
      };
      fs.writeJsonSync(filePath, data, { spaces: 2 });
    } catch (error) {
      logger.error(error, "Failed to persist progress data");
    }
  }

  public cleanupOldData(maxAgeHours: number = 24): void {
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    for (const [videoId, metadata] of this.metadata.entries()) {
      const completedAt = metadata.completedAt ? new Date(metadata.completedAt).getTime() : 0;
      if (completedAt > 0 && completedAt < cutoffTime) {
        this.progressData.delete(videoId);
        this.metadata.delete(videoId);
      }
    }
    
    this.persistData();
    logger.info({ cleanedCount: this.metadata.size }, "Cleaned up old video data");
  }
}