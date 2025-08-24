import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Config } from "../../../../config";
import { ShortCreator } from "../../../../short-creator/ShortCreator";
import { WebhookService } from "../../../webhook/WebhookService";
import { VideosRouter } from "../videos";

// Mock dependencies
vi.mock("../../../../short-creator/ShortCreator");
vi.mock("../../../webhook/WebhookService");
vi.mock("../../../queue/VideoQueue");
vi.mock("../../../websocket/VideoWebSocketServer");
vi.mock("../../../../short-creator/VideoTracker");

describe("VideosRouter API v2", () => {
  let app: express.Application;
  let config: Config;
  let shortCreator: ShortCreator;
  let webhookService: WebhookService;
  let videosRouter: VideosRouter;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    config = {
      port: 3123,
      redisHost: "localhost",
      redisPort: 6379,
    } as Config;

    shortCreator = {
      addToQueue: vi.fn().mockReturnValue("test-video-id"),
      status: vi.fn().mockReturnValue("queued"),
      getVideoProgress: vi.fn().mockReturnValue(null),
      getVideoMetadata: vi.fn().mockReturnValue(null),
      listAllVideos: vi.fn().mockReturnValue([]),
      listAllVideosWithMetadata: vi.fn().mockReturnValue([]),
    } as unknown as ShortCreator;

    webhookService = {
      triggerWebhook: vi.fn(),
    } as unknown as WebhookService;

    videosRouter = new VideosRouter(config, shortCreator, webhookService);
    app.use("/api/v2/videos", videosRouter.router);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v2/videos/batch", () => {
    it("should process batch requests successfully", async () => {
      const batchRequest = {
        requests: [
          {
            scenes: [
              {
                text: "Test scene 1",
                durationMs: 2000,
                imageUrl: "https://example.com/image1.jpg",
              },
            ],
            config: {
              orientation: "portrait",
              music: "random",
              captionPosition: "bottom",
            },
          },
        ],
      };

      const response = await request(app)
        .post("/api/v2/videos/batch")
        .send(batchRequest);

      expect(response.status).toBe(207);
      expect(response.body).toHaveProperty("batchId");
      expect(response.body.total).toBe(1);
      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(0);
      expect(response.body.results[0].success).toBe(true);
      expect(response.body.results[0].videoId).toBe("test-video-id");
    });

    it("should return 400 for empty requests array", async () => {
      const response = await request(app)
        .post("/api/v2/videos/batch")
        .send({ requests: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 400 for too many requests", async () => {
      const requests = Array(101).fill({
        scenes: [{ text: "Test", durationMs: 1000 }],
        config: {},
      });

      const response = await request(app)
        .post("/api/v2/videos/batch")
        .send({ requests });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });
  });

  describe("GET /api/v2/videos/:videoId/status", () => {
    it("should return video status", async () => {
      const response = await request(app).get("/api/v2/videos/test-video-id/status");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        videoId: "test-video-id",
        status: "queued",
        timestamp: expect.any(String),
      });
    });

    it("should return 400 for missing videoId", async () => {
      const response = await request(app).get("/api/v2/videos//status");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("videoId is required");
    });
  });

  describe("GET /api/v2/videos/:videoId/progress", () => {
    it("should return 404 for non-existent video", async () => {
      const response = await request(app).get("/api/v2/videos/non-existent/progress");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Video not found or not being tracked");
    });
  });

  describe("GET /api/v2/videos/:videoId/metadata", () => {
    it("should return 404 for non-existent video metadata", async () => {
      const response = await request(app).get("/api/v2/videos/non-existent/metadata");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Video metadata not found");
    });
  });

  describe("GET /api/v2/videos", () => {
    it("should return empty videos list", async () => {
      const response = await request(app).get("/api/v2/videos");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        videos: [],
        total: 0,
        processing: 0,
        ready: 0,
        failed: 0,
      });
    });
  });

  describe("GET /api/v2/videos/metadata/all", () => {
    it("should return empty metadata list", async () => {
      const response = await request(app).get("/api/v2/videos/metadata/all");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        videos: [],
        total: 0,
        processing: 0,
        ready: 0,
        failed: 0,
      });
    });
  });

  describe("POST /api/v2/videos/:videoId/cancel", () => {
    it("should return 404 for non-existent video cancellation", async () => {
      const response = await request(app).post("/api/v2/videos/non-existent/cancel");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Video not found in queue or already completed");
    });
  });

  describe("POST /api/v2/videos/:videoId/retry", () => {
    it("should return 404 for non-existent video retry", async () => {
      const response = await request(app).post("/api/v2/videos/non-existent/retry");

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Video not found");
    });
  });
});