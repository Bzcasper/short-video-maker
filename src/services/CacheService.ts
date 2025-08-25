import Redis from "ioredis";
import { RedisConnection } from "../server/redis";
import { logger } from "../logger";
import { 
  CacheEntry, 
  CacheConfig, 
  PerformanceMetrics,
  validateCacheEntry,
  validateCacheConfig,
  validatePerformanceMetrics
} from "../schemas/PromptSchema";
import crypto from "crypto";
import zlib from "zlib";
import { promisify } from "util";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  totalMemoryUsage: number;
  averageResponseTime: number;
}

export class CacheService {
  private redis: Redis;
  private config: CacheConfig;
  private stats: CacheStats;
  private performanceMetrics: PerformanceMetrics[] = [];
  private lastCleanup: Date = new Date();
  private readonly CACHE_PREFIX = "svm:cache:";
  private readonly STATS_KEY = "svm:cache:stats";
  private readonly METRICS_KEY = "svm:cache:metrics";

  constructor(config?: Partial<CacheConfig>) {
    this.redis = RedisConnection.getInstance();
    this.config = validateCacheConfig({
      defaultTtl: 3600,
      maxSize: 1000,
      maxMemoryUsage: 100 * 1024 * 1024,
      evictionPolicy: "lru",
      compressionEnabled: true,
      persistToDisk: false,
      metrics: {
        enabled: true,
        reportingInterval: 300
      },
      ...config
    });
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      totalMemoryUsage: 0,
      averageResponseTime: 0
    };

