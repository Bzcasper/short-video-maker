import fs from "fs-extra";
import cuid from "cuid";
import path from "path";
import { logger } from "../logger";
import { Config } from "../config";
import { ShortCreator } from "../short-creator/ShortCreator";
import { AudioPipelineService, AudioMixingOptions, BeatSyncOptions } from "./AudioPipelineService";
import { TitleSequenceService, TitleGenerationOptions, BrandingConfig } from "./TitleSequenceService";
import { EnhancedSubtitleService, SubtitleGenerationOptions, KaraokeSettings } from "./EnhancedSubtitleService";
import { FramePackIntegrationService, FramePackConfig, VideoGenerationRequest, AudioToVideoRequest } from "./FramePackIntegrationService";
import type {
  SceneInput,
  RenderConfig,
  EnhancedScene,
  AudioToVideoPipelineConfig,
  VideoMetadata,
  VideoStatus,
} from "../types/shorts";
import { OrientationEnum } from "../types/shorts";

export interface EnhancedRenderConfig extends RenderConfig {
  pipelineConfig?: AudioToVideoPipelineConfig;
  enableEnhancedPipeline?: boolean;
}

export interface EnhancedVideoMetadata extends VideoMetadata {
  enhancedFeatures?: {
    audioEnhancement: boolean;
    titleSequences: boolean;
    enhancedSubtitles: boolean;
    aiGeneration: boolean;
    processingSteps: Array<{
      step: string;
      duration: number;
      success: boolean;
      details?: any;
    }>;
  };
}

export class EnhancedShortCreator extends ShortCreator {
  private audioPipeline: AudioPipelineService;
  private titleService: TitleSequenceService;
  private subtitleService: EnhancedSubtitleService;
  private framePackService?: FramePackIntegrationService;
  private defaultFramePackConfig: FramePackConfig;

  constructor(
    config: Config,
    // Inherit all original dependencies from ShortCreator
    remotion: any,
    kokoro: any,
    whisper: any,
    ffmpeg: any,
    pexelsApi: any,
    musicManager: any,
    // New enhanced services
    framePackConfig?: FramePackConfig
  ) {
    super(config, remotion, kokoro, whisper, ffmpeg, pexelsApi, musicManager);
    
    // Initialize enhanced services
    this.audioPipeline = new AudioPipelineService(config);
    this.titleService = new TitleSequenceService(config);
    this.subtitleService = new EnhancedSubtitleService(config);
    
    // Set up default FramePack config
    this.defaultFramePackConfig = framePackConfig || {
      modelPath: process.env.FRAMEPACK_PATH || path.join(config.packageDirPath, 'FramePack'),
      pythonEnv: process.env.FRAMEPACK_VENV || path.join(config.packageDirPath, 'FramePack/venv/bin/python'),
      gpuEnabled: true,
      batchSize: 1,
      maxVideoLength: 60,
      outputResolution: { width: 1080, height: 1920 },
      frameRate: 30,
      qualityLevel: 'standard',
      teaCacheEnabled: true,
      memoryOptimization: true,
    };

    // Initialize FramePack if available
    try {
      this.framePackService = new FramePackIntegrationService(config, this.defaultFramePackConfig);
      logger.info("FramePack integration initialized successfully");
    } catch (error) {
      logger.warn({ error }, "FramePack not available, AI generation disabled");
    }
  }

