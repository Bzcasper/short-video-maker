import { OrientationEnum } from "./../types/shorts";
/* eslint-disable @remotion/deterministic-randomness */
import fs from "fs-extra";
import cuid from "cuid";
import path from "path";
import https from "https";
import http from "http";

import { Kokoro } from "./libraries/Kokoro";
import { Remotion } from "./libraries/Remotion";
import { Whisper } from "./libraries/Whisper";
import { FFMpeg } from "./libraries/FFmpeg";
import { PexelsAPI } from "./libraries/Pexels";
import { HybridRenderingService, HybridRenderingConfig } from "../services/HybridRenderingService";
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";
import { VideoTracker } from "./VideoTracker";
import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
  VideoMetadata,
  AIGenerationQualityEnum,
  AIImageStyleEnum,
} from "../types/shorts";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
  }[] = [];
  private videoTracker: VideoTracker;
  private hybridRenderingService: HybridRenderingService;

  constructor(
    private config: Config,
    private remotion: Remotion,
    private kokoro: Kokoro,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
  ) {
    this.videoTracker = new VideoTracker(config);
    this.hybridRenderingService = new HybridRenderingService(config, pexelsApi, ffmpeg);
  }

  public status(id: string): VideoStatus {
    const videoProgress = this.videoTracker.getProgress(id);
    if (videoProgress) {
      return videoProgress.status;
    }
    
    // Fallback to original logic for backward compatibility
    const videoPath = this.getVideoPath(id);
    if (this.queue.find((item) => item.id === id)) {
      return "processing";
    }
    if (fs.existsSync(videoPath)) {
      return "ready";
    }
    return "failed";
  }

  public getVideoProgress(id: string): VideoProgress | undefined {
    return this.videoTracker.getProgress(id);
  }

  public getVideoMetadata(id: string): VideoMetadata | undefined {
    return this.videoTracker.getMetadata(id);
  }

  public listAllVideosWithMetadata(): VideoMetadata[] {
    return this.videoTracker.getAllMetadata();
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
    // todo add mutex lock
    const id = cuid();
    this.queue.push({
      sceneInput,
      config,
      id,
    });
    
    // Initialize video tracking
    this.videoTracker.initializeVideo(id, sceneInput.length);
    
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }

  private async processQueue(): Promise<void> {
    // todo add a semaphore
    if (this.queue.length === 0) {
      return;
    }
    const { sceneInput, config, id } = this.queue[0];
    logger.debug(
      { sceneInput, config, id },
      "Processing video item in the queue",
    );
    
    try {
      // Update status to processing
      this.videoTracker.updateProgress(id, "processing", 5, "starting_processing");
      
      await this.createShort(id, sceneInput, config);
      logger.debug({ id }, "Video created successfully");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(error, "Error creating video");
      this.videoTracker.markFailed(id, errorMessage);
    } finally {
      this.queue.shift();
      this.processQueue();
    }
  }

  private async createShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.debug(
      {
        inputScenes,
        config,
      },
      "Creating short video",
    );
    
    const scenes: Scene[] = [];
    let totalDuration = 0;
    const excludeVideoIds = [];
    const tempFiles = [];

    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.portrait;

    const totalScenes = inputScenes.length;
    let index = 0;

    // Check if hybrid rendering should be used
    const useHybridRendering = config.useHybridRendering && 
      await this.isHybridRenderingAvailable();

    if (useHybridRendering) {
      return this.createHybridShort(videoId, inputScenes, config);
    }
    
    for (const scene of inputScenes) {
      const sceneProgress = Math.floor((index / totalScenes) * 70) + 10; // 10-80% for scene processing
      
      // Update progress for audio generation
      this.videoTracker.updateProgress(
        videoId,
        "generating_audio",
        sceneProgress,
        `Generating audio for scene ${index + 1}/${totalScenes}`
      );
      
      const audio = await this.kokoro.generate(
        scene.text,
        config.voice ?? "af_heart",
      );
      let { audioLength } = audio;
      const { audio: audioStream } = audio;

      // add the paddingBack in seconds to the last scene
      if (index + 1 === inputScenes.length && config.paddingBack) {
        audioLength += config.paddingBack / 1000;
      }

      const tempId = cuid();
      const tempWavFileName = `${tempId}.wav`;
      const tempMp3FileName = `${tempId}.mp3`;
      const tempVideoFileName = `${tempId}.mp4`;
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      const tempVideoPath = path.join(
        this.config.tempDirPath,
        tempVideoFileName,
      );
      tempFiles.push(tempVideoPath);
      tempFiles.push(tempWavPath, tempMp3Path);

      await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
      
      // Update progress for caption creation
      this.videoTracker.updateProgress(
        videoId,
        "creating_captions",
        sceneProgress + 5,
        `Creating captions for scene ${index + 1}/${totalScenes}`
      );
      
      const captions = await this.whisper.CreateCaption(tempWavPath);

      await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);
      
      // Update progress for video search
      this.videoTracker.updateProgress(
        videoId,
        "downloading_video",
        sceneProgress + 10,
        `Finding video for scene ${index + 1}/${totalScenes}`
      );
      
      const video = await this.pexelsApi.findVideo(
        scene.searchTerms,
        audioLength,
        excludeVideoIds,
        orientation,
      );

      logger.debug(`Downloading video from ${video.url} to ${tempVideoPath}`);

      await new Promise<void>((resolve, reject) => {
        const fileStream = fs.createWriteStream(tempVideoPath);
        https
          .get(video.url, (response: http.IncomingMessage) => {
            if (response.statusCode !== 200) {
              reject(
                new Error(`Failed to download video: ${response.statusCode}`),
              );
              return;
            }

            response.pipe(fileStream);

            fileStream.on("finish", () => {
              fileStream.close();
              logger.debug(`Video downloaded successfully to ${tempVideoPath}`);
              resolve();
            });
          })
          .on("error", (err: Error) => {
            fs.unlink(tempVideoPath, () => {}); // Delete the file if download failed
            logger.error(err, "Error downloading video:");
            reject(err);
          });
      });

      excludeVideoIds.push(video.id);

      scenes.push({
        captions,
        video: `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`,
        audio: {
          url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
          duration: audioLength,
        },
      });

      totalDuration += audioLength;
      index++;
    }
    if (config.paddingBack) {
      totalDuration += config.paddingBack / 1000;
    }

    const selectedMusic = this.findMusic(totalDuration, config.music);
    logger.debug({ selectedMusic }, "Selected music for the video");

    // Update progress for rendering
    this.videoTracker.updateProgress(
      videoId,
      "rendering",
      85,
      "Rendering final video"
    );
    
    await this.remotion.render(
      {
        music: selectedMusic,
        scenes,
        config: {
          durationMs: totalDuration * 1000,
          paddingBack: config.paddingBack,
          ...{
            captionBackgroundColor: config.captionBackgroundColor,
            captionPosition: config.captionPosition,
          },
          musicVolume: config.musicVolume,
        },
      },
      videoId,
      orientation,
    );

    for (const file of tempFiles) {
      fs.removeSync(file);
    }

    // Mark as completed
    this.videoTracker.markCompleted(videoId, totalDuration);
    
    return videoId;
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  public deleteVideo(videoId: string): void {
    const videoPath = this.getVideoPath(videoId);
    fs.removeSync(videoPath);
    logger.debug({ videoId }, "Deleted video file");
  }

  public getVideo(videoId: string): Buffer {
    const videoPath = this.getVideoPath(videoId);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video ${videoId} not found`);
    }
    return fs.readFileSync(videoPath);
  }

  private findMusic(videoDuration: number, tag?: MusicMoodEnum): MusicForVideo {
    const musicFiles = this.musicManager.musicList().filter((music) => {
      if (tag) {
        return music.mood === tag;
      }
      return true;
    });
    return musicFiles[Math.floor(Math.random() * musicFiles.length)];
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((music) => {
      tags.add(music.mood as MusicTag);
    });
    return Array.from(tags.values());
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const videos: { id: string; status: VideoStatus }[] = [];

    // Use metadata for videos that are being tracked
    const allMetadata = this.videoTracker.getAllMetadata();
    for (const metadata of allMetadata) {
      videos.push({ id: metadata.id, status: metadata.status });
    }

    // Also include videos that exist on disk but aren't tracked
    if (fs.existsSync(this.config.videosDirPath)) {
      const files = fs.readdirSync(this.config.videosDirPath);
      for (const file of files) {
        if (file.endsWith(".mp4")) {
          const videoId = file.replace(".mp4", "");
          const existing = videos.find(v => v.id === videoId);
          if (!existing) {
            videos.push({ id: videoId, status: "ready" });
          }
        }
      }
    }

    return videos;
  }

  public ListAvailableVoices(): string[] {
    return this.kokoro.listAvailableVoices();
  }

  public getVideoTracker(): VideoTracker {
    return this.videoTracker;
  }

  /**
   * Check if hybrid rendering is available on this system
   */
  private async isHybridRenderingAvailable(): Promise<boolean> {
    try {
      const capabilities = await this.hybridRenderingService.getCapabilities();
      return capabilities.framePackAvailable || capabilities.imageGenerationAvailable;
    } catch (error) {
      logger.warn({ error: error.message }, "Failed to check hybrid rendering capabilities");
      return false;
    }
  }

  /**
   * Create video using hybrid rendering with AI generation
   */
  private async createHybridShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.info({ videoId, scenesCount: inputScenes.length }, "Creating hybrid short with AI generation");

    const scenes: Scene[] = [];
    let totalDuration = 0;
    const tempFiles: string[] = [];

    const orientation: OrientationEnum = config.orientation || OrientationEnum.portrait;

    try {
      // Generate audio for all scenes first
      this.videoTracker.updateProgress(
        videoId,
        "generating_audio",
        10,
        "Generating audio for all scenes"
      );

      const audioData: Array<{
        audioStream: Buffer;
        audioLength: number;
        captions: any[];
        tempWavPath: string;
        tempMp3Path: string;
      }> = [];

      for (let i = 0; i < inputScenes.length; i++) {
        const scene = inputScenes[i];
        const audio = await this.kokoro.generate(
          scene.text,
          config.voice ?? "af_heart",
        );
        let { audioLength } = audio;
        const { audio: audioStream } = audio;

        // Add padding for last scene
        if (i + 1 === inputScenes.length && config.paddingBack) {
          audioLength += config.paddingBack / 1000;
        }

        const tempId = cuid();
        const tempWavPath = path.join(this.config.tempDirPath, `${tempId}.wav`);
        const tempMp3Path = path.join(this.config.tempDirPath, `${tempId}.mp3`);

        await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
        const captions = await this.whisper.CreateCaption(tempWavPath);
        await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);

        audioData.push({
          audioStream,
          audioLength,
          captions,
          tempWavPath,
          tempMp3Path,
        });

        tempFiles.push(tempWavPath, tempMp3Path);
        totalDuration += audioLength;
      }

      // Prepare hybrid rendering configuration
      const hybridConfig: HybridRenderingConfig = {
        useAIGeneration: true,
        aiGenerationRatio: config.aiGenerationRatio || 0.3,
        fallbackToTraditional: config.fallbackToTraditional !== false,
        enhanceTraditionalVideo: config.enhanceTraditionalVideo || false,
        aiImagePrompts: inputScenes.map(scene => scene.imagePrompt).filter(Boolean) as string[],
        aiVideoPrompts: inputScenes.map(scene => scene.videoPrompt).filter(Boolean) as string[],
        qualitySettings: {
          imageQuality: this.mapAIQualityToImageQuality(config.aiQuality),
          videoQuality: this.mapAIQualityToVideoQuality(config.aiQuality),
          frameRate: 30,
        },
      };

      // Update progress for hybrid content generation
      this.videoTracker.updateProgress(
        videoId,
        "generating_ai_videos",
        30,
        "Generating AI and traditional video content"
      );

      // Generate hybrid content
      const searchTerms = inputScenes.map(scene => scene.searchTerms.join(" "));
      const sceneDurations = audioData.map(data => data.audioLength);

      const hybridResult = await this.hybridRenderingService.generateHybridContent(
        searchTerms,
        hybridConfig,
        sceneDurations,
        orientation,
        videoId
      );

      if (!hybridResult.success) {
        throw new Error(`Hybrid rendering failed: ${hybridResult.error}`);
      }

      // Update progress for scene composition
      this.videoTracker.updateProgress(
        videoId,
        "creating_captions",
        70,
        "Composing final scenes"
      );

      // Compose final scenes from hybrid results and audio
      for (let i = 0; i < hybridResult.scenes.length; i++) {
        const hybridScene = hybridResult.scenes[i];
        const audioInfo = audioData[i];

        const videoUrl = hybridScene.aiGeneratedVideoPath || hybridScene.originalVideoPath;
        if (!videoUrl) {
          throw new Error(`No video generated for scene ${i}`);
        }

        scenes.push({
          captions: audioInfo.captions,
          video: `http://localhost:${this.config.port}/api/tmp/${path.basename(videoUrl)}`,
          audio: {
            url: `http://localhost:${this.config.port}/api/tmp/${path.basename(audioInfo.tempMp3Path)}`,
            duration: audioInfo.audioLength,
          },
        });

        tempFiles.push(videoUrl);
      }

      if (config.paddingBack) {
        totalDuration += config.paddingBack / 1000;
      }

      // Update AI generation metadata
      this.updateAIGenerationMetadata(videoId, hybridResult);

      const selectedMusic = this.findMusic(totalDuration, config.music);
      logger.debug({ selectedMusic }, "Selected music for the hybrid video");

      // Update progress for final rendering
      this.videoTracker.updateProgress(
        videoId,
        "rendering",
        85,
        "Rendering final hybrid video"
      );

      await this.remotion.render(
        {
          music: selectedMusic,
          scenes,
          config: {
            durationMs: totalDuration * 1000,
            paddingBack: config.paddingBack,
            captionBackgroundColor: config.captionBackgroundColor,
            captionPosition: config.captionPosition,
            musicVolume: config.musicVolume,
          },
        },
        videoId,
        orientation,
      );

      // Cleanup temporary files
      for (const file of tempFiles) {
        try {
          fs.removeSync(file);
        } catch (error) {
          logger.debug({ file, error: error.message }, "Failed to cleanup temp file");
        }
      }

      // Mark as completed
      this.videoTracker.markCompleted(videoId, totalDuration);

      return videoId;

    } catch (error) {
      // Cleanup on error
      for (const file of tempFiles) {
        try {
          fs.removeSync(file);
        } catch (cleanupError) {
          logger.debug({ file, error: cleanupError.message }, "Failed to cleanup temp file on error");
        }
      }
      throw error;
    }
  }

  /**
   * Update AI generation metadata for video tracking
   */
  private updateAIGenerationMetadata(videoId: string, hybridResult: any): void {
    const metadata = this.videoTracker.getMetadata(videoId);
    if (metadata) {
      metadata.aiGeneration = {
        aiScenesGenerated: hybridResult.processingStats.aiGeneratedScenes,
        traditionalScenesUsed: hybridResult.processingStats.traditionalScenes,
        enhancedScenesCount: hybridResult.processingStats.enhancedScenes,
        totalProcessingTime: hybridResult.processingStats.totalProcessingTime,
        averageProcessingTimePerScene: hybridResult.processingStats.averageProcessingTimePerScene,
        fallbacksTriggered: 0, // TODO: track this in hybrid service
      };
      metadata.hybridRenderingUsed = true;
    }
  }

  /**
   * Map AI quality enum to image quality
   */
  private mapAIQualityToImageQuality(quality?: AIGenerationQualityEnum): "standard" | "hd" | "ultra" {
    switch (quality) {
      case AIGenerationQualityEnum.high:
        return "ultra";
      case AIGenerationQualityEnum.balanced:
        return "hd";
      case AIGenerationQualityEnum.fast:
      default:
        return "standard";
    }
  }

  /**
   * Map AI quality enum to video quality
   */
  private mapAIQualityToVideoQuality(quality?: AIGenerationQualityEnum): "fast" | "balanced" | "high" {
    switch (quality) {
      case AIGenerationQualityEnum.high:
        return "high";
      case AIGenerationQualityEnum.balanced:
        return "balanced";
      case AIGenerationQualityEnum.fast:
      default:
        return "fast";
    }
  }

  /**
   * Get hybrid rendering capabilities
   */
  public async getHybridRenderingCapabilities() {
    return await this.hybridRenderingService.getCapabilities();
  }

  /**
   * Close hybrid rendering service
   */
  public async closeHybridRendering(): Promise<void> {
    await this.hybridRenderingService.close();
  }
}
