import z from "zod";
import { Platform } from "../services/ScriptTemplateEngine";

export enum MusicMoodEnum {
  sad = "sad",
  melancholic = "melancholic",
  happy = "happy",
  euphoric = "euphoric/high",
  excited = "excited",
  chill = "chill",
  uneasy = "uneasy",
  angry = "angry",
  dark = "dark",
  hopeful = "hopeful",
  contemplative = "contemplative",
  funny = "funny/quirky",
}

export enum CaptionPositionEnum {
  top = "top",
  center = "center",
  bottom = "bottom",
}

export type Scene = {
  captions: Caption[];
  video: string;
  audio: {
    url: string;
    duration: number;
  };
};

export const sceneInput = z.object({
  text: z.string().describe("Text to be spoken in the video"),
  searchTerms: z
    .array(z.string())
    .describe(
      "Search term for video, 1 word, and at least 2-3 search terms should be provided for each scene. Make sure to match the overall context with the word - regardless what the video search result would be.",
    ),
  useAIGeneration: z
    .boolean()
    .optional()
    .describe("Whether to use AI-generated video for this scene instead of stock video"),
  imagePrompt: z
    .string()
    .optional()
    .describe("Custom image prompt for AI generation (overrides default based on search terms)"),
  videoPrompt: z
    .string()
    .optional()
    .describe("Custom video prompt for AI generation describing motion and style"),
});
export type SceneInput = z.infer<typeof sceneInput>;

export enum VoiceEnum {
  af_heart = "af_heart",
  af_alloy = "af_alloy",
  af_aoede = "af_aoede",
  af_bella = "af_bella",
  af_jessica = "af_jessica",
  af_kore = "af_kore",
  af_nicole = "af_nicole",
  af_nova = "af_nova",
  af_river = "af_river",
  af_sarah = "af_sarah",
  af_sky = "af_sky",
  am_adam = "am_adam",
  am_echo = "am_echo",
  am_eric = "am_eric",
  am_fenrir = "am_fenrir",
  am_liam = "am_liam",
  am_michael = "am_michael",
  am_onyx = "am_onyx",
  am_puck = "am_puck",
  am_santa = "am_santa",
  bf_emma = "bf_emma",
  bf_isabella = "bf_isabella",
  bm_george = "bm_george",
  bm_lewis = "bm_lewis",
  bf_alice = "bf_alice",
  bf_lily = "bf_lily",
  bm_daniel = "bm_daniel",
  bm_fable = "bm_fable",
}

export enum OrientationEnum {
  landscape = "landscape",
  portrait = "portrait",
}

export enum MusicVolumeEnum {
  muted = "muted",
  low = "low",
  medium = "medium",
  high = "high",
}

export enum AIGenerationQualityEnum {
  fast = "fast",
  balanced = "balanced", 
  high = "high",
}

export enum AIImageStyleEnum {
  photographic = "photographic",
  digital_art = "digital-art",
  comic_book = "comic-book",
  fantasy_art = "fantasy-art",
  analog_film = "analog-film",
  neon_punk = "neon-punk",
  isometric = "isometric",
  low_poly = "low-poly",
  origami = "origami",
  line_art = "line-art",
  craft_clay = "craft-clay",
  cinematic = "cinematic",
  three_d_model = "3d-model",
  pixel_art = "pixel-art",
}

export const renderConfig = z.object({
  paddingBack: z
    .number()
    .optional()
    .describe(
      "For how long the video should be playing after the speech is done, in milliseconds. 1500 is a good value.",
    ),
  music: z
    .nativeEnum(MusicMoodEnum)
    .optional()
    .describe("Music tag to be used to find the right music for the video"),
  captionPosition: z
    .nativeEnum(CaptionPositionEnum)
    .optional()
    .describe("Position of the caption in the video"),
  captionBackgroundColor: z
    .string()
    .optional()
    .describe(
      "Background color of the caption, a valid css color, default is blue",
    ),
  voice: z
    .nativeEnum(VoiceEnum)
    .optional()
    .describe("Voice to be used for the speech, default is af_heart"),
  orientation: z
    .nativeEnum(OrientationEnum)
    .optional()
    .describe("Orientation of the video, default is portrait"),
  musicVolume: z
    .nativeEnum(MusicVolumeEnum)
    .optional()
    .describe("Volume of the music, default is high"),
  // AI Generation settings
  useHybridRendering: z
    .boolean()
    .optional()
    .describe("Enable hybrid rendering with AI-generated content"),
  aiGenerationRatio: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Percentage of scenes to use AI generation (0-1), default 0.3"),
  aiQuality: z
    .nativeEnum(AIGenerationQualityEnum)
    .optional()
    .describe("Quality setting for AI generation, default balanced"),
  aiImageStyle: z
    .nativeEnum(AIImageStyleEnum)
    .optional()
    .describe("Image style for AI generation, default photographic"),
  fallbackToTraditional: z
    .boolean()
    .optional()
    .describe("Fallback to traditional stock video if AI generation fails, default true"),
  enhanceTraditionalVideo: z
    .boolean()
    .optional()
    .describe("Apply AI enhancement to traditional stock videos, default false"),
});
export type RenderConfig = z.infer<typeof renderConfig>;

