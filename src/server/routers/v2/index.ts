import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { Config } from "../../../config";
import { ShortCreator } from "../../../short-creator/ShortCreator";
import { WebhookService } from "../../webhook/WebhookService";
import { logger } from "../../../logger";
import { VideosRouter } from "./videos";
import { WebhooksRouter } from "./webhooks";

export class APIV2Router {
  public router: express.Router;
  private videosRouter: VideosRouter;
  private webhooksRouter: WebhooksRouter;
  private webhookService: WebhookService;

  constructor(config: Config, shortCreator: ShortCreator) {
    this.router = express.Router();
    this.webhookService = new WebhookService();
    this.videosRouter = new VideosRouter(config, shortCreator, this.webhookService);
    this.webhooksRouter = new WebhooksRouter(this.webhookService);

    this.router.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    /**
     * @swagger
     * /health:
     *   get:
     *     summary: Health check
     *     description: Check the health status of the API v2 service
     *     tags: [health]
     *     responses:
     *       200:
     *         description: Service is healthy
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status:
     *                   type: string
     *                   example: "ok"
     *                 version:
     *                   type: string
     *                   example: "v2"
     *                 timestamp:
     *                   type: string
     *                   format: date-time
     */
    this.router.get("/health", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json({ 
        status: "ok", 
        version: "v2",
        timestamp: new Date().toISOString()
      });
    });

    // Mount videos router
    this.router.use("/videos", this.videosRouter.router);

    // Mount webhooks router
    this.router.use("/webhooks", this.webhooksRouter.router);

    /**
     * @swagger
     * /version:
     *   get:
     *     summary: API version information
     *     description: Get information about the API v2 version and features
     *     tags: [health]
     *     responses:
     *       200:
     *         description: Version information retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 version:
     *                   type: string
     *                   example: "2.0.0"
     *                 api:
     *                   type: string
     *                   example: "Short Video Maker API v2"
     *                 features:
     *                   type: array
     *                   items:
     *                     type: string
     *                   example: ["Batch video processing", "Real-time status updates", "Webhook notifications", "Enhanced queue system"]
     */
    this.router.get("/version", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json({
        version: "2.0.0",
        api: "Short Video Maker API v2",
        features: [
          "Batch video processing",
          "Real-time status updates",
          "Webhook notifications",
          "Enhanced queue system"
        ]
      });
    });
  }
}