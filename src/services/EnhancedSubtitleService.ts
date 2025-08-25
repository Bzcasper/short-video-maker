import fs from "fs-extra";
import path from "path";
import { logger } from "../logger";
import { Config } from "../config";
import type { Caption, CaptionPage, CaptionLine } from "../types/shorts";

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  backgroundColor?: string;
  borderRadius?: number;
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  margin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  outline?: {
    color: string;
    width: number;
  };
  shadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
    spread?: number;
  };
  gradient?: {
    type: 'linear' | 'radial';
    angle?: number;
    colors: Array<{ color: string; position: number }>;
  };
  opacity: number;
}

export interface SubtitleAnimation {
  type: 'highlight' | 'karaoke' | 'typewriter' | 'fadeIn' | 'slideIn' | 'scale' | 'bounce' | 'glow' | 'wave';
  duration?: number; // in milliseconds
  delay?: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier';
  intensity?: number; // 0.0 to 1.0
  direction?: 'left' | 'right' | 'up' | 'down' | 'center';
  repeat?: boolean;
  reverseOnEnd?: boolean;
}

export interface KaraokeSettings {
  highlightStyle: SubtitleStyle;
  transitionDuration: number; // in milliseconds
  previewDuration: number; // show upcoming words briefly
  syncTolerance: number; // timing tolerance in milliseconds
  wordByWord: boolean; // true for word-level, false for phrase-level
  smoothTransitions: boolean;
}

export interface AccessibilityOptions {
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  colorBlindFriendly: boolean;
  screenReaderCompatible: boolean;
  closedCaptionFormat: boolean;
  languageCode?: string;
  rtlSupport: boolean; // Right-to-left languages
}

export interface MultiLanguageSubtitle {
  language: string;
  captions: Caption[];
  style?: SubtitleStyle;
  position?: 'top' | 'center' | 'bottom';
}

export interface SubtitleTrack {
  id: string;
  language: string;
  label: string; // Display name for the language
  captions: Caption[];
  style: SubtitleStyle;
  animations: SubtitleAnimation[];
  isDefault: boolean;
}

export interface SubtitleGenerationOptions {
  captions: Caption[];
  style: SubtitleStyle;
  animations?: SubtitleAnimation[];
  karaoke?: KaraokeSettings;
  accessibility?: AccessibilityOptions;
  position: 'top' | 'center' | 'bottom';
  maxLineLength: number;
  maxLinesPerPage: number;
  multiLanguage?: MultiLanguageSubtitle[];
  customCSS?: string;
  responsiveDesign?: boolean;
}

export interface GeneratedSubtitles {
  id: string;
  tracks: SubtitleTrack[];
  htmlContent: string;
  cssStyles: string;
  animationCode: string;
  vttContent: string; // WebVTT format for web players
  srtContent: string; // SRT format for compatibility
  assContent?: string; // Advanced SubStation Alpha for complex styling
  metadata: {
    totalDuration: number;
    wordCount: number;
    averageWPM: number;
    generatedAt: Date;
    accessibility: AccessibilityOptions;
  };
}

export class EnhancedSubtitleService {
  private config: Config;
  private presetStyles: Map<string, SubtitleStyle> = new Map();
  private presetAnimations: Map<string, SubtitleAnimation[]> = new Map();

  constructor(config: Config) {
    this.config = config;
    this.initializePresets();
  }

