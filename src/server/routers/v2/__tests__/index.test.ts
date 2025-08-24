import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { Config } from "../../../../config";
import { ShortCreator } from "../../../../short-creator/ShortCreator";
import { WebhookService } from "../../../webhook/WebhookService";
import { APIV2Router } from "../index";

// Mock dependencies
vi.mock("../../../../short-creator/ShortCreator");
vi.mock("../../../webhook/WebhookService");
vi.mock("../videos");
vi.mock("../webhooks");

describe("APIV2Router", () => {
  let app: express.Application;
  let config: Config;
  let shortCreator: ShortCreator;
  let webhookService: WebhookService;
  let apiV2Router: APIV2Router;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    config = {
      port: 3123,
    } as Config;

    shortCreator = {} as ShortCreator;
    webhookService = {} as WebhookService;

    apiV2Router = new APIV2Router(config, shortCreator);
    app.use("/api/v2", apiV2Router.router);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v2/health", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/api/v2/health");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: "ok",
        version: "v2",
        timestamp: expect.any(String),
      });
    });
  });

  describe("GET /api/v2/version", () => {
    it("should return version information", async () => {
      const response = await request(app).get("/api/v2/version");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        version: "2.0.0",
        api: "Short Video Maker API v2",
        features: expect.any(Array),
      });
      expect(response.body.features).toContain("Batch video processing");
      expect(response.body.features).toContain("Real-time status updates");
      expect(response.body.features).toContain("Webhook notifications");
      expect(response.body.features).toContain("Enhanced queue system");
    });
  });

  describe("Router mounting", () => {
    it("should mount videos router", async () => {
      const response = await request(app).get("/api/v2/videos");
      // Should not return 404, which means the router is mounted
      expect(response.status).not.toBe(404);
    });

    it("should mount webhooks router", async () => {
      const response = await request(app).get("/api/v2/webhooks");
      // Should not return 404, which means the router is mounted
      expect(response.status).not.toBe(404);
    });
  });
});