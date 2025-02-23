const { URL } = require('url');
const axios = require('axios');
const axiosRetry = require('axios-retry');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const { redisClient } = require('../config/redis');
const puppeteer = require('../utils/puppeteer');
const logger = require('../utils/logger');

const initializePLimit = async () => {
  try {
    const concurrency = Math.max(1, parseInt(process.env.CRAWL_CONCURRENCY || '5', 10));
    if (isNaN(concurrency)) {
      throw new Error('Expected `concurrency` to be a valid number');
    }
    const pLimit = (await import('p-limit')).default;
    return pLimit(concurrency);
  } catch (error) {
    logger.error('Error initializing p-limit:', error);
    throw new Error(`Failed to initialize p-limit: ${error.message}`);
  }
};

class Crawler {
  constructor(startUrl, maxDepth = 2) {
    if (!startUrl) {
      throw new Error('URL is required');
    }

    try {
      const urlObj = new URL(startUrl);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL scheme must be "http" or "https"');
      }
      this.startUrl = startUrl;
    } catch (error) {
      throw new Error('Invalid URL format: ' + error.message);
    }

    this.config = {
      concurrency: Math.max(1, parseInt(process.env.CRAWL_CONCURRENCY || '5', 10)),
      delay: process.env.REQUEST_DELAY || 1000,
      timeout: process.env.REQUEST_TIMEOUT || 10000,
      retries: process.env.REQUEST_RETRIES || 3
    };

    if (isNaN(this.config.concurrency)) {
      throw new Error('Expected `concurrency` to be a valid number');
    }

    axiosRetry(axios, {
      retries: this.config.retries,
      retryDelay: (retryCount) => retryCount * 1000,
      retryCondition: axiosRetry.isNetworkOrIdempotentRequestError
    });

    this.startUrl = startUrl;
    this.maxDepth = maxDepth;
    this.baseHost = new URL(startUrl).hostname;
    this.robots = null;
    this.limit = null;
    this.queue = [];
    this.visited = new Set();
    this.results = { emails: new Set(), phones: new Set(), pages: 0 };
  }

  async init() {
    const pLimitInstance = await initializePLimit();
    this.limit = pLimitInstance;
  }

  async initialize() {
    await this.init();
    await this.fetchRobotsTxt();
    if (!this.isAllowed(this.startUrl)) throw new Error('Blocked by robots.txt');
    await this.checkCache();
  }

  async checkCache() {
    try {
      const cached = await redisClient.get(`crawl:${this.startUrl}`);
      if (cached) return JSON.parse(cached);
      return null;
    } catch (error) {
      logger.error(`Cache check error: ${error.message}`);
      return null;
    }
  }

  async fetchRobotsTxt() {
    const robotsUrl = new URL('/robots.txt', this.startUrl).href;
    try {
      const { data } = await axios.get(robotsUrl, { timeout: this.config.timeout });
      this.robots = robotsParser(robotsUrl, data);
    } catch (error) {
      this.robots = robotsParser(robotsUrl, '');
    }
  }

  isAllowed(url) {
    return this.robots.isAllowed(url, process.env.USER_AGENT || 'AggressiveCrawler');
  }

  async crawl() {
    this.queue.push({ url: this.startUrl, depth: 0 });
    
    while (this.queue.length > 0) {
      const tasks = this.queue.splice(0, this.config.concurrency)
        .filter(task => 
          task.depth <= this.maxDepth &&
          !this.visited.has(task.url) &&
          this.isAllowed(task.url)
        );

      // Mark URLs as visited before processing to prevent duplicates
      tasks.forEach(task => this.visited.add(task.url));

      await Promise.all(tasks.map(task => 
        this.limit(() => this.processPage(task))
      ));
      
      await new Promise(resolve => setTimeout(resolve, this.config.delay));
    }

    try {
      await redisClient.set(`crawl:${this.startUrl}`, 
        JSON.stringify(this.results),
        { EX: process.env.CACHE_TTL || 3600 }
      );
    } catch (error) {
      logger.error(`Cache set error: ${error.message}`);
    }

    return {
      foundEmails: Array.from(this.results.emails),
      foundPhones: Array.from(this.results.phones),
      pagesScanned: this.results.pages
    };
  }

  async processPage(task) {
    try {
      const html = await this.fetchPage(task.url);
      this.results.pages++;
      
      this.extractContacts(html);
      if (task.depth < this.maxDepth) {
        const links = this.extractLinks(html, task.url);
        links.forEach(url => this.queue.push({ url, depth: task.depth + 1 }));
      }
    } catch (error) {
      logger.error(`Crawl error: ${error.message}`);
    }
  }

  async fetchPage(url) {
    try {
      const { data } = await axios.get(url, {
        timeout: this.config.timeout,
        headers: { 'User-Agent': process.env.USER_AGENT || 'AggressiveCrawler' }
      });
      return data;
    } catch (error) {
      return await puppeteer.renderPage(url);
    }
  }

  extractContacts(html) {
    const emailRegex = /[\w.-]+@[\w.-]+\.\w{2,}/g;
    const phoneRegex = /\+?(\d[\d\s-]{7,}\d)/g;

    const emails = html.match(emailRegex) || [];
    const phones = html.match(phoneRegex) || [];

    emails.forEach(e => this.results.emails.add(e));
    phones.forEach(p => this.results.phones.add(p.normalize('NFKC').replace(/[\s-]/g, '')));
  }

  extractLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const links = [];
    
    $('a[href]').each((i, el) => {
      try {
        const href = $(el).attr('href');
        const url = new URL(href, baseUrl);
        
        if (url.hostname === this.baseHost) {
          links.push(url.href);
        }
      } catch (error) {
        logger.warn(`Invalid link: ${href}`);
      }
    });
    
    return [...new Set(links)];
  }
}

module.exports = Crawler;