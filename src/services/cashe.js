const { redisClient, connectRedis } = require('../config/redis');
const logger = require('../utils/logger');

class CacheService {
  static async ensureConnection() {
    if (!redisClient.isReady) {
      try {
        await connectRedis();
      } catch (error) {
        logger.error('Failed to connect to Redis:', error);
        throw new Error('Redis connection failed');
      }
    }
  }

  static async get(key) {
    await this.ensureConnection();
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Cache get error: ${error.message}`);
      return null;
    }
  }

  static async set(key, value, ttl = 3600) {
    await this.ensureConnection();
    try {
      await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    } catch (error) {
      logger.error(`Cache set error: ${error.message}`);
    }
  }

  static async del(key) {
    await this.ensureConnection();
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error(`Cache delete error: ${error.message}`);
    }
  }
}

module.exports = CacheService;