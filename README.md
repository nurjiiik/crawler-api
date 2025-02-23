# Web Crawler API

A RESTful API service that provides web crawling capabilities using Express.js, Puppeteer, and Redis for queue management.

## Features

- Web page crawling with Puppeteer
- Queue management with Redis
- Rate limiting and concurrent crawl management
- API documentation with Swagger
- Environment configuration

## Prerequisites

- Node.js (v14 or higher)
- Redis server
- npm or yarn

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `.env`
4. Start Redis server

## Usage

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

API documentation will be available at: `http://localhost:3000/api-docs`

## API Endpoints

- POST /api/crawl - Submit a URL for crawling
- GET /api/crawl/:id - Get crawling results by ID

## Configuration

Adjust the following environment variables in `.env`:

- PORT: API server port
- REDIS_HOST: Redis server host
- REDIS_PORT: Redis server port
- MAX_CONCURRENT_CRAWLS: Maximum number of concurrent crawling tasks
- CRAWL_TIMEOUT: Timeout for each crawling task (ms)

## License

MIT