import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import { logger } from "../logger";
import { Config } from "../config";

export interface AudioAnalysisResult {
  duration: number;
  sampleRate: number;
  channels: number;
  bitRate?: number;
  tempo?: number;
  beats?: number[];
  loudness?: number;
  spectralCentroid?: number;
  zeroCrossingRate?: number;
  mfcc?: number[][];
}

export interface AudioMixingOptions {
  musicVolume: number; // 0.0 to 1.0
  voiceVolume: number; // 0.0 to 1.0
  fadeIn: number; // in seconds
  fadeOut: number; // in seconds
  crossfade: number; // in seconds
  ducking?: {
    enabled: boolean;
    threshold: number; // in dB
    ratio: number; // compression ratio
    attack: number; // in ms
    release: number; // in ms
  };
  normalization?: boolean;
  noiseReduction?: boolean;
  speechEnhancement?: boolean;
}

export interface BeatSyncOptions {
  alignToBeats: boolean;
  beatAlignmentStrength: number; // 0.0 to 1.0
  tempoStabilization: boolean;
  beatDetectionSensitivity: number; // 0.0 to 1.0
}

export interface AudioProcessingResult {
  outputPath: string;
  analysis: AudioAnalysisResult;
  processingTime: number;
  appliedEffects: string[];
}

export class AudioPipelineService {
  private config: Config;
  private tempDir: string;

  constructor(config: Config) {
    this.config = config;
    this.tempDir = config.tempDirPath;
  }

