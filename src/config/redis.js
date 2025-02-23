const { createClient } = require('redis');
const logger = require('../utils/logger');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 20) {
        logger.error('Max Redis reconnection attempts reached');
        return false; // stop reconnecting
      }
      const delay = Math.min(retries * 500, 5000);
      logger.info(`Attempting to reconnect to Redis in ${delay}ms...`);
      return delay;
    },
    connectTimeout: 10000
  }
});

redisClient.on('error', (err) => {
  logger.error(`Redis error: ${err.message}`);
});

const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      logger.info('Redis connected successfully');
    } else {
      logger.info('Redis connection already established');
    }
  } catch (error) {
    logger.error(`Redis connection failed: ${error.message}`);
    // Don't exit process, let the application handle Redis unavailability
    throw error;
  }
};

module.exports = { redisClient, connectRedis };