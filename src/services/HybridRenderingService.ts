import path from "path";
import { promises as fs } from "fs";
import cuid from "cuid";
import ffmpeg from "fluent-ffmpeg";
import { FramePackService, FramePackConfig, FramePackResult } from "./FramePackService";
import { ImageProcessingService, ImageGenerationConfig, ImageProcessingResult } from "./ImageProcessingService";
import { PexelsAPI } from "../short-creator/libraries/Pexels";
import { FFMpeg } from "../short-creator/libraries/FFmpeg";
import { logger } from "../logger";
import { Config } from "../config";
import { OrientationEnum } from "../types/shorts";

export interface HybridRenderingConfig {
  useAIGeneration: boolean;
  aiGenerationRatio?: number; // 0-1, percentage of scenes to use AI generation
  fallbackToTraditional: boolean;
  enhanceTraditionalVideo: boolean;
  aiImagePrompts?: string[];
  aiVideoPrompts?: string[];
  qualitySettings: {
    imageQuality: "standard" | "hd" | "ultra";
    videoQuality: "fast" | "balanced" | "high";
    frameRate: 24 | 30 | 60;
  };
}

export interface HybridScene {
  type: "traditional" | "ai-generated" | "enhanced";
  originalVideoPath?: string;
  aiGeneratedVideoPath?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  duration: number;
  metadata: {
    source: "pexels" | "ai" | "enhanced";
    processingTime: number;
    quality: string;
  };
}

export interface HybridRenderingResult {
  success: boolean;
  scenes: HybridScene[];
  totalDuration: number;
  processingStats: {
    traditionalScenes: number;
    aiGeneratedScenes: number;
    enhancedScenes: number;
    totalProcessingTime: number;
    averageProcessingTimePerScene: number;
  };
  error?: string;
}

export class HybridRenderingService {
  private framePackService: FramePackService;
  private imageProcessingService: ImageProcessingService;

  constructor(
    private config: Config,
    private pexelsApi: PexelsAPI,
    private ffmpeg: FFMpeg
  ) {
    this.framePackService = new FramePackService(config);
    this.imageProcessingService = new ImageProcessingService(config);
  }

  /**
   * Generate hybrid video content combining traditional stock video with AI-generated content
   */
  public async generateHybridContent(
    searchTerms: string[],
    renderingConfig: HybridRenderingConfig,
    sceneDurations: number[],
    orientation: OrientationEnum = OrientationEnum.portrait,
    videoId: string
  ): Promise<HybridRenderingResult> {
    const startTime = Date.now();
    const scenes: HybridScene[] = [];
    let traditionalCount = 0;
    let aiGeneratedCount = 0;
    let enhancedCount = 0;

    try {
      logger.info({
        searchTerms,
        renderingConfig,
        orientation,
        videoId
      }, "Starting hybrid rendering");

      const totalScenes = searchTerms.length;
      const aiSceneCount = Math.floor(totalScenes * (renderingConfig.aiGenerationRatio || 0.3));
      
      // Determine which scenes should use AI generation
      const aiSceneIndices = this.selectAISceneIndices(totalScenes, aiSceneCount);
      
      for (let i = 0; i < searchTerms.length; i++) {
        const searchTerm = searchTerms[i];
        const duration = sceneDurations[i] || 5;
        const shouldUseAI = renderingConfig.useAIGeneration && aiSceneIndices.includes(i);
        
        logger.info({
          sceneIndex: i,
          searchTerm,
          duration,
          shouldUseAI
        }, "Processing scene");

        try {
          if (shouldUseAI) {
            // Generate AI content
            const aiScene = await this.generateAIScene(
              searchTerm,
              duration,
              renderingConfig,
              orientation,
              i,
              videoId
            );
            scenes.push(aiScene);
            aiGeneratedCount++;
          } else {
            // Use traditional stock video
            const traditionalScene = await this.generateTraditionalScene(
              searchTerm,
              duration,
              renderingConfig,
              orientation,
              i,
              videoId
            );
            scenes.push(traditionalScene);
            
            if (traditionalScene.type === "enhanced") {
              enhancedCount++;
            } else {
              traditionalCount++;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn({
            sceneIndex: i,
            searchTerm,
            error: errorMessage
          }, "Scene generation failed, falling back");

          // Fallback to traditional if AI fails
          if (shouldUseAI && renderingConfig.fallbackToTraditional) {
            const fallbackScene = await this.generateTraditionalScene(
              searchTerm,
              duration,
              renderingConfig,
              orientation,
              i,
              videoId
            );
            scenes.push(fallbackScene);
            traditionalCount++;
          } else {
            throw error; // Re-throw if no fallback
          }
        }
      }

      const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
      const totalProcessingTime = Date.now() - startTime;

      const result: HybridRenderingResult = {
        success: true,
        scenes,
        totalDuration,
        processingStats: {
          traditionalScenes: traditionalCount,
          aiGeneratedScenes: aiGeneratedCount,
          enhancedScenes: enhancedCount,
          totalProcessingTime,
          averageProcessingTimePerScene: totalProcessingTime / scenes.length,
        },
      };

      logger.info({
        videoId,
        stats: result.processingStats,
        totalDuration
      }, "Hybrid rendering completed");

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        videoId,
        error: errorMessage,
        scenesCompleted: scenes.length
      }, "Hybrid rendering failed");

      return {
        success: false,
        scenes,
        totalDuration: scenes.reduce((sum, scene) => sum + scene.duration, 0),
        processingStats: {
          traditionalScenes: traditionalCount,
          aiGeneratedScenes: aiGeneratedCount,
          enhancedScenes: enhancedCount,
          totalProcessingTime: Date.now() - startTime,
          averageProcessingTimePerScene: scenes.length > 0 ? (Date.now() - startTime) / scenes.length : 0,
        },
        error: errorMessage,
      };
    }
  }

