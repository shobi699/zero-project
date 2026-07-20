import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class QuotaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuotaService.name);
  private redis: Redis | null = null;
  
  // In-memory fallback if Redis is not running
  private fallbackCache = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.logger.log('Successfully connected to Redis');
      });

      this.redis.on('error', (err) => {
        this.logger.warn(`Redis error: ${err.message}. Using in-memory fallback.`);
      });

      this.redis.connect().catch((err) => {
        this.logger.warn(`Redis connection failed: ${err.message}. Using in-memory fallback.`);
        this.redis = null;
      });
    } catch (e) {
      this.logger.warn(`Failed to initialize Redis client. Using in-memory fallback.`);
      this.redis = null;
    }
  }

  private getYearMonthKey(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
  }

  private getRedisKey(userId: string): string {
    return `quota:${userId}:${this.getYearMonthKey()}`;
  }

  async getLimit(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (user && user.subscription === 'smart') {
      // Premium user has unlimited or very high quota (e.g. 24 hours = 86400 seconds)
      return 86400; 
    }

    // Default limit in seconds (30 minutes = 1800 seconds)
    return this.settingsService.getSettingValue<number>('quota.free.monthly_limit_sec', 1800);
  }

  async getUsed(userId: string): Promise<number> {
    const key = this.getRedisKey(userId);

    if (this.redis) {
      try {
        const val = await this.redis.get(key);
        return val ? Number(val) : 0;
      } catch (err: any) {
        this.logger.warn(`Redis get failed: ${err.message}. Using in-memory cache.`);
      }
    }

    return this.fallbackCache.get(key) || 0;
  }

  async checkQuota(userId: string): Promise<boolean> {
    const limit = await this.getLimit(userId);
    const used = await this.getUsed(userId);
    return used < limit;
  }

  async getQuotaStatus(userId: string): Promise<{ limit: number; used: number; remaining: number }> {
    const limit = await this.getLimit(userId);
    const used = await this.getUsed(userId);
    const remaining = Math.max(0, limit - used);

    return {
      limit,
      used,
      remaining,
    };
  }

  async consumeQuota(userId: string, durationSec: number): Promise<number> {
    const key = this.getRedisKey(userId);
    let newUsed = 0;

    if (this.redis) {
      try {
        const res = await this.redis.incrbyfloat(key, durationSec);
        newUsed = Number(res);
        // Set expiry for 35 days so old months automatically expire
        await this.redis.expire(key, 35 * 24 * 60 * 60);
      } catch (err: any) {
        this.logger.warn(`Redis incrbyfloat failed: ${err.message}. Using in-memory cache.`);
        const current = this.fallbackCache.get(key) || 0;
        newUsed = current + durationSec;
        this.fallbackCache.set(key, newUsed);
      }
    } else {
      const current = this.fallbackCache.get(key) || 0;
      newUsed = current + durationSec;
      this.fallbackCache.set(key, newUsed);
    }

    this.logger.log(`User ${userId} consumed ${durationSec}s. New usage: ${newUsed}s`);
    return newUsed;
  }

  async onModuleDestroy() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch (err: any) {
        this.logger.warn(`Failed to close Redis client gracefully: ${err.message}`);
      }
    }
  }
}
