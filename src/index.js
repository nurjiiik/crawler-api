require('dotenv').config();
const app = require('./server');
const logger = require('./utils/logger');
const { redisClient, connectRedis } = require('./config/redis');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const initializeServer = async () => {
  let redisConnected = false;

  // Пробуем подключиться к Redis; если не удаётся, сервер всё равно запускается
  try {
    await connectRedis();
    redisConnected = true;
    logger.info('Redis connection established');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    logger.info('Starting server without Redis - will retry connection...');
  }

  const server = app.listen(PORT, HOST, () => {
    logger.info(`Server is running on http://${HOST}:${PORT}`);
  });

  // Если первое подключение не удалось, пробуем подключаться периодически
  if (!redisConnected) {
    const retryInterval = setInterval(async () => {
      try {
        await connectRedis();
        redisConnected = true;
        logger.info('Redis connection established after retry');
        clearInterval(retryInterval);
      } catch (error) {
        logger.error('Redis retry connection failed:', error);
      }
    }, 5000);
  }

  // Обработка корректного завершения работы (graceful shutdown)
  const gracefulShutdown = async () => {
    try {
      logger.info('Received shutdown signal. Closing server...');
      await new Promise((resolve) => server.close(resolve));
      if (redisConnected) {
        await redisClient.quit();
        logger.info('Redis connection closed.');
      }
      logger.info('Server shutdown complete.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    gracefulShutdown();
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
};

initializeServer();