  /**
   * Generate AI-powered scene using FramePack
   */
  private async generateAIScene(
    searchTerm: string,
    duration: number,
    config: HybridRenderingConfig,
    orientation: OrientationEnum,
    sceneIndex: number,
    videoId: string
  ): Promise<HybridScene> {
    const sceneStartTime = Date.now();
    const sceneId = `${videoId}_ai_${sceneIndex}`;
    
    // Generate or find base image for FramePack
    const imagePrompt = this.createImagePrompt(searchTerm, config.aiImagePrompts?.[sceneIndex]);
    const videoPrompt = this.createVideoPrompt(searchTerm, config.aiVideoPrompts?.[sceneIndex]);
    
    const tempImagePath = path.join(this.config.tempDirPath, `${sceneId}_input.jpg`);
    const outputVideoPath = path.join(this.config.tempDirPath, `${sceneId}_ai.mp4`);

    try {
      // Step 1: Generate base image
      logger.info({ sceneId, imagePrompt }, "Generating base image for AI video");
      
      const imageConfig: ImageGenerationConfig = {
        prompt: imagePrompt,
        aspectRatio: orientation === OrientationEnum.portrait ? "9:16" : "16:9",
        quality: config.qualitySettings.imageQuality,
        style: "photographic",
      };

      const imageResult = await this.imageProcessingService.generateImage(
        imageConfig,
        tempImagePath
      );

      if (!imageResult.success) {
        throw new Error(`Failed to generate base image: ${imageResult.error}`);
      }

      // Step 2: Prepare image for FramePack
      const preparedImagePath = path.join(this.config.tempDirPath, `${sceneId}_prepared.jpg`);
      const prepResult = await this.imageProcessingService.prepareForFramePack(
        tempImagePath,
        preparedImagePath,
        orientation === OrientationEnum.portrait ? "portrait" : "landscape"
      );

      if (!prepResult.success) {
        throw new Error(`Failed to prepare image for FramePack: ${prepResult.error}`);
      }

      // Step 3: Generate video using FramePack
      logger.info({ sceneId, videoPrompt, duration }, "Generating AI video");
      
      const framePackConfig: FramePackConfig = {
        imagePath: preparedImagePath,
        prompt: videoPrompt,
        outputPath: outputVideoPath,
        duration,
        seed: Math.floor(Math.random() * 1000000),
        steps: config.qualitySettings.videoQuality === "high" ? 30 : 
               config.qualitySettings.videoQuality === "balanced" ? 25 : 20,
        useTeaCache: config.qualitySettings.videoQuality === "fast",
        mp4Crf: config.qualitySettings.videoQuality === "high" ? 12 : 16,
      };

      const framePackResult = await this.framePackService.generateVideo(
        framePackConfig,
        sceneId
      );

      if (!framePackResult.success) {
        throw new Error(`FramePack generation failed: ${framePackResult.error}`);
      }

      // Step 4: Post-process video if needed
      const finalVideoPath = await this.postProcessAIVideo(
        framePackResult.outputPath!,
        config,
        sceneId,
        orientation
      );

      // Cleanup temporary files
      await this.cleanupTempFiles([tempImagePath, preparedImagePath]);

      const processingTime = Date.now() - sceneStartTime;

      return {
        type: "ai-generated",
        aiGeneratedVideoPath: finalVideoPath,
        imagePrompt,
        videoPrompt,
        duration: framePackResult.duration || duration,
        metadata: {
          source: "ai",
          processingTime,
          quality: config.qualitySettings.videoQuality,
        },
      };

    } catch (error) {
      // Cleanup on error
      await this.cleanupTempFiles([tempImagePath, outputVideoPath]);
      throw error;
    }
  }

