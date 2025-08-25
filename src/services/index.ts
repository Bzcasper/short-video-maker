// Enhanced Audio-to-Video Pipeline Services
export { AudioPipelineService } from './AudioPipelineService';
export type {
  AudioAnalysisResult,
  AudioMixingOptions,
  BeatSyncOptions,
  AudioProcessingResult,
} from './AudioPipelineService';

export { TitleSequenceService } from './TitleSequenceService';
export type {
  TitleTemplate,
  TitleStyle,
  AnimationEffect,
  BrandingConfig,
  TitleGenerationOptions,
  GeneratedTitle,
} from './TitleSequenceService';

export { EnhancedSubtitleService } from './EnhancedSubtitleService';
export type {
  SubtitleStyle,
  SubtitleAnimation,
  KaraokeSettings,
  AccessibilityOptions,
  SubtitleGenerationOptions,
  GeneratedSubtitles,
} from './EnhancedSubtitleService';

export { FramePackIntegrationService } from './FramePackIntegrationService';
export type {
  FramePackConfig,
  VideoGenerationRequest,
  AudioToVideoRequest,
  FramePackGenerationResult,
  BatchGenerationJob,
} from './FramePackIntegrationService';

export { EnhancedShortCreator } from './EnhancedShortCreator';
export type {
  EnhancedRenderConfig,
  EnhancedVideoMetadata,
} from './EnhancedShortCreator';

// Re-export enhanced types from shorts.ts for convenience
export type {
  EnhancedAudioConfig,
  TitleSequenceConfig,
  EnhancedSubtitleConfig,
  FramePackConfig as FramePackConfigType,
  AudioToVideoPipelineConfig,
  EnhancedScene,
  TitleAnimationType,
  TitlePosition,
  SubtitleStylePreset,
  AIVideoQuality,
} from '../types/shorts';