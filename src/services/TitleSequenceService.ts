import fs from "fs-extra";
import path from "path";
import { logger } from "../logger";
import { Config } from "../config";

export interface TitleTemplate {
  id: string;
  name: string;
  description: string;
  category: 'intro' | 'outro' | 'section' | 'logo' | 'credits';
  duration: number; // in seconds
  style: TitleStyle;
  animations: AnimationEffect[];
  customizable: boolean;
  previewImage?: string;
}

export interface TitleStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  backgroundColor?: string;
  gradient?: {
    type: 'linear' | 'radial';
    direction?: string;
    colors: string[];
  };
  shadow?: {
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
  };
  stroke?: {
    color: string;
    width: number;
  };
  spacing?: {
    letter: number;
    line: number;
  };
}

export interface AnimationEffect {
  type: 'fadeIn' | 'fadeOut' | 'slideIn' | 'slideOut' | 'scale' | 'rotate' | 'bounce' | 'typewriter' | 'glitch' | 'neon';
  duration: number; // in seconds
  delay?: number; // in seconds
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce' | 'elastic';
  direction?: 'left' | 'right' | 'up' | 'down' | 'center';
  intensity?: number; // 0.0 to 1.0
  keyframes?: AnimationKeyframe[];
}

export interface AnimationKeyframe {
  time: number; // 0.0 to 1.0
  properties: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
    blur?: number;
  };
}

export interface BrandingConfig {
  logoPath?: string;
  brandColors: string[];
  brandFonts: string[];
  watermarkText?: string;
  watermarkPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  brandingOpacity: number; // 0.0 to 1.0
}

export interface TitleGenerationOptions {
  contentText: string;
  template?: TitleTemplate;
  customStyle?: Partial<TitleStyle>;
  branding?: BrandingConfig;
  contentAnalysis?: {
    tone: 'professional' | 'casual' | 'energetic' | 'dramatic' | 'minimalist';
    keywords: string[];
    mood: string;
  };
  audioDuration?: number;
  position: 'intro' | 'outro' | 'middle';
}

export interface GeneratedTitle {
  id: string;
  htmlContent: string;
  cssStyles: string;
  animationCode: string;
  duration: number;
  renderPath?: string;
  metadata: {
    template: string;
    generatedAt: Date;
    contentHash: string;
  };
}

export class TitleSequenceService {
  private config: Config;
  private templatesCache: Map<string, TitleTemplate> = new Map();
  private predefinedTemplates: TitleTemplate[] = [];
  private logger = logger.child({ service: 'TitleSequenceService' });

  constructor(config: Config) {
    this.config = config;
    this.initializeTemplates();
  }

