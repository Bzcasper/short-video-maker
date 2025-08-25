import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import { logger } from "../logger";
import { Config } from "../config";

export interface FramePackConfig {
  modelPath: string;
  pythonEnv?: string; // Path to Python environment with FramePack dependencies
  gpuEnabled: boolean;
  batchSize: number;
  maxVideoLength: number; // in seconds
  outputResolution: {
    width: number;
    height: number;
  };
  frameRate: number;
  qualityLevel: 'draft' | 'standard' | 'high' | 'ultra';
  teaCacheEnabled: boolean; // Speed optimization
  memoryOptimization: boolean;
}

export interface VideoGenerationRequest {
  prompt: string;
  referenceImage?: string; // Optional starting image
  duration: number; // in seconds
  style?: {
    mood: 'dramatic' | 'energetic' | 'calm' | 'mysterious' | 'playful';
    cinematography: 'static' | 'dynamic' | 'smooth' | 'handheld';
    colorGrading: 'natural' | 'warm' | 'cool' | 'high_contrast' | 'desaturated';
    lighting: 'natural' | 'dramatic' | 'soft' | 'neon' | 'golden_hour';
  };
  seed?: number; // For reproducible generation
  guidanceScale?: number; // Control how closely to follow the prompt
  motionIntensity?: number; // 0.0 to 1.0, controls amount of motion
}

export interface AudioToVideoRequest {
  audioPath: string;
  audioAnalysis?: {
    tempo: number;
    beats: number[];
    energy: number; // 0.0 to 1.0
    mood: string;
    segments: Array<{
      start: number;
      end: number;
      description: string;
    }>;
  };
  visualStyle: VideoGenerationRequest['style'];
  syncToBeats?: boolean;
  generateVisualPrompts?: boolean;
}

export interface FramePackGenerationResult {
  videoPath: string;
  metadata: {
    generatedFrames: number;
    actualDuration: number;
    resolution: { width: number; height: number };
    frameRate: number;
    fileSize: number;
    generationTime: number;
    prompt: string;
    seed: number;
  };
  frameSequence?: string[]; // Paths to individual frames if requested
  previewImages?: string[]; // Key frames for preview
}

