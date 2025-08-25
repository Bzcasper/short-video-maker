import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { Config } from "../../../config";
import { ScriptGenerationService } from "../../../services/ScriptGenerationService";
import { ScriptTemplateEngine, Platform } from "../../../services/ScriptTemplateEngine";
import { logger } from "../../../logger";
import { scriptGenerationInput, promptToScenesInput } from "../../../types/shorts";

export class ScriptsRouter {
  public router: express.Router;
  private config: Config;
  private scriptService: ScriptGenerationService;

  constructor(config: Config) {
    this.config = config;
    this.scriptService = new ScriptGenerationService();
    this.router = express.Router();
    
    this.setupRoutes();
  }

  private setupRoutes() {
    /**
     * @swagger
     * /scripts/templates:
     *   get:
     *     summary: Get all script templates
     *     description: Retrieve a list of all available script templates
     *     tags: [scripts]
     *     parameters:
     *       - in: query
     *         name: contentType
     *         schema:
     *           type: string
     *           enum: [educational, entertainment, marketing, news_trends]
     *         description: Filter by content type
     *       - in: query
     *         name: platform
     *         schema:
     *           type: string
     *           enum: [tiktok, youtube_shorts, instagram_reels]
     *         description: Filter by platform
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *         description: Search templates by name, description, or tags
     *     responses:
     *       200:
     *         description: Templates retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 templates:
     *                   type: array
     *                   items:
     *                     $ref: '#/components/schemas/ScriptTemplate'
     *                 total:
     *                   type: number
     */
    this.router.get("/templates", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { contentType, platform, search } = req.query;
        
        let templates = this.scriptService.getTemplates();

        // Apply filters
        if (contentType && typeof contentType === 'string') {
          templates = this.scriptService.getTemplatesByType(contentType);
        }

        if (platform && typeof platform === 'string') {
          templates = this.scriptService.getTemplatesByPlatform(platform);
        }

        if (search && typeof search === 'string') {
          templates = this.scriptService.searchTemplates(search);
        }

        res.status(200).json({
          templates,
          total: templates.length
        });
      } catch (error: unknown) {
        logger.error(error, "Error retrieving templates");
        res.status(500).json({
          error: "Failed to retrieve templates",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    /**
     * @swagger
     * /scripts/templates/{templateId}:
     *   get:
     *     summary: Get a specific script template
     *     description: Retrieve a specific script template by ID
     *     tags: [scripts]
     *     parameters:
     *       - in: path
     *         name: templateId
     *         required: true
     *         schema:
     *           type: string
     *         description: Template ID
     *     responses:
     *       200:
     *         description: Template retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ScriptTemplate'
     *       404:
     *         description: Template not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.get("/templates/:templateId", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { templateId } = req.params;
        const template = this.scriptService.getTemplate(templateId);

        if (!template) {
          res.status(404).json({
            error: "Template not found"
          });
          return;
        }

        res.status(200).json(template);
      } catch (error: unknown) {
        logger.error(error, "Error retrieving template");
        res.status(500).json({
          error: "Failed to retrieve template",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    /**
     * @swagger
     * /scripts/generate:
     *   post:
     *     summary: Generate script from template
     *     description: Generate a script using a template with provided variables
     *     tags: [scripts]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/ScriptGenerationRequest'
     *     responses:
     *       200:
     *         description: Script generated successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/GeneratedScriptResponse'
     *       400:
     *         description: Invalid request or missing required variables
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       404:
     *         description: Template not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       500:
     *         description: Script generation failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.post("/generate", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        // Validate input
        const validationResult = scriptGenerationInput.safeParse(req.body);
        if (!validationResult.success) {
          res.status(400).json({
            error: "Validation failed",
            details: validationResult.error.errors
          });
          return;
        }

        const request = validationResult.data;

        // Generate script and convert to scenes
        const result = await this.scriptService.generateScriptAndScenes(request);

        res.status(200).json({
          success: true,
          script: result.script,
          scenes: result.scenes,
          validation: result.validation
        });

      } catch (error: unknown) {
        logger.error(error, "Error generating script");
        res.status(500).json({
          error: "Script generation failed",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    /**
     * @swagger
     * /scripts/prompt-to-scenes:
     *   post:
     *     summary: Generate scenes from natural language prompt
     *     description: Generate video scenes directly from a natural language prompt using smart template selection
     *     tags: [scripts]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/PromptToScenesRequest'
     *     responses:
     *       200:
     *         description: Scenes generated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 scenes:
     *                   type: array
     *                   items:
     *                     $ref: '#/components/schemas/EnhancedSceneInput'
     *                 selectedTemplate:
     *                   type: string
     *                 script:
     *                   $ref: '#/components/schemas/GeneratedScript'
     *                 config:
     *                   $ref: '#/components/schemas/RenderConfig'
     *       400:
     *         description: Invalid request
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       500:
     *         description: Scene generation failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.post("/prompt-to-scenes", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        // Validate input
        const validationResult = promptToScenesInput.safeParse(req.body);
        if (!validationResult.success) {
          res.status(400).json({
            error: "Validation failed",
            details: validationResult.error.errors
          });
          return;
        }

        const { prompt, contentType, platform, targetDuration, config } = validationResult.data;

        // Generate scenes from prompt
        const result = await this.scriptService.generateScenesFromPrompt(prompt, {
          contentType,
          platform,
          targetDuration
        });

        res.status(200).json({
          success: true,
          scenes: result.scenes,
          selectedTemplate: result.selectedTemplate,
          script: result.script,
          config: config || {
            voice: result.script.metadata.template.includes("Educational") ? "af_heart" : "af_sarah",
            music: "hopeful",
            orientation: "portrait",
            captionPosition: "bottom"
          }
        });

      } catch (error: unknown) {
        logger.error(error, "Error generating scenes from prompt");
        res.status(500).json({
          error: "Scene generation failed",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    /**
     * @swagger
     * /scripts/validate:
     *   post:
     *     summary: Validate script content
     *     description: Validate a script for engagement, quality, and platform optimization
     *     tags: [scripts]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - script
     *             properties:
     *               script:
     *                 $ref: '#/components/schemas/GeneratedScript'
     *     responses:
     *       200:
     *         description: Script validated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 validation:
     *                   $ref: '#/components/schemas/ValidationResult'
     *                 engagementMetrics:
     *                   $ref: '#/components/schemas/EngagementMetrics'
     *       400:
     *         description: Invalid script data
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       500:
     *         description: Validation failed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.post("/validate", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { script } = req.body;

        if (!script || typeof script !== 'object') {
          res.status(400).json({
            error: "Invalid script data"
          });
          return;
        }

        // Validate the script
        const contentValidator = new (await import("../../../services/ContentValidator.js")).ContentValidator();
        const validatedScript = await contentValidator.validateScript(script);
        const engagementMetrics = await contentValidator.calculateEngagementMetrics(validatedScript);

        res.status(200).json({
          validation: validatedScript.validation,
          engagementMetrics
        });

      } catch (error: unknown) {
        logger.error(error, "Error validating script");
        res.status(500).json({
          error: "Validation failed",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    /**
     * @swagger
     * /scripts/validation-rules:
     *   get:
     *     summary: Get validation rules
     *     description: Retrieve all available content validation rules and their weights
     *     tags: [scripts]
     *     responses:
     *       200:
     *         description: Validation rules retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 rules:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       name:
     *                         type: string
     *                       weight:
     *                         type: number
     *                       description:
     *                         type: string
     */
    this.router.get("/validation-rules", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const rules = this.scriptService.getValidationRules();
        res.status(200).json({
          rules: rules.map(rule => ({
            name: rule.name,
            weight: rule.weight,
            description: `Validation rule for ${rule.name.replace('_', ' ')}`
          }))
        });
      } catch (error: unknown) {
        logger.error(error, "Error retrieving validation rules");
        res.status(500).json({
          error: "Failed to retrieve validation rules",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    /**
     * @swagger
     * /scripts/content-types:
     *   get:
     *     summary: Get available content types
     *     description: Retrieve all available content types and their descriptions
     *     tags: [scripts]
     *     responses:
     *       200:
     *         description: Content types retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 contentTypes:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: string
     *                       name:
     *                         type: string
     *                       description:
     *                         type: string
     *                       examples:
     *                         type: array
     *                         items:
     *                           type: string
     */
    this.router.get("/content-types", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const contentTypes = [
          {
            id: "educational",
            name: "Educational",
            description: "How-to tutorials, facts, learning content",
            examples: ["How to cook pasta", "5 amazing science facts", "Learn JavaScript in 60 seconds"]
          },
          {
            id: "entertainment",
            name: "Entertainment",
            description: "Stories, comedy, engaging personal content",
            examples: ["Funny story about my cat", "Comedy skit about work from home", "Plot twist story"]
          },
          {
            id: "marketing",
            name: "Marketing",
            description: "Product demos, testimonials, promotional content",
            examples: ["Amazing product review", "Before and after transformation", "Product demonstration"]
          },
          {
            id: "news_trends",
            name: "News & Trends",
            description: "Trending topics, current events, viral content reaction",
            examples: ["React to viral TikTok trend", "Breaking news analysis", "Opinion on current events"]
          }
        ];

        res.status(200).json({
          contentTypes
        });
      } catch (error: unknown) {
        logger.error(error, "Error retrieving content types");
        res.status(500).json({
          error: "Failed to retrieve content types",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    /**
     * @swagger
     * /scripts/platforms:
     *   get:
     *     summary: Get supported platforms
     *     description: Retrieve all supported platforms and their optimization features
     *     tags: [scripts]
     *     responses:
     *       200:
     *         description: Platforms retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 platforms:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: string
     *                       name:
     *                         type: string
     *                       description:
     *                         type: string
     *                       idealLength:
     *                         type: object
     *                         properties:
     *                           min:
     *                             type: number
     *                           max:
     *                             type: number
     *                       features:
     *                         type: array
     *                         items:
     *                           type: string
     */
    this.router.get("/platforms", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const platforms = [
          {
            id: "tiktok",
            name: "TikTok",
            description: "Short-form vertical videos optimized for TikTok algorithm",
            idealLength: { min: 15, max: 60 },
            features: ["Quick hooks", "Trending language", "Visual cues", "Fast-paced content"]
          },
          {
            id: "youtube_shorts",
            name: "YouTube Shorts",
            description: "YouTube's short-form video format",
            idealLength: { min: 15, max: 60 },
            features: ["Educational value", "Clear title hooks", "Subscribe CTAs", "Longer content allowed"]
          },
          {
            id: "instagram_reels",
            name: "Instagram Reels",
            description: "Instagram's short video format with focus on visual appeal",
            idealLength: { min: 15, max: 90 },
            features: ["Visual appeal", "Hashtag potential", "Story arcs", "Aesthetic language"]
          }
        ];

        res.status(200).json({
          platforms
        });
      } catch (error: unknown) {
        logger.error(error, "Error retrieving platforms");
        res.status(500).json({
          error: "Failed to retrieve platforms",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    /**
     * @swagger
     * /scripts/example:
     *   post:
     *     summary: Generate example script
     *     description: Generate an example script using a simple educational template for demonstration
     *     tags: [scripts]
     *     requestBody:
     *       required: false
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               topic:
     *                 type: string
     *                 description: Topic for the example script
     *                 default: "cooking pasta"
     *     responses:
     *       200:
     *         description: Example script generated successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/GeneratedScriptResponse'
     */
    this.router.post("/example", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { topic = "cooking pasta" } = req.body;

        // Use educational template for example
        const request = {
          templateId: "educational_howto_basic",
          variables: {
            hook_question: `you can master ${topic} in under 5 minutes`,
            main_topic: topic,
            time_duration: "5 minutes",
            step_1: `gather your ingredients and equipment`,
            key_point_1: `having everything ready makes the process smooth`,
            step_2: `follow the technique I'm about to show you`,
            reason_2: `this method ensures perfect results every time`,
            step_3: `add the finishing touches`,
            final_tip: `remember to taste and adjust as needed`
          },
          platform: Platform.TIKTOK,
          targetLength: 45
        };

        const result = await this.scriptService.generateScriptAndScenes(request);

        res.status(200).json({
          success: true,
          script: result.script,
          scenes: result.scenes,
          validation: result.validation,
          note: "This is an example generated script. Modify the variables to customize it for your needs."
        });

      } catch (error: unknown) {
        logger.error(error, "Error generating example script");
        res.status(500).json({
          error: "Failed to generate example script",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });
  }
}