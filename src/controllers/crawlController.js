const express = require('express');
const Crawler = require('../services/crawler');
const QueueService = require('../services/queueService.js');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { url, maxDepth = 2 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const crawler = new Crawler(url, maxDepth);
    await crawler.init();
    await crawler.initialize();

    const results = await crawler.crawl();
    logger.info(`Crawl completed for URL: ${url}`);

    res.status(200).json({
      status: "completed",
      data: {
        foundEmails: results.foundEmails,
        foundPhones: results.foundPhones,
        pagesScanned: results.pagesScanned
      }
    });
  } catch (error) {
    logger.error(`Crawler error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await QueueService.getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(status);
  } catch (error) {
    logger.error(`Error fetching job status: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

module.exports = router;

/**
 * @swagger
 * /api/crawl:
 *   post:
 *     summary: Crawl a website to find contact information
 *     description: Scans a provided website URL to extract contact information like emails and phone numbers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: The URL of the website to crawl (must be a valid URL including protocol)
 *                 example: "https://example.com"
 *               maxDepth:
 *                 type: integer
 *                 description: Maximum depth of pages to crawl from the starting URL
 *                 default: 2
 *                 example: 3
 *               maxPages:
 *                 type: integer
 *                 description: Maximum number of pages to scan
 *                 default: 100
 *                 example: 100
 *     responses:
 *       200:
 *         description: Job successfully queued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "accepted"
 *                 jobId:
 *                   type: string
 *                   example: "job_123456"
 *       400:
 *         description: Invalid request format or missing required fields
 *       500:
 *         description: Server error while processing the request
 */
async function crawlSite(req, res) {
    const { url, maxDepth = 2, maxPages = 100 } = req.body;

    try {
        const job = await queueService.addCrawlJob(url, maxDepth, maxPages);
        return res.json({ status: "accepted", jobId: job.id });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

module.exports = router;
