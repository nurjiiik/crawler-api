const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerConfig = require('./config/swagger');
const { connectRedis, redisClient } = require('./config/redis');
const logger = require('./utils/logger');
const crawlLimiter = require('./middlewares/rateLimit');

const app = express();

// Initialize Redis
let isRedisConnected = false;
let isConnecting = false;
let reconnectInterval = null;
let reconnectTimeout = null;

const initializeRedis = async () => {
  try {
    if (!isRedisConnected && !isConnecting) {
      isConnecting = true;
      await connectRedis();
      isRedisConnected = true;
      isConnecting = false;
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // Clear interval if connection is successful
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
    }
  } catch (error) {
    logger.error('Redis connection error:', error);
    isRedisConnected = false;
    isConnecting = false;
    
    // Schedule reconnection with exponential backoff
    const backoffDelay = Math.min((reconnectTimeout ? 10000 : 1000) * 2, 30000);
    reconnectTimeout = setTimeout(() => {
      logger.info(`Attempting to reconnect to Redis in ${backoffDelay}ms...`);
      initializeRedis();
    }, backoffDelay);
  }
};

// Attempt Redis connection
initializeRedis();

// Periodically check Redis connection
reconnectInterval = setInterval(async () => {
  if (!isRedisConnected && !isConnecting) {
    logger.info('Attempting to reconnect to Redis...');
    await initializeRedis();
  }
}, 5000);

// Cleanup function for Redis connection
const cleanup = async () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
  if (isRedisConnected) {
    try {
      await redisClient.quit();
      isRedisConnected = false;
    } catch (error) {
      logger.error('Error during Redis cleanup:', error);
    }
  }
};

// Handle graceful shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Middlewares
app.use(express.json());
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Access-Control-Allow-Origin'],
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 3600,
  preflightContinue: false
}));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerConfig));

// API Routes with middleware
app.use('/api/crawl', crawlLimiter, require('./controllers/crawlController'));

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error(`Server error: ${err.stack}`);
  res.setHeader('Content-Type', 'application/json');
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Bad Request', message: 'Invalid JSON payload' });
  }
  
  if (!isRedisConnected && req.path !== '/health') {
    return res.status(503).json({ error: 'Service Unavailable', message: 'Redis connection is not available' });
  }
  
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ error: err.message || 'Internal server error' })
});

// Handle 404 errors
app.use((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(404).json({ error: 'Not Found' });
});

module.exports = app;