    this.initializeMetricsReporting();
  }

  /**
   * Generate content fingerprint for cache validation
   */
  private generateFingerprint(content: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(content));
    return hash.digest('hex');
  }

  /**
   * Generate cache key with namespace
   */
  private generateCacheKey(key: string): string {
    return `${this.CACHE_PREFIX}${key}`;
  }

  /**
   * Compress data if compression is enabled
   */
  private async compressData(data: string): Promise<Buffer> {
    if (this.config.compressionEnabled) {
      return await gzip(data);
    }
    return Buffer.from(data, 'utf-8');
  }

  /**
   * Decompress data if compression is enabled
   */
  private async decompressData(data: Buffer): Promise<string> {
    if (this.config.compressionEnabled) {
      const decompressed = await gunzip(data);
      return decompressed.toString('utf-8');
    }
    return data.toString('utf-8');
  }

  /**
   * Set cache entry with metadata and optional TTL
   */
  public async set<T>(
    key: string, 
    content: T, 
    ttl?: number,
    tags?: string[],
    dependencies?: string[]
  ): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const fingerprint = this.generateFingerprint(content);
      const expiresAt = new Date(Date.now() + (ttl || this.config.defaultTtl) * 1000);
      
      const cacheEntry: CacheEntry = {
        key,
        content,
        metadata: {
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          accessCount: 0,
          contentType: this.inferContentType(content),
          tags: tags || [],
          fingerprint,
          version: "1.0.0"
        },
        dependencies,
        invalidationTriggers: tags ? [`tag:${tags.join(',')}}`] : undefined
      };

      // Validate entry structure
      const validatedEntry = validateCacheEntry(cacheEntry);
      
      // Serialize and compress data
      const serializedData = JSON.stringify(validatedEntry);
      const compressedData = await this.compressData(serializedData);
      
      // Check memory constraints
      if (compressedData.length > this.config.maxMemoryUsage / this.config.maxSize) {
        logger.warn(`Cache entry too large: ${compressedData.length} bytes for key: ${key}`);
        return false;
      }

      // Set with TTL
      const cacheKey = this.generateCacheKey(key);
      await this.redis.setex(cacheKey, ttl || this.config.defaultTtl, compressedData);
      
      // Update tags index for invalidation
      if (tags && tags.length > 0) {
        await this.updateTagsIndex(tags, key);
      }

      // Update dependencies index
      if (dependencies && dependencies.length > 0) {
        await this.updateDependenciesIndex(key, dependencies);
      }

      // Update stats
      this.stats.sets++;
      this.stats.totalMemoryUsage += compressedData.length;
      this.updateAverageResponseTime(Date.now() - startTime);
      
      logger.debug(`Cache SET: ${key} (${compressedData.length} bytes, TTL: ${ttl || this.config.defaultTtl}s)`);
      return true;
      
    } catch (error) {
      logger.error({ error }, `Cache SET error for key ${key}:`);
      return false;
    }
  }

  /**
   * Get cache entry with automatic decompression and validation
   */
  public async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      const cacheKey = this.generateCacheKey(key);
      const data = await this.redis.getBuffer(cacheKey);
      
      if (!data) {
        this.stats.misses++;
        this.updateAverageResponseTime(Date.now() - startTime);
        return null;
      }

      // Decompress and parse
      const decompressedData = await this.decompressData(data);
      const cacheEntry = JSON.parse(decompressedData) as CacheEntry;
      
      // Validate entry structure
      const validatedEntry = validateCacheEntry(cacheEntry);
      
      // Check expiration
      if (new Date(validatedEntry.metadata.expiresAt) < new Date()) {
        await this.delete(key);
        this.stats.misses++;
        this.updateAverageResponseTime(Date.now() - startTime);
        return null;
      }

      // Verify content integrity
      const currentFingerprint = this.generateFingerprint(validatedEntry.content);
      if (currentFingerprint !== validatedEntry.metadata.fingerprint) {
        logger.warn(`Cache integrity check failed for key: ${key}`);
        await this.delete(key);
        this.stats.misses++;
        return null;
      }

      // Update access metadata
      validatedEntry.metadata.accessCount++;
      validatedEntry.metadata.lastAccessed = new Date().toISOString();
      await this.updateCacheMetadata(key, validatedEntry);

      this.stats.hits++;
      this.updateAverageResponseTime(Date.now() - startTime);
      
      logger.debug(`Cache HIT: ${key} (access count: ${validatedEntry.metadata.accessCount})`);
      return validatedEntry.content as T;
      
    } catch (error) {
      logger.error({ error }, `Cache GET error for key ${key}:`);
      this.stats.misses++;
      this.updateAverageResponseTime(Date.now() - startTime);
      return null;
    }
  }

  /**
   * Check if key exists in cache
   */
  public async exists(key: string): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(key);
      const result = await this.redis.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.error({ error }, `Cache EXISTS error for key ${key}:`);
      return false;
    }
  }

  /**
   * Delete cache entry and cleanup references
   */
  public async delete(key: string): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(key);
      const result = await this.redis.del(cacheKey);
      
      if (result > 0) {
        // Clean up tags and dependencies indices
        await this.cleanupIndices(key);
        this.stats.deletes++;
        logger.debug(`Cache DELETE: ${key}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error({ error }, `Cache DELETE error for key ${key}:`);
      return false;
    }
  }

  /**
   * Invalidate cache entries by tag
   */
  public async invalidateByTag(tag: string): Promise<number> {
    try {
      const tagKey = `${this.CACHE_PREFIX}tags:${tag}`;
      const keys = await this.redis.smembers(tagKey);
      
      if (keys.length === 0) {
        return 0;
      }

      const pipeline = this.redis.pipeline();
      keys.forEach(key => {
        pipeline.del(this.generateCacheKey(key));
      });
      
      const results = await pipeline.exec();
      const invalidatedCount = results?.filter(([err, result]) => !err && result === 1).length || 0;
      
      // Clean up tag index
      await this.redis.del(tagKey);
      
      logger.info(`Cache invalidated ${invalidatedCount} entries for tag: ${tag}`);
      return invalidatedCount;
      
    } catch (error) {
      logger.error({ error }, `Cache invalidation error for tag ${tag}:`);
      return 0;
    }
  }

  /**
   * Invalidate cache entries by dependency
   */
  public async invalidateByDependency(dependency: string): Promise<number> {
    try {
      const depKey = `${this.CACHE_PREFIX}deps:${dependency}`;
      const dependentKeys = await this.redis.smembers(depKey);
      
      if (dependentKeys.length === 0) {
        return 0;
      }

      let invalidatedCount = 0;
      for (const key of dependentKeys) {
        const deleted = await this.delete(key);
        if (deleted) invalidatedCount++;
      }
      
      // Clean up dependency index
      await this.redis.del(depKey);
      
      logger.info(`Cache invalidated ${invalidatedCount} entries for dependency: ${dependency}`);
      return invalidatedCount;
      
    } catch (error) {
      logger.error({ error }, `Cache invalidation error for dependency ${dependency}:`);
      return 0;
    }
  }

  /**
   * Clear all cache entries
   */
  public async clear(): Promise<boolean> {
    try {
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      
      // Reset stats
      this.stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        evictions: 0,
        totalMemoryUsage: 0,
        averageResponseTime: 0
      };
      
      logger.info(`Cache cleared: ${keys.length} keys removed`);
      return true;
      
    } catch (error) {
      logger.error({ error }, "Cache clear error:");
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats & { hitRate: number; missRate: number } {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0
    };
  }

  /**
   * Get cache size and memory usage
   */
  public async getCacheInfo(): Promise<{
    size: number;
    memoryUsage: number;
    oldestEntry?: string;
    newestEntry?: string;
  }> {
    try {
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      const filteredKeys = keys.filter(key => !key.includes(':tags:') && !key.includes(':deps:'));
      
      return {
        size: filteredKeys.length,
        memoryUsage: this.stats.totalMemoryUsage,
        oldestEntry: filteredKeys.length > 0 ? filteredKeys[0].replace(this.CACHE_PREFIX, '') : undefined,
        newestEntry: filteredKeys.length > 0 ? filteredKeys[filteredKeys.length - 1].replace(this.CACHE_PREFIX, '') : undefined
      };
    } catch (error) {
      logger.error({ error }, "Cache info error:");
      return { size: 0, memoryUsage: 0 };
    }
  }

  /**
   * Perform cache cleanup and eviction based on policy
   */
  public async cleanup(): Promise<void> {
    try {
      const now = new Date();
      
      // Skip if cleanup was performed recently
      if (now.getTime() - this.lastCleanup.getTime() < 60000) { // 1 minute
        return;
      }

      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      const cacheKeys = keys.filter(key => !key.includes(':tags:') && !key.includes(':deps:'));
      
      // Remove expired entries
      let expiredCount = 0;
      const pipeline = this.redis.pipeline();
      
      for (const key of cacheKeys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -2) { // Key doesn't exist or expired
          pipeline.del(key);
          expiredCount++;
        }
      }
      
      await pipeline.exec();
      
      // Check size limits and evict if necessary
      const remainingKeys = cacheKeys.length - expiredCount;
      if (remainingKeys > this.config.maxSize) {
        await this.evictEntries(remainingKeys - this.config.maxSize);
      }
      
      this.lastCleanup = now;
      
      if (expiredCount > 0) {
        logger.info(`Cache cleanup: removed ${expiredCount} expired entries`);
      }
      
    } catch (error) {
      logger.error({ error }, "Cache cleanup error:");
    }
  }

  /**
   * Private helper methods
   */
  private inferContentType(content: any): "script" | "prompt" | "template" | "validation_result" | "quality_score" {
    if (content?.scenes) return "script";
    if (content?.template) return "template";
    if (content?.overallScore) return "validation_result";
    if (typeof content === "number") return "quality_score";
    return "prompt";
  }

  private async updateTagsIndex(tags: string[], key: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    tags.forEach(tag => {
      const tagKey = `${this.CACHE_PREFIX}tags:${tag}`;
      pipeline.sadd(tagKey, key);
      pipeline.expire(tagKey, this.config.defaultTtl * 2); // Tags index lives longer
    });
    await pipeline.exec();
  }

  private async updateDependenciesIndex(key: string, dependencies: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    dependencies.forEach(dep => {
      const depKey = `${this.CACHE_PREFIX}deps:${dep}`;
      pipeline.sadd(depKey, key);
      pipeline.expire(depKey, this.config.defaultTtl * 2);
    });
    await pipeline.exec();
  }

  private async updateCacheMetadata(key: string, entry: CacheEntry): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key);
      const serializedData = JSON.stringify(entry);
      const compressedData = await this.compressData(serializedData);
      
      const ttl = await this.redis.ttl(cacheKey);
      if (ttl > 0) {
        await this.redis.setex(cacheKey, ttl, compressedData);
      }
    } catch (error) {
      logger.error({ error }, `Failed to update cache metadata for key ${key}:`);
    }
  }

  private async cleanupIndices(key: string): Promise<void> {
    // This would require knowing which tags/dependencies the key was associated with
    // In a production system, you might want to store this info separately
    // For now, we'll skip cleanup of indices
  }

  private updateAverageResponseTime(responseTime: number): void {
    const totalRequests = this.stats.hits + this.stats.misses + this.stats.sets;
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
  }

  private async evictEntries(count: number): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      const cacheKeys = keys.filter(key => !key.includes(':tags:') && !key.includes(':deps:'));
      
      // Simple LRU eviction - in production you might want more sophisticated logic
      const keysToEvict = cacheKeys.slice(0, count);
      
      if (keysToEvict.length > 0) {
        await this.redis.del(...keysToEvict);
        this.stats.evictions += keysToEvict.length;
        logger.info(`Cache evicted ${keysToEvict.length} entries`);
      }
    } catch (error) {
      logger.error({ error }, "Cache eviction error:");
    }
  }

  private initializeMetricsReporting(): void {
    if (this.config.metrics?.enabled) {
      const interval = (this.config.metrics.reportingInterval || 300) * 1000;
      setInterval(() => {
        this.collectPerformanceMetrics();
      }, interval);
    }
  }

  private async collectPerformanceMetrics(): Promise<void> {
    try {
      const stats = this.getStats();
      const cacheInfo = await this.getCacheInfo();
      
      const metrics: PerformanceMetrics = {
        timestamp: new Date().toISOString(),
        metrics: {
          cache: {
            hitRate: stats.hitRate,
            missRate: stats.missRate,
            totalRequests: stats.hits + stats.misses,
            averageResponseTime: stats.averageResponseTime,
            storageUsage: cacheInfo.memoryUsage,
            evictions: stats.evictions
          },
          scriptGeneration: {
            totalRequests: 0, // Would be populated by ScriptGeneratorService
            successRate: 0,
            averageProcessingTime: 0,
            qualityScoreAverage: 0,
            retryRate: 0
          },
          templates: {
            totalTemplates: 0, // Would be populated by PromptTemplateService
            activeTemplates: 0,
            averageUsage: 0,
            topPerforming: []
          }
        },
        period: {
          start: new Date(Date.now() - (this.config.metrics?.reportingInterval || 300) * 1000).toISOString(),
          end: new Date().toISOString(),
          intervalType: "hourly"
        }
      };

      // Store metrics (could also send to monitoring system)
      await this.redis.lpush(this.METRICS_KEY, JSON.stringify(metrics));
      await this.redis.ltrim(this.METRICS_KEY, 0, 100); // Keep last 100 metrics
      
    } catch (error) {
      logger.error({ error }, "Failed to collect performance metrics:");
    }
  }
}