  /**
   * Generates enhanced subtitles with styling and animations
   */
  async generateEnhancedSubtitles(options: SubtitleGenerationOptions): Promise<GeneratedSubtitles> {
    const startTime = Date.now();
    const subtitleId = `subtitle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.debug({ subtitleId, options }, "Starting enhanced subtitle generation");

    try {
      // Create caption pages with enhanced layout
      const pages = await this.createEnhancedCaptionPages(
        options.captions,
        options.maxLineLength,
        options.maxLinesPerPage
      );

      // Generate subtitle tracks
      const tracks = await this.generateSubtitleTracks(options, subtitleId);

      // Generate HTML with advanced styling
      const htmlContent = await this.generateSubtitleHTML(pages, options);

      // Generate CSS with animations
      const cssStyles = await this.generateSubtitleCSS(options);

      // Generate animation JavaScript
      const animationCode = await this.generateSubtitleAnimations(options);

      // Generate standard subtitle formats
      const vttContent = await this.generateWebVTT(options.captions, options.style);
      const srtContent = await this.generateSRT(options.captions);
      const assContent = await this.generateASS(options.captions, options.style);

      // Calculate metadata
      const metadata = this.calculateSubtitleMetadata(options.captions, options.accessibility);

      const result: GeneratedSubtitles = {
        id: subtitleId,
        tracks,
        htmlContent,
        cssStyles,
        animationCode,
        vttContent,
        srtContent,
        assContent,
        metadata,
      };

      const processingTime = Date.now() - startTime;
      logger.debug(
        { subtitleId, processingTime, trackCount: tracks.length },
        "Enhanced subtitle generation completed"
      );

      return result;

    } catch (error) {
      logger.error({ subtitleId, error }, "Failed to generate enhanced subtitles");
      throw new Error(`Enhanced subtitle generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates karaoke-style subtitles with word-level timing
   */
  async generateKaraokeSubtitles(
    captions: Caption[],
    karaokeSettings: KaraokeSettings,
    baseStyle: SubtitleStyle
  ): Promise<GeneratedSubtitles> {
    const options: SubtitleGenerationOptions = {
      captions,
      style: baseStyle,
      karaoke: karaokeSettings,
      position: 'bottom',
      maxLineLength: 40,
      maxLinesPerPage: 2,
      animations: [{
        type: 'karaoke',
        duration: karaokeSettings.transitionDuration,
        easing: 'ease-in-out',
        intensity: 1.0,
      }],
    };

    return this.generateEnhancedSubtitles(options);
  }

  /**
   * Generates multi-language subtitle tracks
   */
  async generateMultiLanguageSubtitles(
    primaryLanguage: MultiLanguageSubtitle,
    additionalLanguages: MultiLanguageSubtitle[],
    baseStyle: SubtitleStyle
  ): Promise<GeneratedSubtitles> {
    const allLanguages = [primaryLanguage, ...additionalLanguages];
    
    const options: SubtitleGenerationOptions = {
      captions: primaryLanguage.captions,
      style: primaryLanguage.style || baseStyle,
      position: primaryLanguage.position || 'bottom',
      maxLineLength: 50,
      maxLinesPerPage: 2,
      multiLanguage: allLanguages,
      accessibility: {
        highContrast: false,
        largeText: false,
        reducedMotion: false,
        colorBlindFriendly: true,
        screenReaderCompatible: true,
        closedCaptionFormat: true,
        rtlSupport: true,
      },
    };

    return this.generateEnhancedSubtitles(options);
  }

  /**
   * Creates accessible subtitles compliant with WCAG guidelines
   */
  async generateAccessibleSubtitles(
    captions: Caption[],
    accessibilityOptions: AccessibilityOptions
  ): Promise<GeneratedSubtitles> {
    // Create high-contrast, accessible style
    const accessibleStyle: SubtitleStyle = {
      fontFamily: 'Arial, sans-serif',
      fontSize: accessibilityOptions.largeText ? 24 : 18,
      fontWeight: 'bold',
      color: accessibilityOptions.highContrast ? '#ffffff' : '#f0f0f0',
      backgroundColor: accessibilityOptions.highContrast ? '#000000' : 'rgba(0,0,0,0.8)',
      borderRadius: 4,
      padding: { top: 8, right: 12, bottom: 8, left: 12 },
      outline: {
        color: accessibilityOptions.highContrast ? '#ffffff' : '#333333',
        width: accessibilityOptions.highContrast ? 2 : 1,
      },
      opacity: 1.0,
    };

    const options: SubtitleGenerationOptions = {
      captions,
      style: accessibleStyle,
      position: 'bottom',
      maxLineLength: 42,
      maxLinesPerPage: 2,
      accessibility: accessibilityOptions,
      animations: accessibilityOptions.reducedMotion ? [] : [{
        type: 'fadeIn',
        duration: 300,
        easing: 'ease-out',
      }],
    };

    return this.generateEnhancedSubtitles(options);
  }

  /**
   * Applies real-time subtitle styling based on content analysis
   */
  async applyContextualStyling(
    captions: Caption[],
    contentAnalysis: {
      sentiment: 'positive' | 'negative' | 'neutral';
      emotion: string;
      intensity: number; // 0.0 to 1.0
      speakers?: string[];
    }
  ): Promise<SubtitleStyle> {
    let baseStyle = this.presetStyles.get('default') || this.createDefaultStyle();

    // Adapt styling based on sentiment and emotion
    switch (contentAnalysis.sentiment) {
      case 'positive':
        baseStyle.color = '#4CAF50'; // Green tones
        if (contentAnalysis.emotion === 'excitement') {
          baseStyle.fontWeight = 'bold';
          baseStyle.fontSize = Math.floor(baseStyle.fontSize * 1.2);
        }
        break;
      
      case 'negative':
        baseStyle.color = '#F44336'; // Red tones
        if (contentAnalysis.emotion === 'anger') {
          baseStyle.outline = { color: '#ffffff', width: 2 };
        }
        break;
      
      case 'neutral':
        baseStyle.color = '#ffffff';
        break;
    }

    // Adjust intensity-based properties
    baseStyle.opacity = Math.max(0.7, 1.0 - (contentAnalysis.intensity * 0.3));

    // Multi-speaker styling
    if (contentAnalysis.speakers && contentAnalysis.speakers.length > 1) {
      baseStyle.outline = { color: '#ffeb3b', width: 1 };
    }

    return baseStyle;
  }

  /**
   * Exports subtitles to various formats
   */
  async exportSubtitles(
    subtitles: GeneratedSubtitles,
    formats: ('vtt' | 'srt' | 'ass' | 'json')[]
  ): Promise<{ [format: string]: string }> {
    const exports: { [format: string]: string } = {};

    for (const format of formats) {
      switch (format) {
        case 'vtt':
          exports.vtt = subtitles.vttContent;
          break;
        
        case 'srt':
          exports.srt = subtitles.srtContent;
          break;
        
        case 'ass':
          exports.ass = subtitles.assContent || '';
          break;
        
        case 'json':
          exports.json = JSON.stringify({
            tracks: subtitles.tracks,
            metadata: subtitles.metadata,
          }, null, 2);
          break;
      }
    }

    return exports;
  }

  /**
   * Initializes preset styles and animations
   */
  private initializePresets(): void {
    // Default style
    this.presetStyles.set('default', {
      fontFamily: 'Arial, sans-serif',
      fontSize: 20,
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderRadius: 4,
      padding: { top: 6, right: 10, bottom: 6, left: 10 },
      outline: { color: '#000000', width: 1 },
      opacity: 1.0,
    });

    // Cinematic style
    this.presetStyles.set('cinematic', {
      fontFamily: 'Times New Roman, serif',
      fontSize: 22,
      fontWeight: 'normal',
      color: '#f5f5f5',
      shadow: {
        color: 'rgba(0,0,0,0.8)',
        offsetX: 2,
        offsetY: 2,
        blur: 4,
      },
      opacity: 0.95,
    });

    // Modern style
    this.presetStyles.set('modern', {
      fontFamily: 'Helvetica Neue, sans-serif',
      fontSize: 18,
      fontWeight: '600',
      color: '#ffffff',
      backgroundColor: 'rgba(25,25,25,0.9)',
      borderRadius: 8,
      padding: { top: 8, right: 12, bottom: 8, left: 12 },
      opacity: 1.0,
    });

    // Preset animations
    this.presetAnimations.set('subtle', [{
      type: 'fadeIn',
      duration: 200,
      easing: 'ease-out',
    }]);

    this.presetAnimations.set('dynamic', [
      {
        type: 'slideIn',
        duration: 300,
        easing: 'ease-out',
        direction: 'up',
      },
      {
        type: 'highlight',
        duration: 150,
        delay: 50,
        easing: 'ease-in-out',
      },
    ]);

    this.presetAnimations.set('karaoke', [{
      type: 'karaoke',
      duration: 100,
      easing: 'linear',
      intensity: 1.0,
    }]);
  }

  /**
   * Creates enhanced caption pages with better layout
   */
  private async createEnhancedCaptionPages(
    captions: Caption[],
    maxLineLength: number,
    maxLinesPerPage: number
  ): Promise<CaptionPage[]> {
    const pages: CaptionPage[] = [];
    let currentPage: CaptionPage | null = null;
    let currentLine: CaptionLine | null = null;
    let lineLength = 0;

    for (const caption of captions) {
      const words = caption.text.split(' ');
      
      for (const word of words) {
        // Check if we need a new line
        if (!currentLine || lineLength + word.length + 1 > maxLineLength) {
          // Check if we need a new page
          if (!currentPage || (currentPage.lines.length >= maxLinesPerPage && currentLine)) {
            if (currentPage) pages.push(currentPage);
            currentPage = {
              startMs: caption.startMs,
              endMs: caption.endMs,
              lines: [],
            };
          }

          currentLine = { texts: [] };
          currentPage.lines.push(currentLine);
          lineLength = 0;
        }

        // Add word to current line
        currentLine.texts.push({
          text: word,
          startMs: caption.startMs,
          endMs: caption.endMs,
        });

        lineLength += word.length + 1;
      }

      // Update page end time
      if (currentPage) {
        currentPage.endMs = Math.max(currentPage.endMs, caption.endMs);
      }
    }

    if (currentPage) pages.push(currentPage);
    return pages;
  }

  /**
   * Generates subtitle tracks for multi-language support
   */
  private async generateSubtitleTracks(
    options: SubtitleGenerationOptions,
    subtitleId: string
  ): Promise<SubtitleTrack[]> {
    const tracks: SubtitleTrack[] = [];

    // Primary track
    tracks.push({
      id: `${subtitleId}_primary`,
      language: 'en',
      label: 'English',
      captions: options.captions,
      style: options.style,
      animations: options.animations || [],
      isDefault: true,
    });

    // Additional language tracks
    if (options.multiLanguage) {
      options.multiLanguage.forEach((langSub, index) => {
        tracks.push({
          id: `${subtitleId}_${langSub.language}`,
          language: langSub.language,
          label: this.getLanguageLabel(langSub.language),
          captions: langSub.captions,
          style: langSub.style || options.style,
          animations: options.animations || [],
          isDefault: false,
        });
      });
    }

    return tracks;
  }

  /**
   * Generates HTML content for subtitles
   */
  private async generateSubtitleHTML(
    pages: CaptionPage[],
    options: SubtitleGenerationOptions
  ): Promise<string> {
    let html = '<div class="subtitle-container">';

    pages.forEach((page, pageIndex) => {
      html += `<div class="subtitle-page" data-start="${page.startMs}" data-end="${page.endMs}">`;
      
      page.lines.forEach((line, lineIndex) => {
        html += `<div class="subtitle-line">`;
        
        line.texts.forEach((text, textIndex) => {
          const isKaraoke = options.karaoke?.wordByWord;
          const className = isKaraoke ? 'subtitle-word' : 'subtitle-text';
          
          html += `<span class="${className}" data-start="${text.startMs}" data-end="${text.endMs}">${text.text}</span>`;
          
          if (textIndex < line.texts.length - 1) {
            html += ' ';
          }
        });
        
        html += '</div>';
      });
      
      html += '</div>';
    });

    html += '</div>';
    return html;
  }

  /**
   * Generates CSS styles for subtitles
   */
  private async generateSubtitleCSS(options: SubtitleGenerationOptions): Promise<string> {
    const style = options.style;
    
    let css = `
      .subtitle-container {
        position: absolute;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        z-index: 1000;
        pointer-events: none;
      }
      
      .subtitle-page {
        display: none;
        text-align: center;
        max-width: 90%;
      }
      
      .subtitle-page.active {
        display: block;
      }
      
      .subtitle-line {
        margin-bottom: 4px;
      }
      
      .subtitle-text, .subtitle-word {
        font-family: ${style.fontFamily};
        font-size: ${style.fontSize}px;
        font-weight: ${style.fontWeight};
        color: ${style.color};
        opacity: ${style.opacity};
      }
    `;

    // Position-specific styles
    switch (options.position) {
      case 'top':
        css += '.subtitle-container { top: 10%; }';
        break;
      case 'center':
        css += '.subtitle-container { top: 50%; transform: translateY(-50%); }';
        break;
      case 'bottom':
      default:
        css += '.subtitle-container { bottom: 10%; }';
        break;
    }

    // Background styling
    if (style.backgroundColor) {
      css += `
        .subtitle-text, .subtitle-word {
          background-color: ${style.backgroundColor};
          border-radius: ${style.borderRadius || 0}px;
        }
      `;
      
      if (style.padding) {
        css += `
          .subtitle-text, .subtitle-word {
            padding: ${style.padding.top}px ${style.padding.right}px ${style.padding.bottom}px ${style.padding.left}px;
          }
        `;
      }
    }

    // Outline styling
    if (style.outline) {
      css += `
        .subtitle-text, .subtitle-word {
          -webkit-text-stroke: ${style.outline.width}px ${style.outline.color};
        }
      `;
    }

    // Shadow styling
    if (style.shadow) {
      css += `
        .subtitle-text, .subtitle-word {
          text-shadow: ${style.shadow.offsetX}px ${style.shadow.offsetY}px ${style.shadow.blur}px ${style.shadow.color};
        }
      `;
    }

    // Gradient styling
    if (style.gradient) {
      const gradientStr = style.gradient.colors
        .map(c => `${c.color} ${c.position}%`)
        .join(', ');
      css += `
        .subtitle-text, .subtitle-word {
          background: ${style.gradient.type}-gradient(${style.gradient.angle || 45}deg, ${gradientStr});
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `;
    }

    // Animation-specific styles
    if (options.animations) {
      options.animations.forEach((animation, index) => {
        css += this.generateAnimationCSS(animation, index);
      });
    }

    // Karaoke-specific styles
    if (options.karaoke) {
      css += `
        .subtitle-word.highlight {
          background-color: ${options.karaoke.highlightStyle.backgroundColor || '#ffff00'};
          color: ${options.karaoke.highlightStyle.color || '#000000'};
          transition: all ${options.karaoke.transitionDuration}ms ease-in-out;
        }
      `;
    }

    // Accessibility styles
    if (options.accessibility?.highContrast) {
      css += `
        .subtitle-text, .subtitle-word {
          filter: contrast(150%);
        }
      `;
    }

    if (options.accessibility?.reducedMotion) {
      css += `
        @media (prefers-reduced-motion: reduce) {
          .subtitle-text, .subtitle-word {
            animation: none !important;
            transition: none !important;
          }
        }
      `;
    }

    // Custom CSS
    if (options.customCSS) {
      css += '\n' + options.customCSS;
    }

    return css;
  }

  /**
   * Generates animation CSS for subtitle effects
   */
  private generateAnimationCSS(animation: SubtitleAnimation, index: number): string {
    const animationName = `subtitle-${animation.type}-${index}`;
    let keyframes = '';

    switch (animation.type) {
      case 'fadeIn':
        keyframes = `
          @keyframes ${animationName} {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `;
        break;

      case 'slideIn':
        const transform = animation.direction === 'up' ? 'translateY(20px)' :
                         animation.direction === 'down' ? 'translateY(-20px)' :
                         animation.direction === 'left' ? 'translateX(20px)' :
                         animation.direction === 'right' ? 'translateX(-20px)' :
                         'translateY(20px)';
        keyframes = `
          @keyframes ${animationName} {
            from { transform: ${transform}; opacity: 0; }
            to { transform: translate(0); opacity: 1; }
          }
        `;
        break;

      case 'glow':
        keyframes = `
          @keyframes ${animationName} {
            0%, 100% { text-shadow: 0 0 5px currentColor; }
            50% { text-shadow: 0 0 20px currentColor, 0 0 30px currentColor; }
          }
        `;
        break;

      case 'wave':
        keyframes = `
          @keyframes ${animationName} {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
        `;
        break;
    }

    return keyframes + `
      .subtitle-animated-${index} {
        animation: ${animationName} ${animation.duration || 500}ms ${animation.easing} ${animation.delay || 0}ms;
        animation-fill-mode: forwards;
      }
    `;
  }

  /**
   * Generates JavaScript for subtitle animations and timing
   */
  private async generateSubtitleAnimations(options: SubtitleGenerationOptions): Promise<string> {
    return `
      class SubtitleManager {
        constructor() {
          this.currentTime = 0;
          this.activePage = null;
          this.karaokeEnabled = ${!!options.karaoke};
          this.karaokeSettings = ${JSON.stringify(options.karaoke || {})};
        }
        
        updateTime(timeMs) {
          this.currentTime = timeMs;
          this.updateVisibleSubtitles();
          
          if (this.karaokeEnabled) {
            this.updateKaraoke();
          }
        }
        
        updateVisibleSubtitles() {
          const pages = document.querySelectorAll('.subtitle-page');
          let activePageElement = null;
          
          pages.forEach(page => {
            const start = parseInt(page.dataset.start);
            const end = parseInt(page.dataset.end);
            
            if (this.currentTime >= start && this.currentTime <= end) {
              page.classList.add('active');
              activePageElement = page;
            } else {
              page.classList.remove('active');
            }
          });
          
          this.activePage = activePageElement;
        }
        
        updateKaraoke() {
          if (!this.activePage || !this.karaokeSettings.wordByWord) return;
          
          const words = this.activePage.querySelectorAll('.subtitle-word');
          
          words.forEach(word => {
            const start = parseInt(word.dataset.start);
            const end = parseInt(word.dataset.end);
            
            if (this.currentTime >= start && this.currentTime <= end) {
              word.classList.add('highlight');
            } else {
              word.classList.remove('highlight');
            }
          });
        }
        
        applyAnimation(element, animationType) {
          element.classList.add(\`subtitle-animated-\${animationType}\`);
        }
      }
      
      // Initialize subtitle manager
      const subtitleManager = new SubtitleManager();
      
      // Export for external use
      window.subtitleManager = subtitleManager;
    `;
  }

  /**
   * Generates WebVTT format
   */
  private async generateWebVTT(captions: Caption[], style: SubtitleStyle): Promise<string> {
    let vtt = 'WEBVTT\n\n';
    
    // Add style cue
    vtt += 'STYLE\n';
    vtt += `::cue {\n`;
    vtt += `  font-family: ${style.fontFamily};\n`;
    vtt += `  font-size: ${style.fontSize}px;\n`;
    vtt += `  color: ${style.color};\n`;
    if (style.backgroundColor) {
      vtt += `  background-color: ${style.backgroundColor};\n`;
    }
    vtt += `}\n\n`;

    // Add captions
    captions.forEach((caption, index) => {
      const start = this.msToTimestamp(caption.startMs);
      const end = this.msToTimestamp(caption.endMs);
      
      vtt += `${index + 1}\n`;
      vtt += `${start} --> ${end}\n`;
      vtt += `${caption.text}\n\n`;
    });

    return vtt;
  }

  /**
   * Generates SRT format
   */
  private async generateSRT(captions: Caption[]): Promise<string> {
    let srt = '';
    
    captions.forEach((caption, index) => {
      const start = this.msToSRTTimestamp(caption.startMs);
      const end = this.msToSRTTimestamp(caption.endMs);
      
      srt += `${index + 1}\n`;
      srt += `${start} --> ${end}\n`;
      srt += `${caption.text}\n\n`;
    });

    return srt;
  }

  /**
   * Generates Advanced SubStation Alpha (ASS) format
   */
  private async generateASS(captions: Caption[], style: SubtitleStyle): Promise<string> {
    let ass = '[Script Info]\n';
    ass += 'Title: Enhanced Subtitles\n';
    ass += 'ScriptType: v4.00+\n\n';
    
    ass += '[V4+ Styles]\n';
    ass += 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
    ass += `Style: Default,${style.fontFamily},${style.fontSize},&Hffffff,&Hffffff,&H0,&H0,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n`;
    
    ass += '[Events]\n';
    ass += 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    
    captions.forEach(caption => {
      const start = this.msToASSTimestamp(caption.startMs);
      const end = this.msToASSTimestamp(caption.endMs);
      
      ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${caption.text}\n`;
    });

    return ass;
  }

  /**
   * Calculates subtitle metadata
   */
  private calculateSubtitleMetadata(
    captions: Caption[],
    accessibility?: AccessibilityOptions
  ): GeneratedSubtitles['metadata'] {
    const totalDuration = captions.length > 0 ? 
      Math.max(...captions.map(c => c.endMs)) - Math.min(...captions.map(c => c.startMs)) : 0;
    
    const totalWords = captions.reduce((sum, caption) => 
      sum + caption.text.split(/\s+/).length, 0);
    
    const averageWPM = totalDuration > 0 ? 
      (totalWords / (totalDuration / 1000)) * 60 : 0;

    return {
      totalDuration,
      wordCount: totalWords,
      averageWPM: Math.round(averageWPM),
      generatedAt: new Date(),
      accessibility: accessibility || {
        highContrast: false,
        largeText: false,
        reducedMotion: false,
        colorBlindFriendly: false,
        screenReaderCompatible: false,
        closedCaptionFormat: false,
        rtlSupport: false,
      },
    };
  }

  /**
   * Helper methods for timestamp conversion
   */
  private msToTimestamp(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMs = ms % 1000;

    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}.${remainingMs.toString().padStart(3, '0')}`;
  }

  private msToSRTTimestamp(ms: number): string {
    const timestamp = this.msToTimestamp(ms);
    return timestamp.replace('.', ',');
  }

  private msToASSTimestamp(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const centiseconds = Math.floor((ms % 1000) / 10);

    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }

  private getLanguageLabel(code: string): string {
    const languageLabels: { [key: string]: string } = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'ru': 'Russian',
    };
    
    return languageLabels[code] || code.toUpperCase();
  }

  private createDefaultStyle(): SubtitleStyle {
    return {
      fontFamily: 'Arial, sans-serif',
      fontSize: 20,
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderRadius: 4,
      padding: { top: 6, right: 10, bottom: 6, left: 10 },
      outline: { color: '#000000', width: 1 },
      opacity: 1.0,
    };
  }
}