const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Aggressive Crawler API',
      version: '1.0.0',
      description: 'Web crawling API with advanced features'
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local server' }
    ],
    components: {}
  },
  apis: ['./src/controllers/*.js']
};

module.exports = swaggerJsdoc(options);