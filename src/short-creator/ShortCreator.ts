import {
  OrientationEnum,
  LanguageEnum,
  type whisperModels,
} from "./../types/shorts";
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
import { Config } from "../config";
import { logger } from "../logger";
import { MusicManager } from "./music";
import { SunoAI } from "../server/libraries/SunoAI";
import { CloudflareAI } from "../server/libraries/CloudflareAI";
import { VercelAI } from "../server/libraries/VercelAI";
import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
} from "../types/shorts";

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
    progress: number;
    stage: string;
  }[] = [];
  private sunoAI: SunoAI;
  private cloudflareAI: CloudflareAI;
  private vercelAI: VercelAI;

  constructor(
    private config: Config,
    private remotion: Remotion,
    private kokoro: Kokoro,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
  ) {
    this.sunoAI = new SunoAI(config);
    this.cloudflareAI = new CloudflareAI(config);
    this.vercelAI = new VercelAI(config);
  }

  public status(id: string): VideoStatus {
    const videoPath = this.getVideoPath(id);
    if (this.queue.find((item) => item.id === id)) {
      return "processing";
    }
    if (fs.existsSync(videoPath)) {
      return "ready";
    }
    return "failed";
  }

  public getProgress(id: string): number {
    const item = this.queue.find((item) => item.id === id);
    return item ? item.progress : 0;
  }

  public getStage(id: string): string {
    const item = this.queue.find((item) => item.id === id);
    return item ? item.stage : "Unknown";
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
    // todo add mutex lock
    const id = cuid();
    this.queue.push({
      sceneInput,
      config,
      id,
      progress: 0,
      stage: "Initializing",
    });
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
      await this.createShort(id, sceneInput, config);
      logger.debug({ id }, "Video created successfully");
    } catch (error: unknown) {
      logger.error({ error, id }, "Error creating video with detailed context");
      if (error instanceof Error) {
        logger.error({ stack: error.stack }, "Error stack trace for debugging");
      }
      // Update progress and stage on failure
      const itemIndex = this.queue.findIndex((item) => item.id === id);
      if (itemIndex !== -1) {
        this.queue[itemIndex].progress = 100;
        this.queue[itemIndex].stage = "Failed";
      }
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

    let index = 0;
    const totalScenes = inputScenes.length;
    let processedScenes = 0;
    for (const scene of inputScenes) {
      // If scene text is empty or placeholder, generate a story script using Cloudflare AI
      const textContent = Array.isArray(scene.text)
        ? scene.text.join(" ")
        : scene.text;
      if (
        !scene.text ||
        textContent.trim() === "" ||
        textContent === "placeholder"
      ) {
        const searchTermsContent = Array.isArray(scene.searchTerms)
          ? scene.searchTerms.join(", ")
          : scene.searchTerms;
        const prompt =
          searchTermsContent ||
          "Generate a short engaging story for a video scene";
        const script = await this.cloudflareAI.generateStoryScript(
          prompt,
          videoId,
        );
        if (script) {
          scene.text = script;
          logger.debug(
            { videoId, sceneIndex: index, script },
            "Generated story script for scene",
          );
        }
      }
      // Generate keywords if search terms are not provided or empty
      const searchTermsContentCheck = Array.isArray(scene.searchTerms)
        ? scene.searchTerms.join(" ")
        : scene.searchTerms;
      if (!scene.searchTerms || searchTermsContentCheck.trim() === "") {
        const themeText = Array.isArray(scene.text)
          ? scene.text.join(" ").substring(0, 100)
          : scene.text.substring(0, 100);
        const theme = themeText || "Default video theme";
        const keywords = await this.cloudflareAI.generateKeywords(
          theme,
          videoId,
        );
        if (keywords.length > 0) {
          scene.searchTerms = keywords;
          logger.debug(
            { videoId, sceneIndex: index, keywords },
            "Generated keywords for scene search terms",
          );
        }
      }
      const language = config.language || LanguageEnum.en;
      // Update progress for each scene
      const itemIndex = this.queue.findIndex((item) => item.id === videoId);
      if (itemIndex !== -1) {
        this.queue[itemIndex].progress = Math.round(
          (processedScenes / totalScenes) * 50,
        ); // 50% for scene processing
        this.queue[itemIndex].stage =
          `Processing Scene ${processedScenes + 1} of ${totalScenes}`;
      }
      const voice =
        config.voice || this.kokoro.getDefaultVoiceForLanguage(language);
      const audio = await this.kokoro.generate(scene.text, voice);
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
      const tempImageFileName = `${tempId}.jpg`;
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      const tempVideoPath = path.join(
        this.config.tempDirPath,
        tempVideoFileName,
      );
      const tempImagePath = path.join(
        this.config.tempDirPath,
        tempImageFileName,
      );
      tempFiles.push(tempVideoPath);
      tempFiles.push(tempWavPath, tempMp3Path, tempImagePath);

      await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);
      const whisperModel =
        language === LanguageEnum.en ? "medium.en" : "medium";
      const captions = await this.whisper.CreateCaption(
        tempWavPath,
        whisperModel as whisperModels,
      );

      // Analyze sentiment of the scene text to adjust caption tone
      const sceneText = Array.isArray(scene.text)
        ? scene.text.join(" ")
        : scene.text;
      const sentiment = await this.cloudflareAI.analyzeSentiment(
        sceneText,
        videoId,
      );
      logger.debug(
        { videoId, sceneIndex: index, sentiment },
        "Analyzed sentiment for scene text",
      );

      // Enhance captions based on sentiment
      for (const caption of captions) {
        const enhancedText = await this.cloudflareAI.enhanceCaption(
          caption.text,
          videoId,
        );
        caption.text = enhancedText;
      }
      logger.debug(
        { videoId, sceneIndex: index },
        "Enhanced captions based on sentiment",
      );

      await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);
      let searchTerms = scene.searchTerms;
      let shouldUseSuggestions = false;
      let visualSource = "pexels";
      let visualUrl = "";

      if (
        !searchTerms ||
        (Array.isArray(searchTerms) && searchTerms.length === 0)
      ) {
        shouldUseSuggestions = true;
      }

      if (shouldUseSuggestions) {
        const sceneTextContent = Array.isArray(scene.text)
          ? scene.text.join(" ")
          : scene.text;
        const videoSuggestions = await this.vercelAI.suggestVideoBackground(
          sceneTextContent,
          videoId,
        );
        if (videoSuggestions.length > 0) {
          searchTerms = videoSuggestions;
          logger.debug(
            { videoId, sceneIndex: index, videoSuggestions },
            "Used Vercel AI suggestions for video background",
          );
        }
      }

      // Attempt to generate AI visual if customVisualPrompt is provided or config allows
      if (config.useAiVisuals) {
        const visualPrompt =
          scene.customVisualPrompt || sceneText.substring(0, 200);
        const base64Image = await this.cloudflareAI.generateVisual(
          visualPrompt,
          videoId,
          index,
        );
        if (base64Image) {
          // Save the generated image to a temporary file
          const imageBuffer = Buffer.from(base64Image, "base64");
          fs.writeFileSync(tempImagePath, imageBuffer);
          // Convert image to video of appropriate length
          await this.ffmpeg.imageToVideo(
            tempImagePath,
            tempVideoPath,
            audioLength,
          );
          visualSource = "ai-generated";
          visualUrl = `http://localhost:${this.config.port}/api/tmp/${tempImageFileName}`;
          logger.debug(
            { videoId, sceneIndex: index, prompt: visualPrompt },
            "Generated AI visual for scene",
          );
        } else {
          logger.warn(
            { videoId, sceneIndex: index },
            "Failed to generate AI visual, falling back to Pexels",
          );
        }
      }

      // Fallback to Pexels if AI visual generation fails or is not enabled
      if (visualSource !== "ai-generated") {
        const video = await this.pexelsApi.findVideo(
          searchTerms,
          audioLength,
          excludeVideoIds,
          orientation,
        );

        logger.debug(`Downloading video from ${video.url} to ${tempVideoPath}`);

        let retryCount = 0;
        const maxRetries = 3;
        let success = false;
        let lastError: Error | null = null;

        while (retryCount < maxRetries && !success) {
          try {
            await new Promise<void>((resolve, reject) => {
              const fileStream = fs.createWriteStream(tempVideoPath);
              https
                .get(video.url, (response: http.IncomingMessage) => {
                  if (response.statusCode !== 200) {
                    reject(
                      new Error(
                        `Failed to download video: ${response.statusCode}`,
                      ),
                    );
                    return;
                  }

                  response.pipe(fileStream);

                  fileStream.on("finish", () => {
                    fileStream.close();
                    logger.debug(
                      `Video downloaded successfully to ${tempVideoPath}`,
                    );
                    resolve();
                  });
                })
                .on("error", (err: Error) => {
                  fs.unlink(tempVideoPath, () => {}); // Delete the file if download failed
                  logger.error(
                    { err, retryCount },
                    "Error downloading video on attempt",
                  );
                  reject(err);
                });
            });
            success = true;
          } catch (err: unknown) {
            retryCount++;
            lastError = err instanceof Error ? err : new Error(String(err));
            logger.warn(
              { retryCount, maxRetries, url: video.url },
              "Retrying video download after failure",
            );
            if (retryCount < maxRetries) {
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * retryCount),
              ); // Exponential backoff
            }
          }
        }

        if (!success) {
          throw new Error(
            `Failed to download video after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`,
          );
        }

        excludeVideoIds.push(video.id);
        visualUrl = `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`;
      }

      scenes.push({
        captions,
        video: visualUrl,
        audio: {
          url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
          duration: audioLength,
        },
      });

      totalDuration += audioLength;
      processedScenes++;
      index++;
    }
    if (config.paddingBack) {
      totalDuration += config.paddingBack / 1000;
    }

    const contentForMusic = inputScenes
      .map((scene) =>
        Array.isArray(scene.text) ? scene.text.join(" ") : scene.text,
      )
      .join(" ");
    const selectedMusic = await this.findMusic(
      totalDuration,
      config.music,
      contentForMusic,
      videoId,
    );
    logger.debug({ selectedMusic }, "Selected music for the video");

    // Update progress for rendering
    const itemIndex = this.queue.findIndex((item) => item.id === videoId);
    if (itemIndex !== -1) {
      this.queue[itemIndex].progress = 50; // 50% for rendering start
      this.queue[itemIndex].stage = "Rendering Video";
    }

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

    // Update progress for completion
    const finalItemIndex = this.queue.findIndex((item) => item.id === videoId);
    if (finalItemIndex !== -1) {
      this.queue[finalItemIndex].progress = 100;
      this.queue[finalItemIndex].stage = "Completed";
    }

    for (const file of tempFiles) {
      fs.removeSync(file);
    }

    // Generate thumbnail - try AI first, fallback to video extraction
    const videoPath = this.getVideoPath(videoId);
    const thumbnailPath = path.join(
      this.config.videosDirPath,
      `${videoId}.jpg`,
    );
    const videoContent = inputScenes
      .map((scene) =>
        Array.isArray(scene.text) ? scene.text.join(" ") : scene.text,
      )
      .join(" ");

    let thumbnailGenerated = false;
    if (config.useAiVisuals) {
      const base64Thumbnail = await this.cloudflareAI.generateThumbnail(
        videoContent,
        videoId,
      );
      if (base64Thumbnail) {
        const thumbnailBuffer = Buffer.from(base64Thumbnail, "base64");
        fs.writeFileSync(thumbnailPath, thumbnailBuffer);
        thumbnailGenerated = true;
        logger.debug(
          { videoId, thumbnailPath },
          "AI Thumbnail generated for video",
        );
      }
    }

    if (!thumbnailGenerated) {
      await this.ffmpeg.extractThumbnail(videoPath, thumbnailPath);
      logger.debug(
        { videoId, thumbnailPath },
        "Thumbnail extracted from video",
      );
    }

    // Generate video metadata using Cloudflare AI
    const metadata = await this.cloudflareAI.generateVideoMetadata(
      videoContent,
      videoId,
    );
    if (metadata.title) {
      // Store metadata - for simplicity, log it; in a real scenario, save to a database or file
      logger.info({ videoId, metadata }, "Generated video metadata");
      // Optionally, save metadata to a JSON file alongside the video
      const metadataPath = path.join(
        this.config.videosDirPath,
        `${videoId}.json`,
      );
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    }

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

  private async findMusic(
    videoDuration: number,
    tag?: MusicMoodEnum,
    videoContent?: string,
    videoId?: string,
  ): Promise<MusicForVideo> {
    const musicFiles = this.musicManager.musicList().filter((music) => {
      if (tag) {
        return music.mood === tag;
      }
      return true;
    });

    if (videoContent && videoId) {
      const musicSuggestions = await this.vercelAI.suggestMusic(
        videoContent,
        videoId,
      );
      if (musicSuggestions.length > 0) {
        const suggestedMusic = musicFiles.find((music) =>
          musicSuggestions.some((suggestion) =>
            music.url.toLowerCase().includes(suggestion.toLowerCase()),
          ),
        );
        if (suggestedMusic) {
          logger.debug(
            { videoId, musicSuggestions, selectedMusic: suggestedMusic.url },
            "Used Vercel AI suggestions for music selection",
          );
          return suggestedMusic;
        }
      }
    }

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

    // Check if videos directory exists
    if (!fs.existsSync(this.config.videosDirPath)) {
      return videos;
    }

    // Read all files in the videos directory
    const files = fs.readdirSync(this.config.videosDirPath);

    // Filter for MP4 files and extract video IDs
    for (const file of files) {
      if (file.endsWith(".mp4")) {
        const videoId = file.replace(".mp4", "");

        let status: VideoStatus = "ready";
        const inQueue = this.queue.find((item) => item.id === videoId);
        if (inQueue) {
          status = "processing";
        }

        videos.push({ id: videoId, status });
      }
    }

    // Add videos that are in the queue but not yet rendered
    for (const queueItem of this.queue) {
      const existingVideo = videos.find((v) => v.id === queueItem.id);
      if (!existingVideo) {
        videos.push({ id: queueItem.id, status: "processing" });
      }
    }

    return videos;
  }

  public ListAvailableVoices(): string[] {
    return this.kokoro.listAvailableVoices();
  }
}
