const puppeteer = require('puppeteer');
const logger = require('./logger');

const renderPage = async (url) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent(process.env.USER_AGENT);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    
    return await page.content();
  } catch (error) {
    logger.error(`Puppeteer error: ${error.message}`);
    return null;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { renderPage };