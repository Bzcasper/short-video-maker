import http from "http";
import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { ShortCreator } from "../short-creator/ShortCreator";
import { APIRouter } from "./routers/rest";
import { MCPRouter } from "./routers/mcp";
import { APIV2Router } from "./routers/v2";
import { RedisConnection } from "./redis";
import { VideoQueue } from "./queue/VideoQueue";
import { VideoWebSocketServer } from "./websocket/VideoWebSocketServer";
import { logger } from "../logger";
import { Config } from "../config";
import { createSwaggerSpec } from "./swagger";

export class Server {
  private app: express.Application;
  private config: Config;
  private videoQueue?: VideoQueue;
  private webSocketServer?: VideoWebSocketServer;

  constructor(config: Config, shortCreator: ShortCreator) {
    this.config = config;
    this.app = express();

    // Initialize Redis connection
    RedisConnection.initialize(config);

    // Initialize video queue
    this.videoQueue = new VideoQueue(shortCreator);

    // Initialize WebSocket server for real-time updates
    this.webSocketServer = new VideoWebSocketServer(config, shortCreator.getVideoTracker());
    this.webSocketServer.attachToServer(this.app);

    // add healthcheck endpoint
    this.app.get("/health", async (req: ExpressRequest, res: ExpressResponse) => {
      const redisHealthy = await RedisConnection.healthCheck();
      res.status(200).json({
        status: "ok",
        redis: redisHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString()
      });
    });

    // Add queue status endpoint
    this.app.get("/health/queue", async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const counts = await this.videoQueue?.getJobCounts();
        res.status(200).json({
          status: "ok",
          queue: counts || { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0 },
          timestamp: new Date().toISOString()
        });
      } catch (error: unknown) {
        logger.error(error, "Error getting queue status");
        res.status(500).json({
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    });

    const apiRouter = new APIRouter(config, shortCreator);
    const apiV2Router = new APIV2Router(config, shortCreator);
    const mcpRouter = new MCPRouter(shortCreator);
    this.app.use("/api", apiRouter.router);
    this.app.use("/api/v2", apiV2Router.router);
    this.app.use("/mcp", mcpRouter.router);

    // Swagger documentation
    const swaggerSpec = createSwaggerSpec(config);
    this.app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: "Short Video Maker API Documentation",
    }));

    // Serve static files from the UI build
    this.app.use(express.static(path.join(__dirname, "../../dist/ui")));
    this.app.use(
      "/static",
      express.static(path.join(__dirname, "../../static")),
    );

    // Serve the React app for all other routes (must be last)
    this.app.get("*", (req: ExpressRequest, res: ExpressResponse) => {
      res.sendFile(path.join(__dirname, "../../dist/ui/index.html"));
    });
  }

  public start(): http.Server {
    const server = this.app.listen(this.config.port, () => {
      logger.info(
        {
          port: this.config.port,
          mcp: "/mcp",
          api: "/api",
          apiV2: "/api/v2",
          docs: "/api-docs"
        },
        "MCP and API servers are running",
      );
      logger.info(
        `UI server is running on http://localhost:${this.config.port}`,
      );
    });

    server.on("error", (error: Error) => {
      logger.error(error, "Error starting server");
    });

    return server;
  }

  public getApp() {
    return this.app;
  }

  public getVideoQueue(): VideoQueue | undefined {
    return this.videoQueue;
  }

  public getWebSocketServer(): VideoWebSocketServer | undefined {
    return this.webSocketServer;
  }
}
