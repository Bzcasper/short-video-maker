import swaggerJSDoc from "swagger-jsdoc";
import { Config } from "../config";

export function createSwaggerSpec(config: Config) {
  const options: swaggerJSDoc.Options = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Short Video Maker API",
        version: "2.0.0",
        description: "API for creating short videos for TikTok, Instagram Reels, and YouTube Shorts",
        contact: {
          name: "API Support",
          url: "https://github.com/gyoridavid/short-video-maker/issues",
        },
        license: {
          name: "MIT",
          url: "https://opensource.org/licenses/MIT",
        },
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: "Development server",
        },
        {
          url: "https://your-production-domain.com",
          description: "Production server",
        },
      ],
      tags: [
        {
          name: "videos",
          description: "Video creation and management operations",
        },
        {
          name: "webhooks",
          description: "Webhook configuration and management",
        },
        {
          name: "health",
          description: "Health check and system status",
        },
      ],
      components: {
        schemas: {
          ErrorResponse: {
            type: "object",
            properties: {
              error: {
                type: "string",
                description: "Error message",
              },
              message: {
                type: "string",
                description: "Detailed error description",
              },
            },
          },
          VideoRequest: {
            type: "object",
            required: ["scenes", "config"],
            properties: {
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description: "Text to display in the scene",
                    },
                    durationMs: {
                      type: "number",
                      description: "Duration of the scene in milliseconds",
                    },
                    imageUrl: {
                      type: "string",
                      description: "URL of the background image",
                    },
                  },
                },
              },
              config: {
                type: "object",
                properties: {
                  orientation: {
                    type: "string",
                    enum: ["portrait", "landscape"],
                    description: "Video orientation",
                  },
                  music: {
                    type: "string",
                    description: "Background music mood",
                  },
                  captionPosition: {
                    type: "string",
                    enum: ["top", "center", "bottom"],
                    description: "Caption position",
                  },
                  captionBackgroundColor: {
                    type: "string",
                    description: "Caption background color",
                  },
                  voice: {
                    type: "string",
                    description: "Kokoro voice",
                  },
                  musicVolume: {
                    type: "string",
                    enum: ["low", "medium", "high", "muted"],
                    description: "Music volume level",
                  },
                },
              },
            },
          },
          BatchRequest: {
            type: "object",
            required: ["requests"],
            properties: {
              requests: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/VideoRequest",
                },
                description: "Array of video creation requests",
              },
            },
          },
          BatchResponse: {
            type: "object",
            properties: {
              batchId: {
                type: "string",
                description: "Unique identifier for the batch",
              },
              total: {
                type: "number",
                description: "Total number of requests in the batch",
              },
              successful: {
                type: "number",
                description: "Number of successful requests",
              },
              failed: {
                type: "number",
                description: "Number of failed requests",
              },
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    success: {
                      type: "boolean",
                      description: "Whether the request was successful",
                    },
                    videoId: {
                      type: "string",
                      description: "Video ID (if successful)",
                    },
                    status: {
                      type: "string",
                      description: "Status of the video",
                    },
                    error: {
                      type: "string",
                      description: "Error message (if failed)",
                    },
                  },
                },
              },
            },
          },
          VideoStatus: {
            type: "object",
            properties: {
              videoId: {
                type: "string",
                description: "Unique video identifier",
              },
              status: {
                type: "string",
                enum: ["queued", "processing", "ready", "failed", "cancelled"],
                description: "Current status of the video",
              },
              timestamp: {
                type: "string",
                format: "date-time",
                description: "Timestamp of the status check",
              },
            },
          },
          VideoProgress: {
            type: "object",
            properties: {
              videoId: {
                type: "string",
                description: "Unique video identifier",
              },
              status: {
                type: "string",
                enum: ["queued", "processing", "ready", "failed", "cancelled"],
                description: "Current status of the video",
              },
              progress: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Progress percentage (0-100)",
              },
              estimatedTimeRemaining: {
                type: "number",
                description: "Estimated time remaining in seconds (null if unknown)",
                nullable: true,
              },
              currentStep: {
                type: "string",
                description: "Current processing step",
              },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "Step name",
                    },
                    startedAt: {
                      type: "string",
                      format: "date-time",
                      description: "When the step started",
                    },
                    completedAt: {
                      type: "string",
                      format: "date-time",
                      description: "When the step completed (null if not completed)",
                      nullable: true,
                    },
                  },
                },
              },
              createdAt: {
                type: "string",
                format: "date-time",
                description: "When the video was created",
              },
              updatedAt: {
                type: "string",
                format: "date-time",
                description: "When the video was last updated",
              },
            },
          },
          WebhookConfig: {
            type: "object",
            required: ["url", "secret", "events"],
            properties: {
              url: {
                type: "string",
                format: "uri",
                description: "Webhook endpoint URL",
              },
              secret: {
                type: "string",
                description: "Secret for HMAC signature verification",
              },
              events: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["video.completed", "video.failed", "video.progress"],
                },
                description: "Events to subscribe to",
              },
              enabled: {
                type: "boolean",
                default: true,
                description: "Whether the webhook is enabled",
              },
            },
          },
          WebhookResponse: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Webhook ID",
              },
              url: {
                type: "string",
                format: "uri",
                description: "Webhook endpoint URL",
              },
              secret: {
                type: "string",
                description: "Secret for HMAC signature verification",
              },
              events: {
                type: "array",
                items: {
                  type: "string",
                },
                description: "Events to subscribe to",
              },
              enabled: {
                type: "boolean",
                description: "Whether the webhook is enabled",
              },
            },
          },
        },
        securitySchemes: {
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
            description: "API key for authentication",
          },
        },
      },
      security: [
        {
          ApiKeyAuth: [],
        },
      ],
    },
    apis: [
      "./src/server/routers/**/*.ts",
      "./src/server/routers/v2/**/*.ts",
    ],
  };

  return swaggerJSDoc(options);
}