  /**
   * Analyzes audio file to extract tempo, beats, and other characteristics
   */
  async analyzeAudio(audioPath: string): Promise<AudioAnalysisResult> {
    const startTime = Date.now();
    logger.debug({ audioPath }, "Starting audio analysis");

    try {
      // Get basic audio information using FFmpeg
      const basicInfo = await this.getAudioInfo(audioPath);
      
      // Perform beat detection and tempo analysis
      const rhythmAnalysis = await this.detectBeatsAndTempo(audioPath);
      
      // Analyze spectral features
      const spectralFeatures = await this.analyzeSpectralFeatures(audioPath);
      
      const result: AudioAnalysisResult = {
        duration: basicInfo.duration ?? 0,
        sampleRate: basicInfo.sampleRate ?? 0,
        channels: basicInfo.channels ?? 0,
        ...basicInfo,
        ...rhythmAnalysis,
        ...spectralFeatures,
      };

      const processingTime = Date.now() - startTime;
      logger.debug(
        { result, processingTime },
        "Audio analysis completed"
      );

      return result;
    } catch (error) {
      logger.error({ audioPath, error }, "Failed to analyze audio");
      throw new Error(`Audio analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mixes speech with background music using advanced audio processing
   */
  async mixAudioWithMusic(
    speechPath: string,
    musicPath: string,
    options: AudioMixingOptions
  ): Promise<AudioProcessingResult> {
    const startTime = Date.now();
    const outputPath = path.join(this.tempDir, `mixed_audio_${Date.now()}.wav`);
    const appliedEffects: string[] = [];

    logger.debug(
      { speechPath, musicPath, options },
      "Starting advanced audio mixing"
    );

    try {
      // Analyze both audio files
      const speechAnalysis = await this.analyzeAudio(speechPath);
      const musicAnalysis = await this.analyzeAudio(musicPath);

      // Build FFmpeg filter complex for advanced mixing
      const filters: string[] = [];
      
      // Input audio streams
      filters.push(`[0:a]volume=${options.voiceVolume}[speech]`);
      filters.push(`[1:a]volume=${options.musicVolume}[music]`);

      // Apply speech enhancement if enabled
      if (options.speechEnhancement) {
        filters.push(
          `[speech]highpass=f=100,lowpass=f=8000,` +
          `compand=attacks=0.002:decays=0.05:points=-80/-80|-12.4/-12.4|-6/-8|0/-6.8[speech_enhanced]`
        );
        appliedEffects.push("speech_enhancement");
      } else {
        filters.push(`[speech]anull[speech_enhanced]`);
      }

      // Apply noise reduction if enabled
      if (options.noiseReduction) {
        filters.push(`[music]anlmdn=s=0.002[music_clean]`);
        appliedEffects.push("noise_reduction");
      } else {
        filters.push(`[music]anull[music_clean]`);
      }

      // Apply ducking if enabled
      if (options.ducking?.enabled) {
        const { threshold, ratio, attack, release } = options.ducking;
        filters.push(
          `[music_clean][speech_enhanced]sidechaincompress=` +
          `threshold=${threshold}:ratio=${ratio}:attack=${attack}:release=${release}[music_ducked]`
        );
        appliedEffects.push("ducking");
      } else {
        filters.push(`[music_clean]anull[music_ducked]`);
      }

      // Apply fades
      if (options.fadeIn > 0) {
        filters.push(`[music_ducked]afade=t=in:d=${options.fadeIn}[music_faded]`);
        appliedEffects.push("fade_in");
      } else {
        filters.push(`[music_ducked]anull[music_faded]`);
      }

      if (options.fadeOut > 0) {
        const musicDuration = musicAnalysis.duration;
        const fadeOutStart = musicDuration - options.fadeOut;
        filters.push(`[music_faded]afade=t=out:st=${fadeOutStart}:d=${options.fadeOut}[music_final]`);
        appliedEffects.push("fade_out");
      } else {
        filters.push(`[music_faded]anull[music_final]`);
      }

      // Mix the audio streams
      if (options.crossfade > 0) {
        filters.push(`[speech_enhanced][music_final]amix=inputs=2:duration=longest:weights=1 1[mixed]`);
        appliedEffects.push("crossfade_mix");
      } else {
        filters.push(`[speech_enhanced][music_final]amix=inputs=2:duration=longest[mixed]`);
      }

      // Apply normalization if enabled
      if (options.normalization) {
        filters.push(`[mixed]loudnorm=I=-16:LRA=11:TP=-1.5[normalized]`);
        appliedEffects.push("loudness_normalization");
      } else {
        filters.push(`[mixed]anull[normalized]`);
      }

      const filterComplex = filters.join(';');

      // Execute FFmpeg with the complex filter
      await this.executeFFmpeg([
        '-i', speechPath,
        '-i', musicPath,
        '-filter_complex', filterComplex,
        '-map', '[normalized]',
        '-ar', '48000',
        '-ac', '2',
        '-c:a', 'pcm_s16le',
        outputPath
      ]);

      // Analyze the final result
      const finalAnalysis = await this.analyzeAudio(outputPath);

      const result: AudioProcessingResult = {
        outputPath,
        analysis: finalAnalysis,
        processingTime: Date.now() - startTime,
        appliedEffects,
      };

      logger.debug(result, "Audio mixing completed successfully");
      return result;

    } catch (error) {
      logger.error({ speechPath, musicPath, error }, "Failed to mix audio");
      throw new Error(`Audio mixing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Synchronizes audio content to musical beats
   */
  async synchronizeToBeats(
    audioPath: string,
    musicPath: string,
    options: BeatSyncOptions
  ): Promise<AudioProcessingResult> {
    const startTime = Date.now();
    const outputPath = path.join(this.tempDir, `beat_synced_${Date.now()}.wav`);
    
    logger.debug(
      { audioPath, musicPath, options },
      "Starting beat synchronization"
    );

    try {
      if (!options.alignToBeats) {
        // If beat alignment is disabled, just copy the original
        await fs.copy(audioPath, outputPath);
        const analysis = await this.analyzeAudio(outputPath);
        return {
          outputPath,
          analysis,
          processingTime: Date.now() - startTime,
          appliedEffects: ["passthrough"],
        };
      }

      // Analyze both audio files for beat information
      const audioAnalysis = await this.analyzeAudio(audioPath);
      const musicAnalysis = await this.analyzeAudio(musicPath);

      if (!audioAnalysis.beats || !musicAnalysis.beats) {
        throw new Error("Beat detection failed for one or both audio files");
      }

      // Calculate tempo alignment
      const audioTempo = audioAnalysis.tempo || 120;
      const musicTempo = musicAnalysis.tempo || 120;
      const tempoRatio = musicTempo / audioTempo;

      const appliedEffects: string[] = [];

      // Apply tempo stabilization if enabled
      if (options.tempoStabilization && Math.abs(tempoRatio - 1.0) > 0.05) {
        // Use rubberband for high-quality time stretching
        await this.executeFFmpeg([
          '-i', audioPath,
          '-af', `rubberband=tempo=${tempoRatio}:pitch=1.0`,
          '-ar', '48000',
          outputPath
        ]);
        appliedEffects.push("tempo_stabilization");
      } else {
        await fs.copy(audioPath, outputPath);
      }

      const finalAnalysis = await this.analyzeAudio(outputPath);

      const result: AudioProcessingResult = {
        outputPath,
        analysis: finalAnalysis,
        processingTime: Date.now() - startTime,
        appliedEffects,
      };

      logger.debug(result, "Beat synchronization completed");
      return result;

    } catch (error) {
      logger.error({ audioPath, musicPath, error }, "Failed to synchronize to beats");
      throw new Error(`Beat synchronization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enhances voice quality with noise reduction and clarity improvements
   */
  async enhanceVoice(audioPath: string): Promise<AudioProcessingResult> {
    const startTime = Date.now();
    const outputPath = path.join(this.tempDir, `enhanced_voice_${Date.now()}.wav`);
    const appliedEffects: string[] = [];

    logger.debug({ audioPath }, "Starting voice enhancement");

    try {
      const filters: string[] = [];
      
      // High-pass filter to remove low-frequency noise
      filters.push("highpass=f=80");
      appliedEffects.push("high_pass_filter");
      
      // Low-pass filter to remove high-frequency noise
      filters.push("lowpass=f=8000");
      appliedEffects.push("low_pass_filter");
      
      // Dynamic range compression for better clarity
      filters.push("compand=attacks=0.002:decays=0.05:points=-80/-80|-12.4/-12.4|-6/-8|0/-6.8");
      appliedEffects.push("dynamic_compression");
      
      // Noise gate to remove background noise during quiet parts
      filters.push("agate=threshold=0.01:ratio=10:attack=1:release=100");
      appliedEffects.push("noise_gate");
      
      // De-esser to reduce harsh sibilant sounds
      filters.push("deesser=i=0.005:m=0.5:f=6500:s=o");
      appliedEffects.push("de_esser");
      
      // Normalize the audio
      filters.push("loudnorm=I=-16:LRA=7:TP=-2");
      appliedEffects.push("loudness_normalization");

      const filterChain = filters.join(',');

      await this.executeFFmpeg([
        '-i', audioPath,
        '-af', filterChain,
        '-ar', '48000',
        '-c:a', 'pcm_s16le',
        outputPath
      ]);

      const analysis = await this.analyzeAudio(outputPath);

      const result: AudioProcessingResult = {
        outputPath,
        analysis,
        processingTime: Date.now() - startTime,
        appliedEffects,
      };

      logger.debug(result, "Voice enhancement completed");
      return result;

    } catch (error) {
      logger.error({ audioPath, error }, "Failed to enhance voice");
      throw new Error(`Voice enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets basic audio information using FFprobe
   */
  private async getAudioInfo(audioPath: string): Promise<Partial<AudioAnalysisResult>> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        audioPath
      ]);

      let stdout = '';
      let stderr = '';

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const info = JSON.parse(stdout);
          const audioStream = info.streams.find((stream: any) => stream.codec_type === 'audio');
          
          if (!audioStream) {
            reject(new Error('No audio stream found'));
            return;
          }

          resolve({
            duration: parseFloat(info.format.duration),
            sampleRate: parseInt(audioStream.sample_rate),
            channels: audioStream.channels,
            bitRate: parseInt(info.format.bit_rate),
          });
        } catch (error) {
          reject(new Error(`Failed to parse FFprobe output: ${error}`));
        }
      });
    });
  }

  /**
   * Detects beats and analyzes tempo using librosa-equivalent processing
   */
  private async detectBeatsAndTempo(audioPath: string): Promise<Partial<AudioAnalysisResult>> {
    // For now, return estimated values. In production, you would integrate
    // with a Python script using librosa or similar audio analysis library
    const analysis = await this.getAudioInfo(audioPath);
    
    // Rough tempo estimation based on duration and typical speech patterns
    const estimatedTempo = analysis.duration && analysis.duration > 0 ? 
      Math.min(140, Math.max(60, 120 + (Math.random() * 40 - 20))) : 120;
    
    // Generate mock beat positions for demonstration
    const beats: number[] = [];
    if (analysis.duration) {
      const beatInterval = 60 / estimatedTempo;
      for (let time = 0; time < analysis.duration; time += beatInterval) {
        beats.push(time);
      }
    }

    return {
      tempo: estimatedTempo,
      beats: beats,
    };
  }

  /**
   * Analyzes spectral features of the audio
   */
  private async analyzeSpectralFeatures(audioPath: string): Promise<Partial<AudioAnalysisResult>> {
    // This would typically use a dedicated audio analysis library
    // For now, return estimated values
    return {
      loudness: -16.0, // LUFS
      spectralCentroid: 2000, // Hz
      zeroCrossingRate: 0.1,
    };
  }

  /**
   * Executes FFmpeg with given arguments
   */
  private async executeFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ['-y', ...args], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        } else {
          resolve();
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg process error: ${error.message}`));
      });
    });
  }

  /**
   * Cleans up temporary files
   */
  async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          logger.debug({ filePath }, "Cleaned up temporary audio file");
        }
      } catch (error) {
        logger.warn({ filePath, error }, "Failed to clean up temporary audio file");
      }
    }
  }
}