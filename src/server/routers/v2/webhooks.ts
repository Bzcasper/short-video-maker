import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { WebhookService, WebhookConfig } from "../../webhook/WebhookService";
import { logger } from "../../../logger";

export class WebhooksRouter {
  public router: express.Router;
  private webhookService: WebhookService;

  constructor(webhookService: WebhookService) {
    this.webhookService = webhookService;
    this.router = express.Router();

    this.setupRoutes();
  }

  private setupRoutes() {
    /**
     * @swagger
     * /webhooks:
     *   get:
     *     summary: Get all webhooks
     *     description: Retrieve a list of all configured webhooks
     *     tags: [webhooks]
     *     responses:
     *       200:
     *         description: List of webhooks retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 webhooks:
     *                   type: object
     *                   additionalProperties:
     *                     $ref: '#/components/schemas/WebhookResponse'
     *                 total:
     *                   type: number
     */
    this.router.get("/", (req: ExpressRequest, res: ExpressResponse) => {
      const webhooks = Object.fromEntries(this.webhookService.getAllWebhooks());
      res.status(200).json({
        webhooks,
        total: Object.keys(webhooks).length,
      });
    });

    /**
     * @swagger
     * /webhooks/{id}:
     *   get:
     *     summary: Get specific webhook
     *     description: Retrieve configuration for a specific webhook
     *     tags: [webhooks]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: The webhook ID
     *     responses:
     *       200:
     *         description: Webhook configuration retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/WebhookResponse'
     *       404:
     *         description: Webhook not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.get("/:id", (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      const webhook = this.webhookService.getWebhook(id);
      
      if (!webhook) {
        res.status(404).json({
          error: "Webhook not found",
        });
        return;
      }

      res.status(200).json(webhook);
    });

    /**
     * @swagger
     * /webhooks:
     *   post:
     *     summary: Create new webhook
     *     description: Register a new webhook for receiving video processing events
     *     tags: [webhooks]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/WebhookConfig'
     *     responses:
     *       201:
     *         description: Webhook created successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/WebhookResponse'
     *       400:
     *         description: Bad request - missing required fields or invalid events
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
    this.router.post("/", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { url, secret, events, enabled = true } = req.body;

        if (!url || !secret || !events) {
          res.status(400).json({
            error: "Missing required fields: url, secret, events",
          });
          return;
        }

        if (!Array.isArray(events)) {
          res.status(400).json({
            error: "Events must be an array",
          });
          return;
        }

        const validEvents = ["video.completed", "video.failed", "video.progress"];
        const invalidEvents = events.filter((event: string) => !validEvents.includes(event));
        
        if (invalidEvents.length > 0) {
          res.status(400).json({
            error: `Invalid events: ${invalidEvents.join(", ")}. Valid events are: ${validEvents.join(", ")}`,
          });
          return;
        }

        const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const config: WebhookConfig = {
          url,
          secret,
          events,
          enabled: Boolean(enabled),
        };

        this.webhookService.registerWebhook(webhookId, config);

        res.status(201).json({
          id: webhookId,
          ...config,
        });
      } catch (error: unknown) {
        logger.error(error, "Error creating webhook");
        res.status(500).json({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    /**
     * @swagger
     * /webhooks/{id}:
     *   put:
     *     summary: Update webhook
     *     description: Update configuration for an existing webhook
     *     tags: [webhooks]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: The webhook ID
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/WebhookConfig'
     *     responses:
     *       200:
     *         description: Webhook updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/WebhookResponse'
     *       400:
     *         description: Bad request - invalid configuration
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       404:
     *         description: Webhook not found
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
    this.router.put("/:id", (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const { id } = req.params;
        const { url, secret, events, enabled } = req.body;

        const existingWebhook = this.webhookService.getWebhook(id);
        if (!existingWebhook) {
          res.status(404).json({
            error: "Webhook not found",
          });
          return;
        }

        const config: WebhookConfig = {
          url: url || existingWebhook.url,
          secret: secret || existingWebhook.secret,
          events: events || existingWebhook.events,
          enabled: enabled !== undefined ? Boolean(enabled) : existingWebhook.enabled,
        };

        // Re-register with updated config
        this.webhookService.registerWebhook(id, config);

        res.status(200).json({
          id,
          ...config,
        });
      } catch (error: unknown) {
        logger.error(error, "Error updating webhook");
        res.status(500).json({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    /**
     * @swagger
     * /webhooks/{id}:
     *   delete:
     *     summary: Delete webhook
     *     description: Remove a webhook configuration
     *     tags: [webhooks]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: The webhook ID
     *     responses:
     *       200:
     *         description: Webhook deleted successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *       404:
     *         description: Webhook not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.delete("/:id", (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      
      const webhook = this.webhookService.getWebhook(id);
      if (!webhook) {
        res.status(404).json({
          error: "Webhook not found",
        });
        return;
      }

      this.webhookService.unregisterWebhook(id);
      res.status(200).json({
        success: true,
        message: "Webhook deleted successfully",
      });
    });

    /**
     * @swagger
     * /webhooks/{id}/test:
     *   post:
     *     summary: Test webhook
     *     description: Send a test payload to verify webhook configuration
     *     tags: [webhooks]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: The webhook ID
     *     responses:
     *       200:
     *         description: Test webhook sent successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     *       404:
     *         description: Webhook not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     *       500:
     *         description: Failed to send test webhook
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/ErrorResponse'
     */
    this.router.post("/:id/test", async (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      
      const webhook = this.webhookService.getWebhook(id);
      if (!webhook) {
        res.status(404).json({
          error: "Webhook not found",
        });
        return;
      }

      try {
        // Create a test payload
        const testPayload = {
          event: "test",
          videoId: "test_video_id",
          timestamp: new Date().toISOString(),
          data: {
            message: "This is a test webhook payload",
            status: "success",
          },
        };

        // Use the webhook service to send the test
        await this.webhookService.triggerWebhook("test", "test_video_id", {
          message: "Test webhook payload",
          webhookId: id,
        });

        res.status(200).json({
          success: true,
          message: "Test webhook sent successfully",
        });
      } catch (error: unknown) {
        logger.error(error, "Error testing webhook");
        res.status(500).json({
          error: "Failed to send test webhook",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    /**
     * @swagger
     * /webhooks/status/retry-queue:
     *   get:
     *     summary: Get retry queue status
     *     description: Retrieve the current status of the webhook retry queue
     *     tags: [webhooks]
     *     responses:
     *       200:
     *         description: Retry queue status retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 retryQueueSize:
     *                   type: number
     *                 message:
     *                   type: string
     */
    this.router.get("/status/retry-queue", (req: ExpressRequest, res: ExpressResponse) => {
      const retryQueueSize = this.webhookService.getRetryQueueSize();
      res.status(200).json({
        retryQueueSize,
        message: retryQueueSize > 0 ? 
          `There are ${retryQueueSize} webhook(s) in retry queue` :
          "No webhooks in retry queue",
      });
    });

    /**
     * @swagger
     * /webhooks/status/retry-queue:
     *   delete:
     *     summary: Clear retry queue
     *     description: Clear all webhooks from the retry queue
     *     tags: [webhooks]
     *     responses:
     *       200:
     *         description: Retry queue cleared successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 message:
     *                   type: string
     */
    this.router.delete("/status/retry-queue", (req: ExpressRequest, res: ExpressResponse) => {
      this.webhookService.clearRetryQueue();
      res.status(200).json({
        success: true,
        message: "Retry queue cleared successfully",
      });
    });
  }
}