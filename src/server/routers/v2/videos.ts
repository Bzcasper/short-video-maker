import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { Config } from "../../../config";
import { ShortCreator } from "../../../short-creator/ShortCreator";
import { VideoTracker } from "../../../short-creator/VideoTracker";
import { VideoQueue } from "../../queue/VideoQueue";
import { VideoWebSocketServer } from "../../websocket/VideoWebSocketServer";
import { WebhookService } from "../../webhook/WebhookService";
import { logger } from "../../../logger";
import { validateCreateShortInput } from "../../validator";

export class VideosRouter {
  public router: express.Router;
  private config: Config;
  private shortCreator: ShortCreator;
  private videoTracker: VideoTracker;
  private videoQueue: VideoQueue;
  private wsServer: VideoWebSocketServer;
  private webhookService: WebhookService;

  constructor(config: Config, shortCreator: ShortCreator, webhookService: WebhookService) {
    this.config = config;
    this.shortCreator = shortCreator;
    this.webhookService = webhookService;
    try {
      this.videoTracker = new VideoTracker(config);
      console.log('VideosRouter: videoTracker created successfully');
    } catch (error) {
      console.error('VideosRouter: Error creating videoTracker:', error);
      throw error;
    }
    
    // Only initialize VideoQueue if not in test environment to avoid Redis connection issues
    if (process.env.NODE_ENV !== 'test') {
      this.videoQueue = new VideoQueue(shortCreator);
    } else {
      // Create a proper mock videoQueue for testing with required methods
      this.videoQueue = {
        addJob: async (videoId: string, scenes: any, config: any) => {
          console.log(`Mock addJob called for video ${videoId}`);
          return Promise.resolve();
        },
        cancelJob: async (videoId: string) => {
          console.log(`Mock cancelJob called for video ${videoId}`);
          return Promise.resolve(true);
        }
      } as VideoQueue;
    }
    
    // Only initialize WebSocket server if not in test environment to avoid setInterval issues
    if (process.env.NODE_ENV !== 'test') {
      try {
        this.wsServer = new VideoWebSocketServer(config, this.videoTracker);
        console.log('VideosRouter: wsServer created');
      } catch (error) {
        console.error('VideosRouter: Error creating wsServer:', error);
        throw error;
      }
    } else {
      // Create a minimal mock wsServer for testing - use type assertion to bypass private property checks
      this.wsServer = {
        broadcastVideoEvent: () => {},
        getClientCount: () => 0,
        attachToServer: () => {},
        close: () => {}
      } as unknown as VideoWebSocketServer;
      console.log('VideosRouter: mock wsServer created for testing');
    }
    
    this.router = express.Router();
    console.log('VideosRouter: router created', typeof this.router, this.router);
    console.log('VideosRouter: router methods available:', Object.keys(this.router));

    try {
      this.setupRoutes();
      console.log('VideosRouter: after setupRoutes', typeof this.router, this.router);
      console.log('VideosRouter: router methods after setup:', Object.keys(this.router));
    } catch (error) {
      console.error('VideosRouter: Error in setupRoutes:', error);
      console.error('VideosRouter: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  private setupRoutes() {
    /**
     * @swagger
     * /videos/batch:
     *   post:
     *     summary: Process multiple videos in batch
     *     description: Submit multiple video creation requests in a single batch operation
     *     tags: [videos]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/BatchRequest'
     *     responses:
     *       207:
     *         description: Multi-status response with individual request results
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/BatchResponse'
     *       400:
     *         description: Bad request - invalid input
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       500:
     *         description: Internal server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.post(
      "/batch",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { requests } = req.body;

          if (!Array.isArray(requests)) {
            res.status(400).json({
              error: "Validation failed",
              message: "requests must be an array",
            });
            return;
          }

          if (requests.length === 0) {
            res.status(400).json({
              error: "Validation failed",
              message: "requests array cannot be empty",
            });
            return;
          }

          if (requests.length > 100) {
            res.status(400).json({
              error: "Validation failed",
              message: "Maximum 100 requests allowed per batch",
            });
            return;
          }

          const results = [];
          for (const request of requests) {
            try {
              const input = validateCreateShortInput(request);
              const videoId = this.shortCreator.addToQueue(
                input.scenes,
                input.config
              );
              
              // Initialize video tracking with scenes count and original data
              const scenesCount = input.scenes?.length || 0;
              this.videoTracker.initializeVideo(videoId, scenesCount, input.scenes, input.config);
              
              // Set additional metadata manually
              const metadata = this.videoTracker.getMetadata(videoId);
              if (metadata) {
                // Add any additional metadata fields needed
                // The metadata structure is already set by initializeVideo
              }

              // Add to queue for processing
              await this.videoQueue.addJob(videoId, input.scenes, input.config);

              results.push({ success: true, videoId, status: "queued" });
            } catch (error: unknown) {
              results.push({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              });
            }
          }

          res.status(207).json({
            batchId: `batch_${Date.now()}`,
            total: requests.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results,
          });
        } catch (error: unknown) {
          logger.error(error, "Error processing batch request");
          res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    );

    /**
     * @swagger
     * /videos/{videoId}/status:
     *   get:
     *     summary: Get video status
     *     description: Retrieve the current status of a video
     *     tags: [videos]
     *     parameters:
     *       - in: path
     *         name: videoId
     *         required: true
     *         schema:
     *           type: string
     *         description: The video ID
     *     responses:
     *       200:
     *         description: Video status retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/VideoStatus'
     *       400:
     *         description: Bad request - missing videoId
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       404:
     *         description: Video not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.get(
      "/:videoId/status",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        const status = this.shortCreator.status(videoId);
        res.status(200).json({
          videoId,
          status,
          timestamp: new Date().toISOString(),
        });
      }
    );

    /**
     * @swagger
     * /videos/{videoId}/progress:
     *   get:
     *     summary: Get detailed video progress
     *     description: Retrieve detailed progress information for a video including current step and estimated time remaining
     *     tags: [videos]
     *     parameters:
     *       - in: path
     *         name: videoId
     *         required: true
     *         schema:
     *           type: string
     *         description: The video ID
     *     responses:
     *       200:
     *         description: Video progress retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/VideoProgress'
     *       400:
     *         description: Bad request - missing videoId
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       404:
     *         description: Video not found or not being tracked
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.get(
      "/:videoId/progress",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        const progress = this.videoTracker.getProgress(videoId);
        if (!progress) {
          res.status(404).json({
            error: "Video not found or not being tracked",
          });
          return;
        }

        res.status(200).json(progress);
      }
    );

    /**
     * @swagger
     * /videos/{videoId}/metadata:
     *   get:
     *     summary: Get video metadata
     *     description: Retrieve metadata for a specific video including scenes and configuration
     *     tags: [videos]
     *     parameters:
     *       - in: path
     *         name: videoId
     *         required: true
     *         schema:
     *           type: string
     *         description: The video ID
     *     responses:
     *       200:
     *         description: Video metadata retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 videoId:
     *                   type: string
     *                 scenes:
     *                   type: array
     *                   items:
     *                     $ref: '#/components/schemas/VideoRequest/properties/scenes/items'
     *                 config:
     *                   $ref: '#/components/schemas/VideoRequest/properties/config'
     *                 createdAt:
     *                   type: string
     *                   format: date-time
     *                 updatedAt:
     *                   type: string
     *                   format: date-time
     *       400:
     *         description: Bad request - missing videoId
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       404:
     *         description: Video metadata not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.get(
      "/:videoId/metadata",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        const metadata = this.videoTracker.getMetadata(videoId);
        if (!metadata) {
          res.status(404).json({
            error: "Video metadata not found",
          });
          return;
        }

        res.status(200).json(metadata);
      }
    );

    /**
     * @swagger
     * /videos:
     *   get:
     *     summary: List all videos with enhanced status
     *     description: Retrieve a list of all videos with their current status and counts by status
     *     tags: [videos]
     *     responses:
     *       200:
     *         description: List of videos retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 videos:
     *                   type: array
     *                   items:
     *                     $ref: '#/components/schemas/VideoStatus'
     *                 total:
     *                   type: number
     *                 processing:
     *                   type: number
     *                 ready:
     *                   type: number
     *                 failed:
     *                   type: number
     */
    this.router.get("/", (req: ExpressRequest, res: ExpressResponse) => {
      const metadata = this.videoTracker.getAllMetadata();
      const videos = metadata.map(m => ({ id: m.id, status: m.status }));
      res.status(200).json({
        videos,
        total: videos.length,
        processing: videos.filter(v => v.status === "processing").length,
        ready: videos.filter(v => v.status === "ready").length,
        failed: videos.filter(v => v.status === "failed").length,
      });
    });

    /**
     * @swagger
     * /videos/metadata/all:
     *   get:
     *     summary: List all videos with detailed metadata
     *     description: Retrieve a list of all videos with complete metadata including scenes and configuration
     *     tags: [videos]
     *     responses:
     *       200:
     *         description: List of videos with metadata retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 videos:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       videoId:
     *                         type: string
     *                       status:
     *                         type: string
     *                       scenes:
     *                         type: array
     *                         items:
     *                           $ref: '#/components/schemas/VideoRequest/properties/scenes/items'
     *                       config:
     *                         $ref: '#/components/schemas/VideoRequest/properties/config'
     *                       createdAt:
     *                         type: string
     *                         format: date-time
     *                       updatedAt:
     *                         type: string
     *                         format: date-time
     *                 total:
     *                   type: number
     *                 processing:
     *                   type: number
     *                 ready:
     *                   type: number
     *                 failed:
     *                   type: number
     */
    this.router.get(
      "/metadata/all",
      (req: ExpressRequest, res: ExpressResponse) => {
        const metadata = this.videoTracker.getAllMetadata();
        res.status(200).json({
          videos: metadata,
          total: metadata.length,
          processing: metadata.filter(v => v.status === "processing").length,
          ready: metadata.filter(v => v.status === "ready").length,
          failed: metadata.filter(v => v.status === "failed").length,
        });
      }
    );

    /**
     * @swagger
     * /videos/{videoId}/ws:
     *   get:
     *     summary: WebSocket connection for real-time updates
     *     description: Establish a WebSocket connection for receiving real-time progress updates for a specific video
     *     tags: [videos]
     *     parameters:
     *       - in: path
     *         name: videoId
     *         required: true
     *         schema:
     *           type: string
     *         description: The video ID
     *     responses:
     *       101:
     *         description: Switching Protocols - WebSocket connection established
     *       400:
     *         description: Bad request - missing videoId
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.get(
      "/:videoId/ws",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        // Upgrade to WebSocket connection - handled by VideoWebSocketServer's attachToServer
        // The WebSocket server will automatically handle the connection and subscription
        res.status(101).end(); // Switching Protocols

        res.status(101).end(); // Switching Protocols
      }
    );

    /**
     * @swagger
     * /videos/{videoId}/cancel:
     *   post:
     *     summary: Cancel video processing
     *     description: Cancel a video that is currently being processed or queued
     *     tags: [videos]
     *     parameters:
     *       - in: path
     *         name: videoId
     *         required: true
     *         schema:
     *           type: string
     *         description: The video ID to cancel
     *     responses:
     *       200:
     *         description: Video processing cancelled successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *       400:
     *         description: Bad request - missing videoId
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       404:
     *         description: Video not found in queue or already completed
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       500:
     *         description: Failed to cancel video processing
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.post(
      "/:videoId/cancel",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        try {
          const success = await this.videoQueue.cancelJob(videoId);
          if (success) {
            this.videoTracker.updateProgress(videoId, "failed", 100, "cancelled");
            
            // Trigger webhook for cancellation
            this.webhookService.triggerWebhook("video.cancelled", videoId, {
              videoId,
              status: "cancelled",
              timestamp: new Date().toISOString()
            });

            res.status(200).json({
              success: true,
              message: "Video processing cancelled successfully"
            });
          } else {
            res.status(404).json({
              error: "Video not found in queue or already completed"
            });
          }
        } catch (error: unknown) {
          logger.error(error, "Error cancelling video processing");
          res.status(500).json({
            error: "Failed to cancel video processing",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    );

    /**
     * @swagger
     * /videos/{videoId}/retry:
     *   post:
     *     summary: Retry failed video
     *     description: Retry processing a video that previously failed
     *     tags: [videos]
     *     parameters:
     *       - in: path
     *         name: videoId
     *         required: true
     *         schema:
     *           type: string
     *         description: The video ID to retry
     *     responses:
     *       200:
     *         description: Video queued for retry successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *                 videoId:
     *                   type: string
     *       400:
     *         description: Bad request - missing videoId or video not in failed state
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       404:
     *         description: Video not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       500:
     *         description: Failed to retry video
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.post(
      "/:videoId/retry",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        try {
          const videoData = this.videoTracker.getMetadata(videoId);
          if (!videoData) {
            res.status(404).json({
              error: "Video not found"
            });
            return;
          }

          if (videoData.status !== "failed") {
            res.status(400).json({
              error: "Video is not in failed state"
            });
            return;
          }

          // Reset status and add to queue
          this.videoTracker.updateProgress(videoId, "queued", 0, "queued");
          
          if (!videoData.scenes || !videoData.config) {
            res.status(400).json({
              error: "Cannot retry video - original scenes or config data not available"
            });
            return;
          }
          
          await this.videoQueue.addJob(videoId, videoData.scenes, videoData.config);

          res.status(200).json({
            success: true,
            message: "Video queued for retry",
            videoId
          });
        } catch (error: unknown) {
          logger.error(error, "Error retrying video");
          res.status(500).json({
            error: "Failed to retry video",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    );
  }
}