  /**
   * Generates a dynamic title sequence based on content and preferences
   */
  async generateTitle(options: TitleGenerationOptions): Promise<GeneratedTitle> {
    const startTime = Date.now();
    logger.debug({ options }, "Starting title generation");

    try {
      // Select or create template
      const template = options.template || await this.selectBestTemplate(options);
      
      // Analyze content for dynamic styling
      const contentAnalysis = options.contentAnalysis || await this.analyzeContent(options.contentText);
      
      if (!contentAnalysis) {
        throw new Error('Content analysis failed');
      }
      
      // Generate adaptive styling
      const finalStyle = await this.generateAdaptiveStyle(template.style, contentAnalysis, options.customStyle);
      
      // Create animations based on content mood
      const animations = await this.generateContextualAnimations(template.animations, contentAnalysis);
      
      // Generate HTML content
      const htmlContent = await this.generateHTML(options.contentText, finalStyle, options.branding);
      
      // Generate CSS with animations
      const cssStyles = await this.generateCSS(finalStyle, animations);
      
      // Generate animation JavaScript/timeline
      const animationCode = await this.generateAnimationCode(animations);
      
      const titleId = `title_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const result: GeneratedTitle = {
        id: titleId,
        htmlContent,
        cssStyles,
        animationCode,
        duration: template.duration,
        metadata: {
          template: template.id,
          generatedAt: new Date(),
          contentHash: this.generateContentHash(options.contentText),
        },
      };

      const processingTime = Date.now() - startTime;
      logger.debug(
        { titleId, processingTime, template: template.id },
        "Title generation completed"
      );

      return result;
      
    } catch (error) {
      logger.error({ options, error }, "Failed to generate title");
      throw new Error(`Title generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates title sequences for different video sections
   */
  async generateIntroSequence(
    title: string,
    subtitle?: string,
    branding?: BrandingConfig
  ): Promise<GeneratedTitle> {
    const options: TitleGenerationOptions = {
      contentText: title,
      position: 'intro',
      branding,
      contentAnalysis: {
        tone: 'professional',
        keywords: [title.toLowerCase()],
        mood: 'engaging',
      },
    };

    const template = this.getTemplateByCategory('intro')[0]; // Get first intro template
    if (template) {
      options.template = template;
    }

    if (subtitle) {
      options.contentText = `${title}\n${subtitle}`;
    }

    return this.generateTitle(options);
  }

  /**
   * Creates outro sequence with call-to-action
   */
  async generateOutroSequence(
    callToAction: string,
    socialLinks?: string[],
    branding?: BrandingConfig
  ): Promise<GeneratedTitle> {
    let contentText = callToAction;
    
    if (socialLinks && socialLinks.length > 0) {
      contentText += '\n' + socialLinks.join(' • ');
    }

    const options: TitleGenerationOptions = {
      contentText,
      position: 'outro',
      branding,
      contentAnalysis: {
        tone: 'energetic',
        keywords: ['subscribe', 'follow', 'like'],
        mood: 'motivating',
      },
    };

    const template = this.getTemplateByCategory('outro')[0];
    if (template) {
      options.template = template;
    }

    return this.generateTitle(options);
  }

  /**
   * Creates section dividers with dynamic styling
   */
  async generateSectionDivider(
    sectionTitle: string,
    sectionNumber?: number,
    themeColor?: string
  ): Promise<GeneratedTitle> {
    const displayText = sectionNumber ? 
      `${sectionNumber}. ${sectionTitle}` : 
      sectionTitle;

    const options: TitleGenerationOptions = {
      contentText: displayText,
      position: 'middle',
      customStyle: themeColor ? { color: themeColor } : undefined,
      contentAnalysis: {
        tone: 'minimalist',
        keywords: [sectionTitle.toLowerCase()],
        mood: 'transitional',
      },
    };

    const template = this.getTemplateByCategory('section')[0];
    if (template) {
      options.template = template;
    }

    return this.generateTitle(options);
  }

  /**
   * Renders title to video frame(s) using headless browser
   */
  async renderTitleToFrames(
    title: GeneratedTitle,
    outputDir: string,
    frameRate: number = 30
  ): Promise<string[]> {
    const framePaths: string[] = [];
    
    try {
      logger.debug({ titleId: title.id }, "Rendering title to frames");
      
      // Create HTML file with title content
      const htmlPath = path.join(outputDir, `${title.id}.html`);
      const fullHTML = this.createFullHTMLDocument(title);
      await fs.writeFile(htmlPath, fullHTML);
      
      // Calculate number of frames needed
      const totalFrames = Math.ceil(title.duration * frameRate);
      
      // For now, create a single frame (in production, you would use Puppeteer or similar)
      // to render each frame of the animation timeline
      const framePath = path.join(outputDir, `${title.id}_frame_001.png`);
      
      // This would be replaced with actual browser rendering
      await this.createPlaceholderFrame(framePath, title.htmlContent);
      framePaths.push(framePath);
      
      title.renderPath = framePath;
      
      logger.debug(
        { titleId: title.id, frameCount: framePaths.length },
        "Title rendering completed"
      );
      
      return framePaths;
      
    } catch (error) {
      logger.error({ titleId: title.id, error }, "Failed to render title");
      throw new Error(`Title rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets available templates by category
   */
  getTemplateByCategory(category: TitleTemplate['category']): TitleTemplate[] {
    return this.predefinedTemplates.filter(template => template.category === category);
  }

  /**
   * Lists all available templates
   */
  getAllTemplates(): TitleTemplate[] {
    return [...this.predefinedTemplates];
  }

  /**
   * Creates a custom template
   */
  createCustomTemplate(
    name: string,
    category: TitleTemplate['category'],
    style: TitleStyle,
    animations: AnimationEffect[],
    duration: number = 3
  ): TitleTemplate {
    const template: TitleTemplate = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description: `Custom ${category} template`,
      category,
      duration,
      style,
      animations,
      customizable: true,
    };

    this.predefinedTemplates.push(template);
    this.templatesCache.set(template.id, template);
    
    return template;
  }

  /**
   * Initializes predefined templates
   */
  private initializeTemplates(): void {
    // Modern Intro Template
    this.predefinedTemplates.push({
      id: 'modern_intro',
      name: 'Modern Intro',
      description: 'Clean, modern intro with fade and slide animations',
      category: 'intro',
      duration: 3,
      customizable: true,
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 48,
        fontWeight: 'bold',
        color: '#ffffff',
        gradient: {
          type: 'linear',
          direction: '45deg',
          colors: ['#667eea', '#764ba2'],
        },
        shadow: {
          color: 'rgba(0,0,0,0.5)',
          offsetX: 2,
          offsetY: 2,
          blur: 10,
        },
      },
      animations: [
        {
          type: 'fadeIn',
          duration: 1,
          easing: 'ease-out',
        },
        {
          type: 'slideIn',
          duration: 0.8,
          delay: 0.2,
          easing: 'ease-out',
          direction: 'up',
        },
      ],
    });

    // Dynamic Outro Template
    this.predefinedTemplates.push({
      id: 'dynamic_outro',
      name: 'Dynamic Outro',
      description: 'Energetic outro with bounce and scale effects',
      category: 'outro',
      duration: 4,
      customizable: true,
      style: {
        fontFamily: 'Impact, sans-serif',
        fontSize: 36,
        fontWeight: 'bold',
        color: '#ff6b6b',
        stroke: {
          color: '#ffffff',
          width: 2,
        },
        shadow: {
          color: 'rgba(255,107,107,0.4)',
          offsetX: 0,
          offsetY: 0,
          blur: 20,
        },
      },
      animations: [
        {
          type: 'scale',
          duration: 1.2,
          easing: 'bounce',
          intensity: 1.2,
        },
        {
          type: 'bounce',
          duration: 0.6,
          delay: 1,
          easing: 'elastic',
        },
      ],
    });

    // Minimalist Section Template
    this.predefinedTemplates.push({
      id: 'minimal_section',
      name: 'Minimal Section',
      description: 'Clean section divider with subtle animations',
      category: 'section',
      duration: 2,
      customizable: true,
      style: {
        fontFamily: 'Helvetica, sans-serif',
        fontSize: 32,
        fontWeight: '300',
        color: '#333333',
        spacing: {
          letter: 2,
          line: 1.4,
        },
      },
      animations: [
        {
          type: 'typewriter',
          duration: 1.5,
          easing: 'linear',
        },
      ],
    });

    // Populate templates cache
    for (const template of this.predefinedTemplates) {
      this.templatesCache.set(template.id, template);
    }
  }

  /**
   * Selects the best template based on content analysis
   */
  private async selectBestTemplate(options: TitleGenerationOptions): Promise<TitleTemplate> {
    const categoryTemplates = this.getTemplateByCategory(
      options.position as TitleTemplate['category']
    );

    if (categoryTemplates.length === 0) {
      // Fallback to first available template
      return this.predefinedTemplates[0];
    }

    // Simple selection logic - in production, this would be more sophisticated
    if (options.contentAnalysis) {
      const { tone } = options.contentAnalysis;
      
      // Map tones to template preferences
      if (tone === 'energetic' && options.position === 'outro') {
        return categoryTemplates.find(t => t.id === 'dynamic_outro') || categoryTemplates[0];
      }
      
      if (tone === 'minimalist') {
        return categoryTemplates.find(t => t.id === 'minimal_section') || categoryTemplates[0];
      }
    }

    return categoryTemplates[0];
  }

  /**
   * Analyzes content to determine appropriate styling
   */
  private async analyzeContent(content: string): Promise<NonNullable<TitleGenerationOptions['contentAnalysis']>> {
    const words = content.toLowerCase().split(/\s+/);
    const keywords = words.filter(word => word.length > 3);
    
    // Simple mood detection
    let tone: 'professional' | 'casual' | 'energetic' | 'dramatic' | 'minimalist' = 'professional';
    let mood = 'neutral';
    
    if (words.some(word => ['exciting', 'amazing', 'incredible', 'wow'].includes(word))) {
      tone = 'energetic';
      mood = 'exciting';
    } else if (words.some(word => ['simple', 'clean', 'minimal'].includes(word))) {
      tone = 'minimalist';
      mood = 'calm';
    } else if (words.some(word => ['fun', 'cool', 'awesome'].includes(word))) {
      tone = 'casual';
      mood = 'playful';
    }

    return { tone, keywords, mood };
  }

  /**
   * Generates adaptive styling based on content analysis
   */
  private async generateAdaptiveStyle(
    baseStyle: TitleStyle,
    analysis: NonNullable<TitleGenerationOptions['contentAnalysis']>,
    customStyle?: Partial<TitleStyle>
  ): Promise<TitleStyle> {
    let adaptedStyle = { ...baseStyle };

    // Adapt based on tone
    if (analysis.tone === 'energetic') {
      adaptedStyle.color = '#ff6b6b';
      adaptedStyle.fontWeight = 'bold';
    } else if (analysis.tone === 'minimalist') {
      adaptedStyle.color = '#333333';
      adaptedStyle.fontWeight = '300';
    } else if (analysis.tone === 'dramatic') {
      adaptedStyle.fontSize = Math.floor(adaptedStyle.fontSize * 1.2);
      adaptedStyle.shadow = {
        color: 'rgba(0,0,0,0.8)',
        offsetX: 3,
        offsetY: 3,
        blur: 15,
      };
    }

    // Apply custom overrides
    if (customStyle) {
      adaptedStyle = { ...adaptedStyle, ...customStyle };
    }

    return adaptedStyle;
  }

  /**
   * Generates contextual animations
   */
  private async generateContextualAnimations(
    baseAnimations: AnimationEffect[],
    analysis: NonNullable<TitleGenerationOptions['contentAnalysis']>
  ): Promise<AnimationEffect[]> {
    let adaptedAnimations = [...baseAnimations];

    // Modify animations based on mood
    if (analysis.tone === 'energetic') {
      adaptedAnimations = adaptedAnimations.map(anim => ({
        ...anim,
        intensity: Math.min(1, (anim.intensity || 0.5) * 1.5),
        easing: anim.easing === 'linear' ? 'bounce' : anim.easing,
      }));
    } else if (analysis.tone === 'minimalist') {
      adaptedAnimations = adaptedAnimations.map(anim => ({
        ...anim,
        duration: anim.duration * 1.2, // Slower animations
        easing: 'ease-out',
      }));
    }

    return adaptedAnimations;
  }

  /**
   * Generates HTML content
   */
  private async generateHTML(
    text: string,
    style: TitleStyle,
    branding?: BrandingConfig
  ): Promise<string> {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    let html = '<div class="title-container">';
    
    // Add branding logo if provided
    if (branding?.logoPath) {
      html += `<div class="brand-logo"><img src="${branding.logoPath}" alt="Logo" /></div>`;
    }
    
    // Add main content
    html += '<div class="title-content">';
    lines.forEach((line, index) => {
      const isMainTitle = index === 0;
      const className = isMainTitle ? 'title-main' : 'title-subtitle';
      html += `<div class="${className}">${line}</div>`;
    });
    html += '</div>';
    
    // Add watermark if provided
    if (branding?.watermarkText) {
      html += `<div class="watermark">${branding.watermarkText}</div>`;
    }
    
    html += '</div>';
    
    return html;
  }

  /**
   * Generates CSS styles
   */
  private async generateCSS(style: TitleStyle, animations: AnimationEffect[]): Promise<string> {
    let css = `
      .title-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        width: 100vw;
        position: relative;
      }
      
      .title-content {
        text-align: center;
        z-index: 10;
      }
      
      .title-main, .title-subtitle {
        font-family: ${style.fontFamily};
        font-weight: ${style.fontWeight};
        color: ${style.color};
      }
      
      .title-main {
        font-size: ${style.fontSize}px;
        margin-bottom: 10px;
      }
      
      .title-subtitle {
        font-size: ${Math.floor(style.fontSize * 0.6)}px;
        opacity: 0.8;
      }
    `;

    // Add gradient if specified
    if (style.gradient) {
      const gradient = `${style.gradient.type}-gradient(${style.gradient.direction || '45deg'}, ${style.gradient.colors.join(', ')})`;
      css += `
        .title-main, .title-subtitle {
          background: ${gradient};
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `;
    }

    // Add shadow if specified
    if (style.shadow) {
      css += `
        .title-main, .title-subtitle {
          text-shadow: ${style.shadow.offsetX}px ${style.shadow.offsetY}px ${style.shadow.blur}px ${style.shadow.color};
        }
      `;
    }

    // Add stroke if specified
    if (style.stroke) {
      css += `
        .title-main, .title-subtitle {
          -webkit-text-stroke: ${style.stroke.width}px ${style.stroke.color};
        }
      `;
    }

    // Add letter spacing if specified
    if (style.spacing) {
      css += `
        .title-main, .title-subtitle {
          letter-spacing: ${style.spacing.letter}px;
          line-height: ${style.spacing.line};
        }
      `;
    }

    // Add animation keyframes
    animations.forEach((animation, index) => {
      css += this.generateAnimationCSS(animation, index);
    });

    return css;
  }

  /**
   * Generates animation CSS keyframes
   */
  private generateAnimationCSS(animation: AnimationEffect, index: number): string {
    const animationName = `${animation.type}_${index}`;
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
        const direction = animation.direction || 'up';
        const translateFrom = direction === 'up' ? 'translateY(50px)' : 
                             direction === 'down' ? 'translateY(-50px)' :
                             direction === 'left' ? 'translateX(50px)' : 'translateX(-50px)';
        keyframes = `
          @keyframes ${animationName} {
            from { transform: ${translateFrom}; opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `;
        break;
        
      case 'scale':
        const scale = animation.intensity || 1.2;
        keyframes = `
          @keyframes ${animationName} {
            0% { transform: scale(0.8); }
            50% { transform: scale(${scale}); }
            100% { transform: scale(1); }
          }
        `;
        break;
        
      case 'bounce':
        keyframes = `
          @keyframes ${animationName} {
            0%, 20%, 53%, 80%, 100% { transform: translateY(0); }
            40%, 43% { transform: translateY(-10px); }
            70% { transform: translateY(-5px); }
            90% { transform: translateY(-2px); }
          }
        `;
        break;
    }
    
    return keyframes + `
      .title-main, .title-subtitle {
        animation: ${animationName} ${animation.duration}s ${animation.easing} ${animation.delay || 0}s forwards;
      }
    `;
  }

  /**
   * Generates animation JavaScript code
   */
  private async generateAnimationCode(animations: AnimationEffect[]): Promise<string> {
    return `
      // Animation timeline for title sequence
      const titleAnimations = ${JSON.stringify(animations, null, 2)};
      
      function initializeTitleAnimations() {
        titleAnimations.forEach((animation, index) => {
          setTimeout(() => {
            this.logger.debug({ animationType: animation.type }, 'Starting animation');
          }, (animation.delay || 0) * 1000);
        });
      }
      
      // Initialize when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTitleAnimations);
      } else {
        initializeTitleAnimations();
      }
    `;
  }

  /**
   * Creates full HTML document for rendering
   */
  private createFullHTMLDocument(title: GeneratedTitle): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generated Title</title>
        <style>
          body { margin: 0; padding: 0; overflow: hidden; }
          ${title.cssStyles}
        </style>
      </head>
      <body>
        ${title.htmlContent}
        <script>
          ${title.animationCode}
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Creates a placeholder frame (to be replaced with actual rendering)
   */
  private async createPlaceholderFrame(framePath: string, content: string): Promise<void> {
    // This is a placeholder - in production, you would use Puppeteer or similar
    // to render the HTML to PNG frames
    const placeholderContent = `Placeholder frame for: ${content}`;
    await fs.writeFile(framePath.replace('.png', '.txt'), placeholderContent);
  }

  /**
   * Generates content hash for caching
   */
  private generateContentHash(content: string): string {
    // Simple hash function - in production, use a proper hash library
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}