import Redis from "ioredis";
import { Config } from "../config";
import { logger } from "../logger";

export class RedisConnection {
  private static instance: Redis;
  private static config: Config;

  public static initialize(config: Config): void {
    RedisConnection.config = config;
    
    const redisOptions: any = {
      host: config.redisHost,
      port: config.redisPort,
      db: config.redisDb,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        logger.warn({ times, delay }, "Redis connection failed, retrying...");
        return delay;
      },
      maxRetriesPerRequest: 3,
    };

    if (config.redisPassword) {
      redisOptions.password = config.redisPassword;
    }

    RedisConnection.instance = new Redis(redisOptions);

    RedisConnection.instance.on("connect", () => {
      logger.info(
        { host: config.redisHost, port: config.redisPort },
        "Redis connected successfully"
      );
    });

    RedisConnection.instance.on("error", (error: Error) => {
      logger.error(error, "Redis connection error");
    });

    RedisConnection.instance.on("close", () => {
      logger.warn("Redis connection closed");
    });

    RedisConnection.instance.on("reconnecting", () => {
      logger.info("Redis reconnecting...");
    });
  }

  public static getInstance(): Redis {
    if (!RedisConnection.instance) {
      throw new Error("Redis connection not initialized. Call initialize() first.");
    }
    return RedisConnection.instance;
  }

  public static async disconnect(): Promise<void> {
    if (RedisConnection.instance) {
      await RedisConnection.instance.quit();
      logger.info("Redis connection disconnected");
    }
  }

  public static async healthCheck(): Promise<boolean> {
    try {
      if (!RedisConnection.instance) {
        return false;
      }
      await RedisConnection.instance.ping();
      return true;
    } catch (error) {
      logger.error(error, "Redis health check failed");
      return false;
    }
  }
}