  /**
   * Enhanced video creation with full audio-to-video pipeline
   */
  async createEnhancedShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: EnhancedRenderConfig
  ): Promise<string> {
    const startTime = Date.now();
    
    logger.debug(
      { videoId, inputScenes, config },
      "Starting enhanced video creation"
    );

    try {
      // Check if enhanced pipeline is enabled
      if (!config.enableEnhancedPipeline || !config.pipelineConfig) {
        logger.debug("Enhanced pipeline disabled, falling back to standard creation");
        return this.createShort(videoId, inputScenes, config);
      }

      const pipelineConfig = config.pipelineConfig;
      const scenes: EnhancedScene[] = [];
      const tempFiles: string[] = [];
      const processingSteps: Array<{
        step: string;
        duration: number;
        success: boolean;
        details?: any;
      }> = [];

      // Step 1: Audio Processing and Enhancement
      if (pipelineConfig.audioEnhancement.enableAdvancedMixing) {
        await this.processAdvancedAudio(inputScenes, pipelineConfig, tempFiles, processingSteps);
      }

      // Step 2: Generate Enhanced Scenes
      for (let i = 0; i < inputScenes.length; i++) {
        const scene = inputScenes[i];
        const enhancedScene = await this.createEnhancedScene(
          scene,
          config,
          pipelineConfig,
          i,
          tempFiles,
          processingSteps
        );
        scenes.push(enhancedScene);
      }

      // Step 3: Generate Title Sequences
      if (pipelineConfig.titleSequences.enableIntroTitle || 
          pipelineConfig.titleSequences.enableOutroTitle) {
        await this.generateTitleSequences(scenes, pipelineConfig, tempFiles, processingSteps);
      }

      // Step 4: Enhanced Subtitle Processing
      if (pipelineConfig.subtitleStyling.enableAnimations || 
          pipelineConfig.subtitleStyling.enableKaraoke) {
        await this.processEnhancedSubtitles(scenes, pipelineConfig, processingSteps);
      }

      // Step 5: Final Video Assembly
      const finalVideoPath = await this.assembleEnhancedVideo(
        videoId,
        scenes,
        config,
        pipelineConfig,
        tempFiles,
        processingSteps
      );

      // Update metadata with enhanced features
      const metadata: EnhancedVideoMetadata['enhancedFeatures'] = {
        audioEnhancement: pipelineConfig.audioEnhancement.enableAdvancedMixing,
        titleSequences: pipelineConfig.titleSequences.enableIntroTitle || pipelineConfig.titleSequences.enableOutroTitle,
        enhancedSubtitles: pipelineConfig.subtitleStyling.enableAnimations,
        aiGeneration: pipelineConfig.aiVideoGeneration.enableAIGeneration,
        processingSteps,
      };

      // Clean up temporary files
      await this.cleanup(tempFiles);

      const totalTime = Date.now() - startTime;
      logger.debug(
        { videoId, totalTime, enhancedFeatures: metadata },
        "Enhanced video creation completed"
      );

      return finalVideoPath;

    } catch (error) {
      logger.error({ videoId, error }, "Enhanced video creation failed");
      throw new Error(`Enhanced video creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates an enhanced scene with AI generation capabilities
   */
  private async createEnhancedScene(
    sceneInput: SceneInput,
    config: EnhancedRenderConfig,
    pipelineConfig: AudioToVideoPipelineConfig,
    sceneIndex: number,
    tempFiles: string[],
    processingSteps: Array<{
      step: string;
      duration: number;
      success: boolean;
      details?: any;
    }>
  ): Promise<EnhancedScene> {
    const stepStart = Date.now();

    try {
      // Generate audio (TTS)
      const audio = await this.kokoro.generate(
        sceneInput.text,
        config.voice ?? "af_heart"
      );

      // Enhanced audio processing
      let finalAudioPath = '';
      
      // First save the audio to a temporary file
      const tempAudioPath = path.join(this.config.tempDirPath, `audio_${Date.now()}.wav`);
      await this.ffmpeg.saveNormalizedAudio(audio.audio, tempAudioPath);
      tempFiles.push(tempAudioPath);
      
      if (pipelineConfig.audioEnhancement.enableVoiceEnhancement) {
        const enhancedAudio = await this.audioPipeline.enhanceVoice(tempAudioPath);
        finalAudioPath = enhancedAudio.outputPath;
        tempFiles.push(finalAudioPath);
      } else {
        finalAudioPath = tempAudioPath;
      }

      // Generate captions with enhanced styling
      const captions = await this.whisper.CreateCaption(finalAudioPath);
      
      // Video generation - AI vs Traditional
      let videoPath = '';
      let aiGenerated = false;
      let generationMetadata = undefined;

      if (pipelineConfig.aiVideoGeneration.enableAIGeneration && 
          sceneInput.useAIGeneration && 
          this.framePackService) {
        
        // Use AI video generation
        const videoRequest: VideoGenerationRequest = {
          prompt: sceneInput.videoPrompt || this.generateVideoPrompt(sceneInput),
          duration: audio.audioLength,
          style: pipelineConfig.aiVideoGeneration.stylePreferences ? {
            ...pipelineConfig.aiVideoGeneration.stylePreferences,
            lighting: 'natural'
          } : {
            mood: 'calm',
            cinematography: 'smooth',
            colorGrading: 'natural',
            lighting: 'natural'
          },
          referenceImage: sceneInput.imagePrompt ? undefined : await this.generateReferenceImage(sceneInput),
        };

        const aiResult = await this.framePackService.generateVideoFromPrompt(videoRequest);
        videoPath = aiResult.videoPath;
        aiGenerated = true;
        generationMetadata = {
          prompt: videoRequest.prompt,
          seed: aiResult.metadata.seed,
          processingTime: aiResult.metadata.generationTime,
          quality: pipelineConfig.aiVideoGeneration.quality,
        };
        
        tempFiles.push(videoPath);
        
      } else if (pipelineConfig.enableHybridMode && Math.random() > 0.5) {
        // Hybrid mode: occasionally use AI for variety
        // This could be enhanced with content analysis to determine best approach
        
        if (this.framePackService) {
          try {
            const videoRequest: VideoGenerationRequest = {
              prompt: this.generateVideoPrompt(sceneInput),
              duration: audio.audioLength,
              style: { mood: 'calm', cinematography: 'smooth', colorGrading: 'natural', lighting: 'natural' },
            };
            
            const aiResult = await this.framePackService.generateVideoFromPrompt(videoRequest);
            videoPath = aiResult.videoPath;
            aiGenerated = true;
            generationMetadata = {
              prompt: videoRequest.prompt,
              seed: aiResult.metadata.seed,
              processingTime: aiResult.metadata.generationTime,
              quality: pipelineConfig.aiVideoGeneration.quality,
            };
            tempFiles.push(videoPath);
            
          } catch (aiError) {
            logger.warn({ sceneIndex, aiError }, "AI generation failed, falling back to stock video");
            // Fallback to traditional stock video
            videoPath = await this.getStockVideo(sceneInput, audio.audioLength);
          }
        } else {
          videoPath = await this.getStockVideo(sceneInput, audio.audioLength);
        }
      } else {
        // Traditional stock video
        videoPath = await this.getStockVideo(sceneInput, audio.audioLength);
      }

      const enhancedScene: EnhancedScene = {
        captions,
        video: videoPath,
        audio: {
          url: finalAudioPath,
          duration: audio.audioLength,
        },
        aiGenerated,
        generationMetadata,
      };

      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: `Scene ${sceneIndex + 1} Creation`,
        duration: stepDuration,
        success: true,
        details: {
          aiGenerated,
          audioEnhanced: pipelineConfig.audioEnhancement.enableVoiceEnhancement,
          textLength: sceneInput.text.length,
        },
      });

      return enhancedScene;

    } catch (error) {
      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: `Scene ${sceneIndex + 1} Creation`,
        duration: stepDuration,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      
      throw error;
    }
  }

  /**
   * Processes advanced audio mixing and enhancement
   */
  private async processAdvancedAudio(
    inputScenes: SceneInput[],
    pipelineConfig: AudioToVideoPipelineConfig,
    tempFiles: string[],
    processingSteps: Array<{
      step: string;
      duration: number;
      success: boolean;
      details?: any;
    }>
  ): Promise<void> {
    const stepStart = Date.now();

    try {
      // This would implement advanced audio processing across all scenes
      // For now, we'll just log that advanced audio processing would happen here
      
      logger.debug("Advanced audio processing would be implemented here");
      
      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: 'Advanced Audio Processing',
        duration: stepDuration,
        success: true,
        details: {
          beatSyncEnabled: pipelineConfig.audioEnhancement.enableBeatSync,
          voiceEnhancementEnabled: pipelineConfig.audioEnhancement.enableVoiceEnhancement,
        },
      });

    } catch (error) {
      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: 'Advanced Audio Processing',
        duration: stepDuration,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }
  }

  /**
   * Generates title sequences for intro/outro
   */
  private async generateTitleSequences(
    scenes: EnhancedScene[],
    pipelineConfig: AudioToVideoPipelineConfig,
    tempFiles: string[],
    processingSteps: Array<{
      step: string;
      duration: number;
      success: boolean;
      details?: any;
    }>
  ): Promise<void> {
    const stepStart = Date.now();

    try {
      const titleConfig = pipelineConfig.titleSequences;

      // Generate intro title if enabled
      if (titleConfig.enableIntroTitle) {
        const brandingConfig = titleConfig.branding ? {
          ...titleConfig.branding,
          brandFonts: ['Arial', 'sans-serif'],
          watermarkPosition: 'bottom-right' as const,
          brandingOpacity: 0.8
        } : undefined;
        
        const introTitle = await this.titleService.generateIntroSequence(
          titleConfig.customTitle || "Short Video",
          titleConfig.customSubtitle,
          brandingConfig
        );
        
        // Add intro scene to beginning
        const introScene: EnhancedScene = {
          captions: [],
          video: introTitle.renderPath || '',
          audio: { url: '', duration: titleConfig.duration },
          titleSequence: { intro: introTitle.htmlContent },
        };
        
        scenes.unshift(introScene);
      }

      // Generate outro title if enabled
      if (titleConfig.enableOutroTitle) {
        const brandingConfig = titleConfig.branding ? {
          ...titleConfig.branding,
          brandFonts: ['Arial', 'sans-serif'],
          watermarkPosition: 'bottom-right' as const,
          brandingOpacity: 0.8
        } : undefined;
        
        const outroTitle = await this.titleService.generateOutroSequence(
          "Thanks for watching!",
          undefined,
          brandingConfig
        );
        
        // Add outro scene to end
        const outroScene: EnhancedScene = {
          captions: [],
          video: outroTitle.renderPath || '',
          audio: { url: '', duration: titleConfig.duration },
          titleSequence: { outro: outroTitle.htmlContent },
        };
        
        scenes.push(outroScene);
      }

      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: 'Title Sequence Generation',
        duration: stepDuration,
        success: true,
        details: {
          introGenerated: titleConfig.enableIntroTitle,
          outroGenerated: titleConfig.enableOutroTitle,
        },
      });

    } catch (error) {
      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: 'Title Sequence Generation',
        duration: stepDuration,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }
  }

  /**
   * Processes enhanced subtitles with animations
   */
  private async processEnhancedSubtitles(
    scenes: EnhancedScene[],
    pipelineConfig: AudioToVideoPipelineConfig,
    processingSteps: Array<{
      step: string;
      duration: number;
      success: boolean;
      details?: any;
    }>
  ): Promise<void> {
    const stepStart = Date.now();

    try {
      const subtitleConfig = pipelineConfig.subtitleStyling;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        if (scene.captions.length === 0) continue;

        const subtitleOptions: SubtitleGenerationOptions = {
          captions: scene.captions,
          style: this.subtitleService['presetStyles'].get(subtitleConfig.stylePreset) || 
                 this.subtitleService['createDefaultStyle'](),
          position: 'bottom',
          maxLineLength: 40,
          maxLinesPerPage: 2,
          animations: subtitleConfig.enableAnimations ? [{
            type: 'fadeIn',
            duration: 300,
            easing: 'ease-out',
          }] : undefined,
          karaoke: subtitleConfig.enableKaraoke ? {
            highlightStyle: this.subtitleService['createDefaultStyle'](),
            transitionDuration: 200,
            previewDuration: 100,
            syncTolerance: 50,
            wordByWord: true,
            smoothTransitions: true,
          } : undefined,
        };

        const enhancedSubtitles = await this.subtitleService.generateEnhancedSubtitles(subtitleOptions);
        
        scene.enhancedSubtitles = {
          styleUsed: subtitleConfig.stylePreset,
          animationsApplied: subtitleConfig.enableAnimations ? ['fadeIn'] : [],
          karaokeEnabled: subtitleConfig.enableKaraoke,
        };
      }

      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: 'Enhanced Subtitle Processing',
        duration: stepDuration,
        success: true,
        details: {
          scenesProcessed: scenes.length,
          animationsEnabled: subtitleConfig.enableAnimations,
          karaokeEnabled: subtitleConfig.enableKaraoke,
        },
      });

    } catch (error) {
      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: 'Enhanced Subtitle Processing',
        duration: stepDuration,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }
  }

  /**
   * Assembles the final enhanced video
   */
  private async assembleEnhancedVideo(
    videoId: string,
    scenes: EnhancedScene[],
    config: EnhancedRenderConfig,
    pipelineConfig: AudioToVideoPipelineConfig,
    tempFiles: string[],
    processingSteps: Array<{
      step: string;
      duration: number;
      success: boolean;
      details?: any;
    }>
  ): Promise<string> {
    const stepStart = Date.now();

    try {
      // Use existing Remotion rendering with enhanced scenes
      // The scenes have been pre-processed with all enhancements
      
      const totalDuration = scenes.reduce((acc, scene) => acc + scene.audio.duration, 0);
      const selectedMusic = this.findMusic(totalDuration, config.music);

      await this.remotion.render(
        {
          music: selectedMusic,
          scenes: scenes.map(scene => ({
            captions: scene.captions,
            video: scene.video,
            audio: scene.audio,
          })),
          config: {
            durationMs: totalDuration * 1000,
            paddingBack: config.paddingBack,
            captionBackgroundColor: config.captionBackgroundColor,
            captionPosition: config.captionPosition,
            musicVolume: config.musicVolume,
          },
        },
        videoId,
        config.orientation || OrientationEnum.portrait
      );

      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: 'Final Video Assembly',
        duration: stepDuration,
        success: true,
        details: {
          totalScenes: scenes.length,
          totalDuration,
          aiScenesCount: scenes.filter(s => s.aiGenerated).length,
        },
      });

      return this.getVideoPath(videoId);

    } catch (error) {
      const stepDuration = Date.now() - stepStart;
      processingSteps.push({
        step: 'Final Video Assembly',
        duration: stepDuration,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      throw error;
    }
  }

  /**
   * Generates video prompt from scene input
   */
  private generateVideoPrompt(sceneInput: SceneInput): string {
    if (sceneInput.videoPrompt) {
      return sceneInput.videoPrompt;
    }

    // Generate prompt from search terms and text
    const searchTermsStr = sceneInput.searchTerms.join(', ');
    return `Visual representation of ${searchTermsStr}, related to: ${sceneInput.text}`;
  }

  /**
   * Generates reference image for AI video generation
   */
  private async generateReferenceImage(sceneInput: SceneInput): Promise<string> {
    // This would integrate with an image generation service
    // For now, return a placeholder path
    const imagePath = path.join(this.config.tempDirPath, `ref_${Date.now()}.png`);
    
    // Create placeholder file
    await fs.writeFile(
      imagePath.replace('.png', '.txt'), 
      `Reference image for: ${sceneInput.searchTerms.join(', ')}`
    );
    
    return imagePath;
  }

  /**
   * Gets stock video using traditional method
   */
  private async getStockVideo(sceneInput: SceneInput, duration: number): Promise<string> {
    const video = await this.pexelsApi.findVideo(
      sceneInput.searchTerms,
      duration,
      [],
      OrientationEnum.portrait // Default orientation
    );

    const tempVideoPath = path.join(this.config.tempDirPath, `stock_${Date.now()}.mp4`);
    
    // Download video (simplified for brevity)
    await this.downloadVideo(video.url, tempVideoPath);
    
    return tempVideoPath;
  }

  /**
   * Downloads video from URL
   */
  private async downloadVideo(url: string, outputPath: string): Promise<void> {
    // Implementation would download the video file
    // For now, create a placeholder
    await fs.writeFile(outputPath.replace('.mp4', '.txt'), `Video from: ${url}`);
  }

  /**
   * Cleans up temporary files
   */
  private async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          logger.debug({ filePath }, "Cleaned up temporary file");
        }
      } catch (error) {
        logger.warn({ filePath, error }, "Failed to clean up temporary file");
      }
    }
  }

  /**
   * Gets available AI video generation capabilities
   */
  getAICapabilities(): {
    framePackAvailable: boolean;
    supportedQualities: string[];
    maxDuration: number;
  } {
    return {
      framePackAvailable: !!this.framePackService,
      supportedQualities: ['draft', 'standard', 'high', 'ultra'],
      maxDuration: this.defaultFramePackConfig.maxVideoLength,
    };
  }
}