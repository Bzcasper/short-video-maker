import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import fs from "fs-extra";
import path from "path";

import { validateCreateShortInput } from "../validator";
import { ShortCreator } from "../../short-creator/ShortCreator";
import { logger } from "../../logger";
import { Config } from "../../config";

// todo abstract class
import { CloudflareAI } from "../libraries/CloudflareAI";
import { SunoAI } from "../libraries/SunoAI";
import { VercelAI } from "../libraries/VercelAI";

export class APIRouter {
  public router: express.Router;
  private shortCreator: ShortCreator;
  private config: Config;
  private cloudflareAI: CloudflareAI;
  private sunoAI: SunoAI;

  constructor(config: Config, shortCreator: ShortCreator) {
    this.config = config;
    this.shortCreator = shortCreator;
    this.router = express.Router();
    this.cloudflareAI = new CloudflareAI(config);
    this.sunoAI = new SunoAI(config);

    this.router.use(express.json());
    const vercelAI = new VercelAI(this.config);

    this.setupRoutes(vercelAI);
  }

  private setupRoutes(vercelAI: VercelAI) {
    this.router.post(
      "/short-video",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const input = validateCreateShortInput(req.body);

          logger.info({ input }, "Creating short video");

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
          );

          res.status(201).json({
            videoId,
          });
        } catch (error: unknown) {
          logger.error(
            { error, body: req.body },
            "Error validating input with request details",
          );

          // Handle validation errors specifically
          if (error instanceof Error && error.message.startsWith("{")) {
            try {
              const errorData = JSON.parse(error.message);
              res.status(400).json({
                error: "Validation failed",
                message: errorData.message,
                missingFields: errorData.missingFields,
                details:
                  "Check the input structure for required fields and formats",
              });
              return;
            } catch (parseError: unknown) {
              logger.error(
                { parseError, originalError: error },
                "Error parsing validation error",
              );
              res.status(400).json({
                error: "Validation failed",
                message: "Unable to parse validation error details",
                details: "Input validation failed with unparseable error data",
              });
              return;
            }
          }

          // Fallback for other errors
          res.status(400).json({
            error: "Invalid input",
            message: error instanceof Error ? error.message : "Unknown error",
            details: "An unexpected error occurred during input processing",
          });
        }
      },
    );

    this.router.get(
      "/short-video/:videoId/status",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        const status = this.shortCreator.status(videoId);
        const progress = this.shortCreator.getProgress(videoId) || 0; // Assuming method exists or will be added
        const stage = this.shortCreator.getStage(videoId) || "Processing"; // Assuming method exists or will be added
        res.status(200).json({
          status,
          progress,
          stage,
        });
      },
    );

    this.router.get(
      "/music-tags",
      (req: ExpressRequest, res: ExpressResponse) => {
        res.status(200).json(this.shortCreator.ListAvailableMusicTags());
      },
    );

    this.router.get("/voices", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json(this.shortCreator.ListAvailableVoices());
    });

    this.router.get(
      "/short-videos",
      (req: ExpressRequest, res: ExpressResponse) => {
        const videos = this.shortCreator.listAllVideos();
        res.status(200).json({
          videos,
        });
      },
    );

    this.router.delete(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        this.shortCreator.deleteVideo(videoId);
        res.status(200).json({
          success: true,
        });
      },
    );

    this.router.get(
      "/tmp/:tmpFile",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { tmpFile } = req.params;
        if (!tmpFile) {
          res.status(400).json({
            error: "tmpFile is required",
          });
          return;
        }
        const tmpFilePath = path.join(this.config.tempDirPath, tmpFile);
        if (!fs.existsSync(tmpFilePath)) {
          res.status(404).json({
            error: "tmpFile not found",
          });
          return;
        }

        if (tmpFile.endsWith(".mp3")) {
          res.setHeader("Content-Type", "audio/mpeg");
        }
        if (tmpFile.endsWith(".wav")) {
          res.setHeader("Content-Type", "audio/wav");
        }
        if (tmpFile.endsWith(".mp4")) {
          res.setHeader("Content-Type", "video/mp4");
        }

        const tmpFileStream = fs.createReadStream(tmpFilePath);
        tmpFileStream.on("error", (error) => {
          logger.error(error, "Error reading tmp file");
          res.status(500).json({
            error: "Error reading tmp file",
            tmpFile,
          });
        });
        tmpFileStream.pipe(res);
      },
    );

    this.router.get(
      "/music/:fileName",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { fileName } = req.params;
        if (!fileName) {
          res.status(400).json({
            error: "fileName is required",
          });
          return;
        }
        const musicFilePath = path.join(this.config.musicDirPath, fileName);
        if (!fs.existsSync(musicFilePath)) {
          res.status(404).json({
            error: "music file not found",
          });
          return;
        }
        const musicFileStream = fs.createReadStream(musicFilePath);
        musicFileStream.on("error", (error) => {
          logger.error(error, "Error reading music file");
          res.status(500).json({
            error: "Error reading music file",
            fileName,
          });
        });
        musicFileStream.pipe(res);
      },
    );

    this.router.get(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { videoId } = req.params;
          if (!videoId) {
            res.status(400).json({
              error: "videoId is required",
            });
            return;
          }
          const video = this.shortCreator.getVideo(videoId);
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader(
            "Content-Disposition",
            `inline; filename=${videoId}.mp4`,
          );
          res.send(video);
        } catch (error: unknown) {
          logger.error(
            { error, videoId: req.params.videoId },
            "Error retrieving video with ID",
          );
          res.status(404).json({
            error: "Video not found",
            message: error instanceof Error ? error.message : "Unknown error",
            details: `Video with ID ${req.params.videoId} could not be located or accessed`,
          });
        }
      },
    );

    // Community Asset Library Endpoints
    this.router.post(
      "/community-assets/upload",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { assetType, fileName, fileData } = req.body;
          if (!assetType || !fileName || !fileData) {
            res.status(400).json({
              error: "assetType, fileName, and fileData are required",
            });
            return;
          }
          // Placeholder for storing asset in Cloudflare R2 or local storage
          logger.info({ assetType, fileName }, "Uploading community asset");
          // Implement storage logic here
          res.status(201).json({
            assetId: `asset-${Date.now()}`, // Placeholder ID
            message: "Asset uploaded successfully",
          });
        } catch (error: unknown) {
          logger.error(error, "Error uploading community asset");
          res.status(500).json({
            error: "Internal server error",
          });
        }
      },
    );

    this.router.get(
      "/community-assets",
      (req: ExpressRequest, res: ExpressResponse) => {
        try {
          // Placeholder for listing community assets
          logger.info("Listing community assets");
          res.status(200).json({
            assets: [], // Placeholder empty list
          });
        } catch (error: unknown) {
          logger.error(error, "Error listing community assets");
          res.status(500).json({
            error: "Internal server error",
          });
        }
      },
    );

    this.router.post(
      "/community-assets/rate",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { assetId, rating } = req.body;
          if (!assetId || rating === undefined) {
            res.status(400).json({
              error: "assetId and rating are required",
            });
            return;
          }
          // Placeholder for recording asset rating
          logger.info({ assetId, rating }, "Rating community asset");
          res.status(200).json({
            message: "Rating recorded successfully",
          });
        } catch (error: unknown) {
          logger.error(error, "Error rating community asset");
          res.status(500).json({
            error: "Internal server error",
          });
        }
      },
    );

    // AI-powered endpoints
    this.router.post(
      "/ai/caption-enhancement",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { text, videoId } = req.body;
          if (!text || !videoId) {
            res.status(400).json({
              error: "text and videoId are required",
            });
            return;
          }
          logger.info(
            { text, videoId },
            "Processing AI caption enhancement with Cloudflare Workers AI",
          );
          const enhancedText = await this.cloudflareAI.enhanceCaption(
            text,
            videoId,
          );
          res.status(200).json({
            enhancedText,
            status: "completed",
          });
        } catch (error: unknown) {
          logger.error(error, "Error processing AI caption enhancement");
          res.status(500).json({
            error: "Internal server error",
          });
        }
      },
    );

    this.router.post(
      "/ai/content-suggestions",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { script, theme } = req.body;
          if (!script) {
            res.status(400).json({
              error: "script is required",
            });
            return;
          }
          // Placeholder for Vercel AI SDK integration for content suggestions
          logger.info({ script, theme }, "Generating AI content suggestions");
          res.status(200).json({
            suggestions: {
              backgroundVideo: "Suggested video based on theme",
              music: "Suggested music based on theme",
            }, // Placeholder response
            status: "processing",
          });
        } catch (error: unknown) {
          logger.error(error, "Error generating AI content suggestions");
          res.status(500).json({
            error: "Internal server error",
          });
        }
      },
    );

    this.router.post("/suggest-script", async (req, res) => {
      const { content, videoId } = req.body;
      try {
        const suggestions = await vercelAI.suggestScript(content, videoId);
        res.json({ suggestions });
      } catch (error: unknown) {
        logger.error({ error }, "Failed to suggest script");
        res.status(500).json({ error: (error as Error).message });
      }
    });
  }
}
