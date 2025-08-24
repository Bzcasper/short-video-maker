import WebSocket, { WebSocketServer } from "ws";
import { logger } from "../../logger";
import { VideoTracker } from "../../short-creator/VideoTracker";
import { Config } from "../../config";

interface WebSocketClient {
  ws: WebSocket;
  videoId?: string;
  subscribedToAll: boolean;
}

export class VideoWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocketClient> = new Set();
  private videoTracker: VideoTracker;

  constructor(config: Config, videoTracker: VideoTracker) {
    this.videoTracker = videoTracker;
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on("connection", (ws: WebSocket) => {
      const client: WebSocketClient = { ws, subscribedToAll: false };
      this.clients.add(client);

      ws.on("message", (message: string) => {
        this.handleMessage(client, message);
      });

      ws.on("close", () => {
        this.clients.delete(client);
        logger.debug("WebSocket client disconnected");
      });

      ws.on("error", (error: Error) => {
        logger.error(error, "WebSocket error");
        this.clients.delete(client);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: "connected",
        message: "Connected to video processing WebSocket",
        timestamp: new Date().toISOString()
      }));

      logger.debug("WebSocket client connected");
    });

    // Set up progress tracking updates
    this.setupProgressBroadcasting();
  }

  private handleMessage(client: WebSocketClient, message: string): void {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case "subscribe":
          if (data.videoId === "all") {
            client.subscribedToAll = true;
            client.videoId = undefined;
            client.ws.send(JSON.stringify({
              type: "subscribed",
              videoId: "all",
              message: "Subscribed to all video updates"
            }));
          } else if (data.videoId) {
            client.videoId = data.videoId;
            client.subscribedToAll = false;
            client.ws.send(JSON.stringify({
              type: "subscribed",
              videoId: data.videoId,
              message: `Subscribed to video ${data.videoId} updates`
            }));
          }
          break;

        case "unsubscribe":
          client.videoId = undefined;
          client.subscribedToAll = false;
          client.ws.send(JSON.stringify({
            type: "unsubscribed",
            message: "Unsubscribed from all video updates"
          }));
          break;

        case "ping":
          client.ws.send(JSON.stringify({
            type: "pong",
            timestamp: new Date().toISOString()
          }));
          break;

        default:
          client.ws.send(JSON.stringify({
            type: "error",
            message: "Unknown message type",
            received: data.type
          }));
      }
    } catch (error: unknown) {
      logger.error(error, "Error handling WebSocket message");
      client.ws.send(JSON.stringify({
        type: "error",
        message: "Invalid message format"
      }));
    }
  }

  private setupProgressBroadcasting(): void {
    // This would be called by the VideoTracker when progress updates occur
    // For now, we'll implement a polling mechanism until we integrate with VideoTracker events
    setInterval(() => {
      this.broadcastProgressUpdates();
    }, 1000); // Broadcast updates every second
  }

  private broadcastProgressUpdates(): void {
    const allMetadata = this.videoTracker.getAllMetadata();
    
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          if (client.subscribedToAll) {
            // Send updates for all videos
            client.ws.send(JSON.stringify({
              type: "progress_update",
              videos: allMetadata,
              timestamp: new Date().toISOString()
            }));
          } else if (client.videoId) {
            // Send update for specific video
            const videoMetadata = allMetadata.find(m => m.id === client.videoId);
            if (videoMetadata) {
              client.ws.send(JSON.stringify({
                type: "progress_update",
                video: videoMetadata,
                timestamp: new Date().toISOString()
              }));
            }
          }
        } catch (error: unknown) {
          logger.error(error, "Error broadcasting progress update");
        }
      }
    }
  }

  public broadcastVideoEvent(videoId: string, eventType: string, data: any): void {
    const message = JSON.stringify({
      type: eventType,
      videoId,
      data,
      timestamp: new Date().toISOString()
    });

    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN && 
          (client.subscribedToAll || client.videoId === videoId)) {
        try {
          client.ws.send(message);
        } catch (error: unknown) {
          logger.error(error, "Error broadcasting video event");
        }
      }
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public attachToServer(server: any): void {
    server.on("upgrade", (request: any, socket: any, head: any) => {
      if (request.url === "/ws/videos") {
        this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          this.wss.emit("connection", ws, request);
        });
      }
    });
  }

  public close(): void {
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
    }
    this.wss.close();
    logger.info("WebSocket server closed");
  }
}