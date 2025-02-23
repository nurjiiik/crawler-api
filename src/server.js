const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerConfig = require('./config/swagger');
const { connectRedis, redisClient } = require('./config/redis');
const logger = require('./utils/logger');
const crawlLimiter = require('./middlewares/rateLimit');

const app = express();

// Флаги и таймеры для подключения к Redis
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
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
    }
  } catch (error) {
    logger.error('Redis connection error:', error);
    isRedisConnected = false;
    isConnecting = false;
    // Экспоненциальный бэкофф с максимальной задержкой 30 секунд
    const backoffDelay = Math.min((reconnectTimeout ? 10000 : 1000) * 2, 30000);
    reconnectTimeout = setTimeout(() => {
      logger.info(`Attempting to reconnect to Redis in ${backoffDelay}ms...`);
      initializeRedis();
    }, backoffDelay);
  }
};

// Первоначальное подключение к Redis
initializeRedis();

// Периодическая проверка подключения к Redis
reconnectInterval = setInterval(async () => {
  if (!isRedisConnected && !isConnecting) {
    logger.info('Attempting to reconnect to Redis...');
    await initializeRedis();
  }
}, 5000);

// Функция корректного завершения работы с Redis
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

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Основные middleware
app.use(express.json());

// Handle preflight requests
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'unsafe-none' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", '*'],
      connectSrc: ["'self'", '*'],
      frameSrc: ["'self'", '*'],
      imgSrc: ["'self'", '*'],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", '*'],
      styleSrc: ["'self'", "'unsafe-inline'", '*'],
      workerSrc: ["'self'", 'blob:', '*']
    },
  }
}));

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods'],
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86400
}));

// Enable pre-flight requests for all routes
app.options('*', cors());

// Handle preflight requests
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Swagger UI для документации API
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerConfig));

// Основной маршрут API с ограничением частоты запросов
app.use('/api/crawl', crawlLimiter, require('./controllers/crawlController'));

// Маршрут для проверки работоспособности сервера
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Обработка ошибок
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
  res.status(statusCode).json({ error: err.message || 'Internal server error' });
});

// Обработка 404 (не найдено)
app.use((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(404).json({ error: 'Not Found' });
});

module.exports = app;