  /**
   * Generate traditional scene using stock video with optional enhancement
   */
  private async generateTraditionalScene(
    searchTerm: string,
    duration: number,
    config: HybridRenderingConfig,
    orientation: OrientationEnum,
    sceneIndex: number,
    videoId: string
  ): Promise<HybridScene> {
    const sceneStartTime = Date.now();
    const sceneId = `${videoId}_trad_${sceneIndex}`;

    try {
      // Find stock video
      const video = await this.pexelsApi.findVideo(
        [searchTerm],
        duration,
        [], // excludeVideoIds
        orientation
      );

      const tempVideoPath = path.join(this.config.tempDirPath, `${sceneId}_original.mp4`);
      
      // Download video
      await this.downloadVideo(video.url, tempVideoPath);

      let finalVideoPath = tempVideoPath;
      let sceneType: "traditional" | "enhanced" = "traditional";

      // Apply enhancement if requested
      if (config.enhanceTraditionalVideo) {
        logger.info({ sceneId, searchTerm }, "Enhancing traditional video");
        
        const enhancedPath = await this.enhanceTraditionalVideo(
          tempVideoPath,
          config,
          sceneId,
          orientation
        );
        
        if (enhancedPath) {
          finalVideoPath = enhancedPath;
          sceneType = "enhanced";
        }
      }

      const processingTime = Date.now() - sceneStartTime;

      return {
        type: sceneType,
        originalVideoPath: finalVideoPath,
        duration,
        metadata: {
          source: "pexels",
          processingTime,
          quality: config.qualitySettings.videoQuality,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ sceneId, searchTerm, error: errorMessage }, "Traditional scene generation failed");
      throw error;
    }
  }