export type Voices = `${VoiceEnum}`;

export type Video = {
  id: string;
  url: string;
  width: number;
  height: number;
};
export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
};

export type CaptionLine = {
  texts: Caption[];
};
export type CaptionPage = {
  startMs: number;
  endMs: number;
  lines: CaptionLine[];
};

export const createShortInput = z.object({
  scenes: z.array(sceneInput).describe("Each scene to be created"),
  config: renderConfig.describe("Configuration for rendering the video"),
});
export type CreateShortInput = z.infer<typeof createShortInput>;

// Script generation types
export const scriptGenerationInput = z.object({
  templateId: z.string().describe("ID of the script template to use"),
  variables: z.record(z.any()).describe("Variables to fill in the template"),
  platform: z.nativeEnum(Platform).optional().describe("Target platform for optimization"),
  targetLength: z.number().optional().describe("Target length in seconds"),
  customization: z.object({
    tone: z.enum(["casual", "professional", "energetic", "educational", "humorous"]).optional(),
    audience: z.enum(["general", "teens", "adults", "professionals"]).optional(),
    includeCallToAction: z.boolean().optional(),
    callToActionText: z.string().optional(),
  }).optional()
});
export type ScriptGenerationInput = z.infer<typeof scriptGenerationInput>;

export const promptToScenesInput = z.object({
  prompt: z.string().describe("Natural language prompt describing the desired video content"),
  contentType: z.enum(["educational", "entertainment", "marketing", "news_trends"]).optional(),
  platform: z.enum(["tiktok", "youtube_shorts", "instagram_reels"]).optional(),
  targetDuration: z.number().optional().describe("Target duration in seconds"),
  config: renderConfig.optional().describe("Optional rendering configuration")
});
export type PromptToScenesInput = z.infer<typeof promptToScenesInput>;

export type VideoStatus =
  | "queued"
  | "processing"
  | "generating_audio"
  | "downloading_video"
  | "creating_captions"
  | "generating_ai_images"
  | "generating_ai_videos"
  | "enhancing_videos"
  | "rendering"
  | "ready"
  | "failed";

