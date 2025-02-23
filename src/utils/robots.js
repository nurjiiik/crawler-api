const robotsParser = require('robots-parser');
const axios = require('axios');
const logger = require('./logger');

const createRobotsChecker = async (baseUrl) => {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const { data } = await axios.get(robotsUrl, { timeout: 5000 });
    return robotsParser(robotsUrl, data);
  } catch (error) {
    logger.warn(`No robots.txt found at ${baseUrl}`);
    return robotsParser(baseUrl, 'User-agent: *\nDisallow:');
  }
};

module.exports = { createRobotsChecker };