  /**
   * Post-process AI-generated video
   */
  private async postProcessAIVideo(
    inputPath: string,
    config: HybridRenderingConfig,
    sceneId: string,
    orientation: OrientationEnum
  ): Promise<string> {
    const outputPath = path.join(this.config.tempDirPath, `${sceneId}_final.mp4`);

    try {
      // Apply video post-processing based on quality settings
      await new Promise<void>((resolve, reject) => {
        let ffmpegCommand = ffmpeg()
          .input(inputPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .format('mp4');

        // Apply quality settings
        if (config.qualitySettings.videoQuality === "high") {
          ffmpegCommand = ffmpegCommand
            .videoBitrate('5000k')
            .outputOption('-preset slow')
            .outputOption('-profile:v high')
            .outputOption('-level 4.0');
        } else if (config.qualitySettings.videoQuality === "balanced") {
          ffmpegCommand = ffmpegCommand
            .videoBitrate('3000k')
            .outputOption('-preset medium');
        } else {
          ffmpegCommand = ffmpegCommand
            .videoBitrate('2000k')
            .outputOption('-preset fast');
        }

        // Set frame rate
        ffmpegCommand = ffmpegCommand.fps(config.qualitySettings.frameRate);

        // Apply resolution adjustments if needed
        if (orientation === OrientationEnum.portrait) {
          ffmpegCommand = ffmpegCommand.size('576x1024');
        } else {
          ffmpegCommand = ffmpegCommand.size('1024x576');
        }

        ffmpegCommand
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (error: Error) => reject(error))
          .run();
      });

      return outputPath;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ sceneId, error: errorMessage }, "AI video post-processing failed, using original");
      return inputPath;
    }
  }

  /**
   * Enhance traditional video with AI techniques
   */
  private async enhanceTraditionalVideo(
    inputPath: string,
    config: HybridRenderingConfig,
    sceneId: string,
    orientation: OrientationEnum
  ): Promise<string | null> {
    const outputPath = path.join(this.config.tempDirPath, `${sceneId}_enhanced.mp4`);

    try {
      // Basic video enhancement using FFmpeg filters
      await new Promise<void>((resolve, reject) => {
        let ffmpegCommand = ffmpeg()
          .input(inputPath);

        // Apply enhancement filters
        const filters = [];
        
        // Upscaling and sharpening
        if (config.qualitySettings.videoQuality === "high") {
          filters.push('unsharp=5:5:1.0:5:5:0.0'); // Sharpen
          filters.push('eq=contrast=1.1:brightness=0.05:saturation=1.1'); // Color enhancement
        }
        
        // Noise reduction
        filters.push('nlmeans=s=3.0');
        
        // Stabilization (basic)
        filters.push('vidstabdetect=result=/tmp/transforms.trf:shakiness=5');
        filters.push('vidstabtransform=input=/tmp/transforms.trf:smoothing=10');

        if (filters.length > 0) {
          ffmpegCommand = ffmpegCommand.videoFilter(filters.join(','));
        }

        ffmpegCommand
          .videoCodec('libx264')
          .audioCodec('aac')
          .format('mp4')
          .fps(config.qualitySettings.frameRate)
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (error: Error) => reject(error))
          .run();
      });

      return outputPath;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ sceneId, error: errorMessage }, "Video enhancement failed");
      return null;
    }
  }

  /**
   * Create optimized image prompt for AI generation
   */
  private createImagePrompt(searchTerm: string, customPrompt?: string): string {
    if (customPrompt) {
      return customPrompt;
    }

    // Enhanced prompt engineering for better image generation
    const basePrompts: Record<string, string> = {
      person: "professional portrait photography, high quality, detailed face, natural lighting",
      nature: "stunning landscape photography, natural lighting, high resolution, detailed",
      city: "urban cityscape, modern architecture, golden hour lighting, professional photography",
      food: "food photography, appetizing, professional lighting, high quality, detailed textures",
      technology: "modern technology, clean design, professional product photography",
      sports: "dynamic sports action, professional sports photography, high energy",
      business: "professional business environment, modern office, clean and bright",
      travel: "travel photography, beautiful destination, professional quality, inspiring view",
      general: "professional photography, high quality, detailed"
    };

    const category = this.categorizeSearchTerm(searchTerm);
    const basePrompt = basePrompts[category] || basePrompts.general;
    
    return `${searchTerm}, ${basePrompt}, 8K resolution, award-winning photography`;
  }

  /**
   * Create optimized video prompt for FramePack
   */
  private createVideoPrompt(searchTerm: string, customPrompt?: string): string {
    if (customPrompt) {
      return customPrompt;
    }

    // FramePack works well with motion-focused prompts
    const motionPrompts: Record<string, string> = {
      person: "person moves naturally, expressive gestures, smooth movements, clear motions",
      nature: "gentle movement in nature, flowing water, swaying trees, natural motion",
      city: "dynamic urban movement, people walking, traffic flowing, city life",
      food: "appetizing food presentation, steam rising, natural food movements",
      technology: "smooth technology demonstration, elegant device interaction",
      sports: "dynamic athletic movements, energetic sports action, fluid motions",
      business: "professional business interactions, confident movements",
      travel: "exploring beautiful locations, smooth camera movements, engaging travel scenes",
      general: "smooth, natural movements, clear motion, engaging action"
    };

    const category = this.categorizeSearchTerm(searchTerm);
    const basePrompt = motionPrompts[category] || motionPrompts.general;
    
    return `${searchTerm}, ${basePrompt}, high quality video, smooth motion, clear and engaging`;
  }

  /**
   * Categorize search term for better prompt optimization
   */
  private categorizeSearchTerm(searchTerm: string): string {
    const term = searchTerm.toLowerCase();
    
    if (term.includes('person') || term.includes('people') || term.includes('man') || term.includes('woman')) return 'person';
    if (term.includes('nature') || term.includes('forest') || term.includes('mountain') || term.includes('ocean')) return 'nature';
    if (term.includes('city') || term.includes('urban') || term.includes('building') || term.includes('street')) return 'city';
    if (term.includes('food') || term.includes('cooking') || term.includes('restaurant') || term.includes('meal')) return 'food';
    if (term.includes('technology') || term.includes('computer') || term.includes('phone') || term.includes('device')) return 'technology';
    if (term.includes('sport') || term.includes('fitness') || term.includes('exercise') || term.includes('running')) return 'sports';
    if (term.includes('business') || term.includes('office') || term.includes('meeting') || term.includes('work')) return 'business';
    if (term.includes('travel') || term.includes('vacation') || term.includes('trip') || term.includes('destination')) return 'travel';
    
    return 'general';
  }

  /**
   * Select which scenes should use AI generation
   */
  private selectAISceneIndices(totalScenes: number, aiSceneCount: number): number[] {
    if (aiSceneCount === 0) return [];
    if (aiSceneCount >= totalScenes) return Array.from({ length: totalScenes }, (_, i) => i);
    
    // Distribute AI scenes evenly throughout the video
    const indices: number[] = [];
    const step = totalScenes / aiSceneCount;
    
    for (let i = 0; i < aiSceneCount; i++) {
      const index = Math.floor(i * step);
      indices.push(index);
    }
    
    return indices;
  }

  /**
   * Download video from URL
   */
  private async downloadVideo(url: string, outputPath: string): Promise<void> {
    const https = await import('https');
    const fs = await import('fs');
    
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(outputPath);
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download video: ${response.statusCode}`));
          return;
        }

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      }).on('error', (error) => {
        fs.unlink(outputPath, () => {}); // Clean up on error
        reject(error);
      });
    });
  }

  /**
   * Clean up temporary files
   */
  private async cleanupTempFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ignore cleanup errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.debug({ filePath, error: errorMessage }, "Failed to cleanup temp file");
      }
    }
  }

  /**
   * Get hybrid rendering capabilities and status
   */
  public async getCapabilities(): Promise<{
    framePackAvailable: boolean;
    imageGenerationAvailable: boolean;
    systemRequirements: any;
    supportedFormats: string[];
    maxConcurrentJobs: number;
  }> {
    const [systemReq, imageServices] = await Promise.all([
      this.framePackService.checkSystemRequirements(),
      Promise.resolve(this.imageProcessingService.getAvailableServices())
    ]);

    return {
      framePackAvailable: systemReq.framePackInstalled && systemReq.hasGPU,
      imageGenerationAvailable: imageServices.stability || imageServices.openai,
      systemRequirements: systemReq,
      supportedFormats: ['mp4', 'webm', 'avi'],
      maxConcurrentJobs: systemReq.hasGPU && systemReq.gpuMemoryGB > 12 ? 2 : 1,
    };
  }

  /**
   * Clean up resources
   */
  public async close(): Promise<void> {
    await this.framePackService.close();
    logger.info("Hybrid rendering service closed");
  }
}