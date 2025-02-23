const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

class QueueService {
  constructor() {
    this.queueKey = 'crawler:queue';
  }

  async addJob(url, maxDepth) {
    try {
      const job = { url, maxDepth, status: 'pending', createdAt: Date.now() };
      await redisClient.rPush(this.queueKey, JSON.stringify(job));
      logger.info(`Job added to queue: ${url}`);
      return job;
    } catch (error) {
      logger.error(`Error adding job to queue: ${error.message}`);
      throw error;
    }
  }

  async getNextJob() {
    try {
      const job = await redisClient.lPop(this.queueKey);
      return job ? JSON.parse(job) : null;
    } catch (error) {
      logger.error(`Error getting next job: ${error.message}`);
      throw error;
    }
  }

  async getQueueLength() {
    try {
      return await redisClient.lLen(this.queueKey);
    } catch (error) {
      logger.error(`Error getting queue length: ${error.message}`);
      throw error;
    }
  }

  async clearQueue() {
    try {
      await redisClient.del(this.queueKey);
      logger.info('Queue cleared successfully');
    } catch (error) {
      logger.error(`Error clearing queue: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new QueueService();