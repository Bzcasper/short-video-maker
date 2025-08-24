import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { WebhookService } from "../../../webhook/WebhookService";
import { WebhooksRouter } from "../webhooks";

// Mock dependencies
vi.mock("../../../webhook/WebhookService");

describe("WebhooksRouter API v2", () => {
  let app: express.Application;
  let webhookService: WebhookService;
  let webhooksRouter: WebhooksRouter;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    webhookService = {
      getAllWebhooks: vi.fn().mockReturnValue(new Map()),
      getWebhook: vi.fn().mockReturnValue(null),
      registerWebhook: vi.fn(),
      unregisterWebhook: vi.fn(),
      triggerWebhook: vi.fn(),
      getRetryQueueSize: vi.fn().mockReturnValue(0),
      clearRetryQueue: vi.fn(),
    } as unknown as WebhookService;

    webhooksRouter = new WebhooksRouter(webhookService);
    app.use("/api/v2/webhooks", webhooksRouter.router);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v2/webhooks", () => {
    it("should return empty webhooks list", async () => {
      const response = await request(app).get("/api/v2/webhooks");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        webhooks: {},
        total: 0,
      });
    });
  });

  describe("GET /api/v2/webhooks/:id", () => {
    it("should return 404 for non-existent webhook", async () => {
      const response = await request(app).get("/api/v2/webhooks/non-existent");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Webhook not found");
    });
  });

  describe("POST /api/v2/webhooks", () => {
    it("should create a new webhook successfully", async () => {
      const webhookConfig = {
        url: "https://example.com/webhook",
        secret: "test-secret",
        events: ["video.completed", "video.failed"],
        enabled: true,
      };

      const response = await request(app)
        .post("/api/v2/webhooks")
        .send(webhookConfig);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: expect.any(String),
        url: webhookConfig.url,
        secret: webhookConfig.secret,
        events: webhookConfig.events,
        enabled: webhookConfig.enabled,
      });
    });

    it("should return 400 for missing required fields", async () => {
      const response = await request(app)
        .post("/api/v2/webhooks")
        .send({ url: "https://example.com" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Missing required fields: url, secret, events");
    });

    it("should return 400 for invalid events", async () => {
      const webhookConfig = {
        url: "https://example.com/webhook",
        secret: "test-secret",
        events: ["invalid.event"],
        enabled: true,
      };

      const response = await request(app)
        .post("/api/v2/webhooks")
        .send(webhookConfig);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Invalid events");
    });
  });

  describe("PUT /api/v2/webhooks/:id", () => {
    it("should return 404 for non-existent webhook update", async () => {
      const updateConfig = {
        url: "https://example.com/updated",
        secret: "new-secret",
        events: ["video.completed"],
      };

      const response = await request(app)
        .put("/api/v2/webhooks/non-existent")
        .send(updateConfig);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Webhook not found");
    });
  });

  describe("DELETE /api/v2/webhooks/:id", () => {
    it("should return 404 for non-existent webhook deletion", async () => {
      const response = await request(app).delete("/api/v2/webhooks/non-existent");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Webhook not found");
    });
  });

  describe("POST /api/v2/webhooks/:id/test", () => {
    it("should return 404 for non-existent webhook test", async () => {
      const response = await request(app).post("/api/v2/webhooks/non-existent/test");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Webhook not found");
    });
  });

  describe("GET /api/v2/webhooks/status/retry-queue", () => {
    it("should return retry queue status", async () => {
      (webhookService.getRetryQueueSize as vi.Mock).mockReturnValue(5);

      const response = await request(app).get("/api/v2/webhooks/status/retry-queue");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        retryQueueSize: 5,
        message: "There are 5 webhook(s) in retry queue",
      });
    });

    it("should return empty retry queue message", async () => {
      (webhookService.getRetryQueueSize as vi.Mock).mockReturnValue(0);

      const response = await request(app).get("/api/v2/webhooks/status/retry-queue");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        retryQueueSize: 0,
        message: "No webhooks in retry queue",
      });
    });
  });

  describe("DELETE /api/v2/webhooks/status/retry-queue", () => {
    it("should clear retry queue", async () => {
      const response = await request(app).delete("/api/v2/webhooks/status/retry-queue");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "Retry queue cleared successfully",
      });
      expect(webhookService.clearRetryQueue).toHaveBeenCalled();
    });
  });
});