import crypto from "crypto";
import axios from "axios";
import { logger } from "../../logger";

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
}

export interface WebhookPayload {
  event: string;
  videoId: string;
  timestamp: string;
  data: any;
}

export class WebhookService {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private retryQueue: Array<{ config: WebhookConfig; payload: WebhookPayload; attempt: number }> = [];

  constructor() {
    // Start retry processor
    this.startRetryProcessor();
  }

  public registerWebhook(id: string, config: WebhookConfig): void {
    this.webhooks.set(id, config);
    logger.info({ webhookId: id, url: config.url }, "Webhook registered");
  }

  public unregisterWebhook(id: string): void {
    this.webhooks.delete(id);
    logger.info({ webhookId: id }, "Webhook unregistered");
  }

  public getWebhook(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  public getAllWebhooks(): Map<string, WebhookConfig> {
    return new Map(this.webhooks);
  }

  public async triggerWebhook(event: string, videoId: string, data: any): Promise<void> {
    const timestamp = new Date().toISOString();
    const payload: WebhookPayload = {
      event,
      videoId,
      timestamp,
      data,
    };

    for (const [id, config] of this.webhooks.entries()) {
      if (config.enabled && config.events.includes(event)) {
        try {
          await this.sendWebhook(config, payload, id);
        } catch (error: unknown) {
          logger.error(
            { webhookId: id, event, videoId, error: error instanceof Error ? error.message : "Unknown error" },
            "Webhook delivery failed, adding to retry queue"
          );
          
          // Add to retry queue
          this.retryQueue.push({
            config,
            payload,
            attempt: 1,
          });
        }
      }
    }
  }

  private async sendWebhook(config: WebhookConfig, payload: WebhookPayload, webhookId: string): Promise<void> {
    const signature = this.generateSignature(JSON.stringify(payload), config.secret);
    
    const headers = {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
      "X-Webhook-Event": payload.event,
      "X-Webhook-Timestamp": payload.timestamp,
      "User-Agent": "Short-Video-Maker/1.0",
    };

    const timeout = 10000; // 10 second timeout

    try {
      const response = await axios.post(config.url, payload, {
        headers,
        timeout,
        validateStatus: (status) => status >= 200 && status < 500,
      });

      if (response.status >= 200 && response.status < 300) {
        logger.info(
          { webhookId, event: payload.event, videoId: payload.videoId, status: response.status },
          "Webhook delivered successfully"
        );
      } else {
        throw new Error(`Webhook delivery failed with status ${response.status}`);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNREFUSED") {
          throw new Error("Webhook endpoint refused connection");
        } else if (error.code === "ETIMEDOUT") {
          throw new Error("Webhook request timed out");
        } else if (error.response) {
          throw new Error(`Webhook delivery failed with status ${error.response.status}`);
        }
      }
      throw error;
    }
  }

  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
  }

  public verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private async startRetryProcessor(): Promise<void> {
    setInterval(async () => {
      if (this.retryQueue.length === 0) return;

      const failedWebhooks: Array<{ config: WebhookConfig; payload: WebhookPayload; attempt: number }> = [];
      
      for (const item of this.retryQueue) {
        try {
          await this.sendWebhook(item.config, item.payload, `retry-${item.attempt}`);
          logger.info(
            { event: item.payload.event, videoId: item.payload.videoId, attempt: item.attempt },
            "Webhook retry successful"
          );
        } catch (error: unknown) {
          if (item.attempt < 5) {
            // Exponential backoff: 1, 2, 4, 8, 16 minutes
            const delay = Math.pow(2, item.attempt - 1) * 60000;
            setTimeout(() => {
              this.retryQueue.push({
                config: item.config,
                payload: item.payload,
                attempt: item.attempt + 1,
              });
            }, delay);
          } else {
            logger.error(
              { event: item.payload.event, videoId: item.payload.videoId, attempt: item.attempt },
              "Webhook delivery failed after maximum retries"
            );
          }
        }
      }

      // Clear the retry queue and add back failed webhooks
      this.retryQueue = failedWebhooks;
    }, 30000); // Check every 30 seconds
  }

  public getRetryQueueSize(): number {
    return this.retryQueue.length;
  }

  public clearRetryQueue(): void {
    this.retryQueue = [];
    logger.info("Webhook retry queue cleared");
  }
}