export interface VideoProgress {
  status: VideoStatus;
  progress: number; // 0-100
  currentStep?: string;
  estimatedTimeRemaining?: number; // seconds
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export interface AIGenerationMetadata {
  aiScenesGenerated: number;
  traditionalScenesUsed: number;
  enhancedScenesCount: number;
  totalProcessingTime: number;
  averageProcessingTimePerScene: number;
  aiQualityUsed?: AIGenerationQualityEnum;
  fallbacksTriggered: number;
}

export interface VideoMetadata {
  id: string;
  status: VideoStatus;
  progress: VideoProgress;
  scenesCount: number;
  totalDuration: number;
  createdAt: string;
  completedAt?: string;
  aiGeneration?: AIGenerationMetadata;
  hybridRenderingUsed: boolean;
  scenes?: SceneInput[];
  config?: RenderConfig;
}

export type Music = {
  file: string;
  start: number;
  end: number;
  mood: string;
};
export type MusicForVideo = Music & {
  url: string;
};

export type MusicTag = `${MusicMoodEnum}`;

export type kokoroModelPrecision = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export type whisperModels =
  | "tiny"
  | "tiny.en"
  | "base"
  | "base.en"
  | "small"
  | "small.en"
  | "medium"
  | "medium.en"
  | "large-v1"
  | "large-v2"
  | "large-v3"
  | "large-v3-turbo";

// Enhanced CreateShortInput with caching and prompt template support
export const createShortInputWithTemplate = z.object({
  templateId: z.string().optional().describe("ID of the prompt template to use"),
  templateVariables: z.record(z.any()).optional().describe("Variables for template substitution"),
  scenes: z.array(sceneInput).describe("Each scene to be created"),
  config: renderConfig.describe("Configuration for rendering the video"),
  cacheOptions: z.object({
    useCache: z.boolean().optional().default(true),
    cacheResults: z.boolean().optional().default(true),
    cacheTtl: z.number().optional().describe("Cache time-to-live in seconds")
  }).optional(),
  qualityOptions: z.object({
    enableValidation: z.boolean().optional().default(true),
    qualityThreshold: z.number().min(1).max(5).optional().default(3),
    generateVariations: z.boolean().optional().default(false),
    variationCount: z.number().min(1).max(5).optional().default(1)
  }).optional()
});
export type CreateShortInputWithTemplate = z.infer<typeof createShortInputWithTemplate>;

// Enhanced Audio Pipeline Types
export interface EnhancedAudioConfig {
  enableBeatSync: boolean;
  enableVoiceEnhancement: boolean;
  enableAdvancedMixing: boolean;
  duckingSettings?: {
    threshold: number; // in dB
    ratio: number;
    attack: number; // in ms
    release: number; // in ms
  };
  spatialAudio?: boolean;
  noiseReduction?: boolean;
}

// Title Sequence Types
export enum TitleAnimationType {
  fadeIn = "fadeIn",
  fadeOut = "fadeOut",
  slideIn = "slideIn", 
  slideOut = "slideOut",
  scale = "scale",
  rotate = "rotate",
  bounce = "bounce",
  typewriter = "typewriter",
  glitch = "glitch",
  neon = "neon",
}

export enum TitlePosition {
  intro = "intro",
  outro = "outro",
  middle = "middle",
}

export interface TitleSequenceConfig {
  enableIntroTitle: boolean;
  enableOutroTitle: boolean;
  enableSectionDividers: boolean;
  customTitle?: string;
  customSubtitle?: string;
  animationType: TitleAnimationType;
  position: TitlePosition;
  duration: number; // in seconds
  branding?: {
    logoPath?: string;
    brandColors: string[];
    watermarkText?: string;
  };
}

// Enhanced Subtitle Types  
export enum SubtitleStylePreset {
  standard = "standard",
  cinematic = "cinematic",
  modern = "modern",
  accessible = "accessible",
  karaoke = "karaoke",
}

export interface EnhancedSubtitleConfig {
  stylePreset: SubtitleStylePreset;
  enableKaraoke: boolean;
  enableAnimations: boolean;
  multiLanguageSupport: boolean;
  accessibilityMode: boolean;
  customStyling?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
    outlineColor?: string;
    shadowColor?: string;
  };
}

// FramePack Integration Types
export enum AIVideoQuality {
  draft = "draft",
  standard = "standard", 
  high = "high",
  ultra = "ultra",
}

export interface FramePackConfig {
  enableAIGeneration: boolean;
  quality: AIVideoQuality;
  enableTeaCache: boolean; // Speed optimization
  enableGPUAcceleration: boolean;
  batchSize: number;
  maxDuration: number; // in seconds
  stylePreferences?: {
    mood: 'dramatic' | 'energetic' | 'calm' | 'mysterious' | 'playful';
    cinematography: 'static' | 'dynamic' | 'smooth' | 'handheld';
    colorGrading: 'natural' | 'warm' | 'cool' | 'high_contrast' | 'desaturated';
  };
}

// Enhanced Video Generation Pipeline Types
export interface AudioToVideoPipelineConfig {
  audioEnhancement: EnhancedAudioConfig;
  titleSequences: TitleSequenceConfig;
  subtitleStyling: EnhancedSubtitleConfig;
  aiVideoGeneration: FramePackConfig;
  enableHybridMode: boolean; // Mix AI and stock footage
  outputOptimization: {
    targetFileSize?: number; // in MB
    compressionLevel: 'low' | 'medium' | 'high';
    enableFastStart: boolean; // For web playback
  };
}

// Enhanced Scene Type with AI capabilities
export interface EnhancedScene extends Scene {
  aiGenerated?: boolean;
  generationMetadata?: {
    prompt: string;
    seed: number;
    processingTime: number;
    quality: AIVideoQuality;
  };
  titleSequence?: {
    intro?: string;
    outro?: string;
    divider?: string;
  };
  enhancedSubtitles?: {
    styleUsed: SubtitleStylePreset;
    animationsApplied: string[];
    karaokeEnabled: boolean;
  };
}