export interface BatchGenerationJob {
  id: string;
  requests: VideoGenerationRequest[];
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0.0 to 1.0
  results: FramePackGenerationResult[];
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export class FramePackIntegrationService {
  private config: Config;
  private framePackConfig: FramePackConfig;
  private framePackPath: string;
  private jobQueue: Map<string, BatchGenerationJob> = new Map();
  private isProcessing = false;

  constructor(config: Config, framePackConfig: FramePackConfig) {
    this.config = config;
    this.framePackConfig = framePackConfig;
    this.framePackPath = path.resolve(config.packageDirPath, 'FramePack');
    
    if (!fs.existsSync(this.framePackPath)) {
      throw new Error(`FramePack directory not found at ${this.framePackPath}`);
    }
  }

  /**
   * Generates video from text prompt using FramePack
   */
  async generateVideoFromPrompt(request: VideoGenerationRequest): Promise<FramePackGenerationResult> {
    const startTime = Date.now();
    const outputPath = path.join(this.config.tempDirPath, `framepack_video_${Date.now()}.mp4`);
    
    logger.debug({ request, outputPath }, "Starting FramePack video generation from prompt");

    try {
      // Prepare generation parameters
      const params = await this.prepareGenerationParams(request);
      
      // Create reference image if not provided
      let referenceImagePath = request.referenceImage;
      if (!referenceImagePath) {
        referenceImagePath = await this.generateReferenceImage(request.prompt);
      }

      // Generate video using FramePack Python script
      const result = await this.executeFramePackGeneration(
        request.prompt,
        referenceImagePath,
        outputPath,
        params
      );

      // Post-process if needed
      if (this.framePackConfig.qualityLevel === 'ultra') {
        await this.enhanceVideoQuality(outputPath);
      }

      const generationTime = Date.now() - startTime;
      const fileStats = await fs.stat(outputPath);

      const finalResult: FramePackGenerationResult = {
        videoPath: outputPath,
        metadata: {
          generatedFrames: Math.ceil(request.duration * this.framePackConfig.frameRate),
          actualDuration: request.duration,
          resolution: this.framePackConfig.outputResolution,
          frameRate: this.framePackConfig.frameRate,
          fileSize: fileStats.size,
          generationTime,
          prompt: request.prompt,
          seed: request.seed || this.generateRandomSeed(),
        },
      };

      logger.debug(
        { 
          prompt: request.prompt, 
          duration: request.duration,
          generationTime,
          fileSize: fileStats.size 
        },
        "FramePack video generation completed"
      );

      return finalResult;

    } catch (error) {
      logger.error({ request, error }, "Failed to generate video from prompt");
      throw new Error(`FramePack video generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates video synchronized to audio content
   */
  async generateVideoFromAudio(request: AudioToVideoRequest): Promise<FramePackGenerationResult> {
    const startTime = Date.now();
    
    logger.debug({ request }, "Starting audio-to-video generation");

    try {
      // Analyze audio if not provided
      let audioAnalysis = request.audioAnalysis;
      if (!audioAnalysis) {
        audioAnalysis = await this.analyzeAudioForVisuals(request.audioPath);
      }

      // Ensure audioAnalysis is defined
      if (!audioAnalysis) {
        throw new Error("Audio analysis failed or was not provided");
      }

      // Generate visual prompts based on audio segments
      const visualPrompts = request.generateVisualPrompts ?
        await this.generateVisualPromptsFromAudio(audioAnalysis) :
        [{ prompt: "Abstract visual interpretation of the audio", duration: audioAnalysis.segments[0]?.end || 5 }];

      // Generate video segments
      const videoSegments: FramePackGenerationResult[] = [];
      
      for (let i = 0; i < visualPrompts.length; i++) {
        const segment = visualPrompts[i];
        
        const segmentRequest: VideoGenerationRequest = {
          prompt: segment.prompt,
          duration: segment.duration,
          style: request.visualStyle,
          motionIntensity: this.calculateMotionIntensity(audioAnalysis!, i),
        };

        // Sync to beats if requested
        if (request.syncToBeats && audioAnalysis!.beats) {
          segmentRequest.guidanceScale = this.calculateBeatSyncGuidance(audioAnalysis!.beats, i);
        }

        const segmentResult = await this.generateVideoFromPrompt(segmentRequest);
        videoSegments.push(segmentResult);
      }

      // Merge video segments
      const finalVideoPath = await this.mergeVideoSegments(videoSegments);

      // Combine with original audio
      const finalResult = await this.combineVideoWithAudio(finalVideoPath, request.audioPath);

      const generationTime = Date.now() - startTime;

      logger.debug(
        { 
          audioPath: request.audioPath,
          segmentCount: videoSegments.length,
          generationTime
        },
        "Audio-to-video generation completed"
      );

      return {
        ...finalResult,
        metadata: {
          ...finalResult.metadata,
          generationTime,
        },
      };

    } catch (error) {
      logger.error({ request, error }, "Failed to generate video from audio");
      throw new Error(`Audio-to-video generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates dynamic background videos based on content themes
   */
  async generateThematicBackground(
    theme: string,
    duration: number,
    mood: 'subtle' | 'dynamic' | 'abstract' | 'realistic'
  ): Promise<FramePackGenerationResult> {
    logger.debug({ theme, duration, mood }, "Generating thematic background");

    const promptTemplates = {
      subtle: `Soft, gentle ${theme} background with minimal motion, peaceful atmosphere`,
      dynamic: `Dynamic ${theme} scene with flowing motion, energetic but not distracting`,
      abstract: `Abstract interpretation of ${theme}, artistic flowing shapes and colors`,
      realistic: `Realistic ${theme} environment with natural subtle movements`,
    };

    const request: VideoGenerationRequest = {
      prompt: promptTemplates[mood],
      duration,
      style: {
        mood: mood === 'dynamic' ? 'energetic' : 'calm',
        cinematography: mood === 'subtle' ? 'static' : 'smooth',
        colorGrading: 'natural',
        lighting: 'natural',
      },
      motionIntensity: mood === 'dynamic' ? 0.7 : 0.3,
    };

    return this.generateVideoFromPrompt(request);
  }

  /**
   * Batch processes multiple video generation requests
   */
  async batchGenerateVideos(requests: VideoGenerationRequest[]): Promise<string> {
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: BatchGenerationJob = {
      id: jobId,
      requests,
      status: 'queued',
      progress: 0,
      results: [],
      createdAt: new Date(),
    };

    this.jobQueue.set(jobId, job);
    
    logger.debug({ jobId, requestCount: requests.length }, "Created batch generation job");

    // Process queue if not already processing
    if (!this.isProcessing) {
      this.processBatchQueue();
    }

    return jobId;
  }

  /**
   * Gets the status of a batch job
   */
  getBatchJobStatus(jobId: string): BatchGenerationJob | null {
    return this.jobQueue.get(jobId) || null;
  }

  /**
   * Cancels a batch job
   */
  cancelBatchJob(jobId: string): boolean {
    const job = this.jobQueue.get(jobId);
    if (job && job.status === 'queued') {
      job.status = 'failed';
      job.error = 'Job cancelled by user';
      job.completedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Optimizes FramePack parameters based on system capabilities
   */
  async optimizeParameters(): Promise<void> {
    logger.debug("Optimizing FramePack parameters for system");

    try {
      // Check GPU memory
      const gpuInfo = await this.getGPUInfo();
      
      if (gpuInfo.memoryGB < 8) {
        this.framePackConfig.batchSize = Math.min(this.framePackConfig.batchSize, 1);
        this.framePackConfig.teaCacheEnabled = true;
        this.framePackConfig.memoryOptimization = true;
        logger.info("Applied memory optimization for low-memory GPU");
      }

      // Adjust quality based on available resources
      if (gpuInfo.memoryGB >= 16 && this.framePackConfig.qualityLevel === 'standard') {
        logger.info("System supports higher quality generation");
      }

    } catch (error) {
      logger.warn({ error }, "Failed to optimize parameters, using defaults");
    }
  }

  /**
   * Processes the batch generation queue
   */
  private async processBatchQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      for (const [jobId, job] of this.jobQueue.entries()) {
        if (job.status !== 'queued') continue;

        logger.debug({ jobId }, "Processing batch job");
        
        job.status = 'processing';
        job.startedAt = new Date();
        job.progress = 0;

        try {
          for (let i = 0; i < job.requests.length; i++) {
            const request = job.requests[i];
            const result = await this.generateVideoFromPrompt(request);
            job.results.push(result);
            job.progress = (i + 1) / job.requests.length;
          }

          job.status = 'completed';
          job.completedAt = new Date();
          job.progress = 1.0;

          logger.debug({ jobId, resultCount: job.results.length }, "Batch job completed");

        } catch (error) {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : 'Unknown error';
          job.completedAt = new Date();
          logger.error({ jobId, error }, "Batch job failed");
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Prepares generation parameters for FramePack
   */
  private async prepareGenerationParams(request: VideoGenerationRequest): Promise<any> {
    const params = {
      prompt: request.prompt,
      duration: request.duration,
      seed: request.seed || this.generateRandomSeed(),
      guidance_scale: request.guidanceScale || 7.5,
      motion_intensity: request.motionIntensity || 0.5,
      width: this.framePackConfig.outputResolution.width,
      height: this.framePackConfig.outputResolution.height,
      fps: this.framePackConfig.frameRate,
      quality: this.framePackConfig.qualityLevel,
      tea_cache: this.framePackConfig.teaCacheEnabled,
    };

    // Apply style modifiers to prompt
    if (request.style) {
      params.prompt = await this.enhancePromptWithStyle(request.prompt, request.style);
    }

    return params;
  }

  /**
   * Enhances prompt with style descriptors
   */
  private async enhancePromptWithStyle(
    basePrompt: string, 
    style: VideoGenerationRequest['style']
  ): Promise<string> {
    const styleModifiers: string[] = [];

    if (style?.mood) {
      const moodModifiers = {
        dramatic: 'cinematic lighting, high contrast, dramatic shadows',
        energetic: 'dynamic motion, vibrant colors, fast-paced',
        calm: 'serene atmosphere, gentle movements, soft lighting',
        mysterious: 'moody lighting, atmospheric, mysterious ambiance',
        playful: 'bright colors, cheerful atmosphere, lively motion',
      };
      styleModifiers.push(moodModifiers[style.mood]);
    }

    if (style?.cinematography) {
      const cinemModifiers = {
        static: 'steady camera, stable composition',
        dynamic: 'dynamic camera movement, flowing shots',
        smooth: 'smooth camera motion, elegant transitions',
        handheld: 'natural camera movement, organic feel',
      };
      styleModifiers.push(cinemModifiers[style.cinematography]);
    }

    if (style?.colorGrading) {
      const colorModifiers = {
        natural: 'natural colors, realistic color palette',
        warm: 'warm color grading, golden tones',
        cool: 'cool color grading, blue tones',
        high_contrast: 'high contrast, vivid colors',
        desaturated: 'muted colors, low saturation',
      };
      styleModifiers.push(colorModifiers[style.colorGrading]);
    }

    const enhancedPrompt = `${basePrompt}, ${styleModifiers.join(', ')}`;
    return enhancedPrompt;
  }

  /**
   * Executes FramePack generation via Python script
   */
  private async executeFramePackGeneration(
    prompt: string,
    referenceImage: string,
    outputPath: string,
    params: any
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const pythonPath = this.framePackConfig.pythonEnv || 'python';
      const scriptPath = path.join(this.framePackPath, 'demo_gradio.py');
      
      // Prepare arguments for the Python script
      const args = [
        scriptPath,
        '--prompt', prompt,
        '--image', referenceImage,
        '--output', outputPath,
        '--duration', params.duration.toString(),
        '--width', params.width.toString(),
        '--height', params.height.toString(),
        '--fps', params.fps.toString(),
        '--seed', params.seed.toString(),
        '--guidance-scale', params.guidance_scale.toString(),
      ];

      if (params.tea_cache) {
        args.push('--tea-cache');
      }

      const process = spawn(pythonPath, args, {
        cwd: this.framePackPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
        // Log progress if available
        const progressMatch = stdout.match(/Progress: (\d+)%/);
        if (progressMatch) {
          logger.debug(`FramePack generation progress: ${progressMatch[1]}%`);
        }
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          logger.debug("FramePack generation completed successfully");
          resolve();
        } else {
          const error = `FramePack process failed with code ${code}: ${stderr}`;
          logger.error(error);
          reject(new Error(error));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to start FramePack process: ${error.message}`));
      });
    });
  }

  /**
   * Analyzes audio content for visual generation
   */
  private async analyzeAudioForVisuals(audioPath: string): Promise<AudioToVideoRequest['audioAnalysis']> {
    // This would integrate with actual audio analysis libraries
    // For now, return mock data
    const mockAnalysis = {
      tempo: 120,
      beats: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
      energy: 0.7,
      mood: 'energetic',
      segments: [
        { start: 0, end: 5, description: 'Energetic introduction' },
      ],
    };

    logger.debug({ audioPath, mockAnalysis }, "Audio analysis completed (mock data)");
    return mockAnalysis;
  }

  /**
   * Generates visual prompts based on audio analysis
   */
  private async generateVisualPromptsFromAudio(
    analysis: NonNullable<AudioToVideoRequest['audioAnalysis']>
  ): Promise<Array<{ prompt: string; duration: number }>> {
    const prompts: Array<{ prompt: string; duration: number }> = [];

    for (const segment of analysis.segments) {
      const duration = segment.end - segment.start;
      let prompt = '';

      // Generate prompt based on segment description and mood
      if (analysis.mood === 'energetic') {
        prompt = `Dynamic abstract visuals with flowing energy, ${segment.description}, vibrant colors, smooth motion`;
      } else if (analysis.mood === 'calm') {
        prompt = `Peaceful flowing visuals, ${segment.description}, soft colors, gentle movement`;
      } else {
        prompt = `Abstract visual interpretation of ${segment.description}, synchronized motion`;
      }

      prompts.push({ prompt, duration });
    }

    return prompts;
  }

  /**
   * Calculates motion intensity based on audio energy
   */
  private calculateMotionIntensity(
    analysis: NonNullable<AudioToVideoRequest['audioAnalysis']>,
    segmentIndex: number
  ): number {
    const baseIntensity = analysis.energy || 0.5;
    const segment = analysis.segments[segmentIndex];
    
    // Adjust based on segment characteristics
    if (segment?.description.includes('introduction')) {
      return Math.min(1.0, baseIntensity * 1.2);
    }
    
    return baseIntensity;
  }

  /**
   * Calculates guidance scale for beat synchronization
   */
  private calculateBeatSyncGuidance(beats: number[], segmentIndex: number): number {
    // Higher guidance for segments with more beats (more structured)
    const avgBeatInterval = beats.length > 1 ? 
      (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 1;
    
    return avgBeatInterval < 0.5 ? 8.5 : 7.0; // Higher guidance for faster beats
  }

  /**
   * Merges multiple video segments into one
   */
  private async mergeVideoSegments(segments: FramePackGenerationResult[]): Promise<string> {
    const outputPath = path.join(this.config.tempDirPath, `merged_${Date.now()}.mp4`);
    
    // Create file list for FFmpeg
    const fileListPath = path.join(this.config.tempDirPath, `filelist_${Date.now()}.txt`);
    const fileList = segments.map(seg => `file '${seg.videoPath}'`).join('\n');
    await fs.writeFile(fileListPath, fileList);

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', fileListPath,
        '-c', 'copy',
        outputPath
      ]);

      ffmpeg.on('close', (code) => {
        fs.remove(fileListPath); // Clean up
        
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Video merging failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });
    });
  }

  /**
   * Combines generated video with original audio
   */
  private async combineVideoWithAudio(videoPath: string, audioPath: string): Promise<FramePackGenerationResult> {
    const outputPath = path.join(this.config.tempDirPath, `final_${Date.now()}.mp4`);

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-i', audioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        outputPath
      ]);

      ffmpeg.on('close', async (code) => {
        if (code === 0) {
          const stats = await fs.stat(outputPath);
          resolve({
            videoPath: outputPath,
            metadata: {
              generatedFrames: 0, // Will be updated by caller
              actualDuration: 0,   // Will be updated by caller
              resolution: this.framePackConfig.outputResolution,
              frameRate: this.framePackConfig.frameRate,
              fileSize: stats.size,
              generationTime: 0,   // Will be updated by caller
              prompt: 'Audio-synchronized video',
              seed: this.generateRandomSeed(),
            },
          });
        } else {
          reject(new Error(`Audio/video combination failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });
    });
  }

  /**
   * Generates a reference image from text prompt (placeholder)
   */
  private async generateReferenceImage(prompt: string): Promise<string> {
    // This would integrate with an image generation service
    // For now, create a placeholder
    const imagePath = path.join(this.config.tempDirPath, `ref_image_${Date.now()}.png`);
    
    // Create a simple placeholder image
    const placeholderContent = `Reference image for: ${prompt}`;
    await fs.writeFile(imagePath.replace('.png', '.txt'), placeholderContent);
    
    return imagePath;
  }

  /**
   * Enhances video quality using post-processing
   */
  private async enhanceVideoQuality(videoPath: string): Promise<void> {
    // Placeholder for video enhancement logic
    logger.debug({ videoPath }, "Enhancing video quality");
  }

  /**
   * Gets GPU information for optimization
   */
  private async getGPUInfo(): Promise<{ memoryGB: number }> {
    // Placeholder - would use nvidia-ml-py or similar
    return { memoryGB: 8 }; // Default assumption
  }

  /**
   * Generates a random seed for reproducible generation
   */
  private generateRandomSeed(): number {
    return Math.floor(Math.random() * 1000000);
  }

  /**
   * Cleans up temporary files
   */
  async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          logger.debug({ filePath }, "Cleaned up temporary FramePack file");
        }
      } catch (error) {
        logger.warn({ filePath, error }, "Failed to clean up temporary file");
      }
    }
  }
}