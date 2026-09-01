const https = require('https');

async function testMobileLink() {
  const shortUrl = 'https://dl.flipkart.com/s/px_h7IuuuN';
  console.log('Resolving short URL:', shortUrl);

  const ServerScraper = require('../server/server_scraper.js');
  const norm = await ServerScraper.normalizeUniversalUrl(shortUrl);
  console.log('Normalized URL result:', norm);

  if (norm.isValid) {
    const results = await ServerScraper.searchReviews({
      reviewUrl: norm.reviewUrl,
      queryNames: ['Rao'],
      exactOnly: false,
      threshold: 0.75,
      maxPagesPerSection: 5
    });

    console.log('Search Results:', {
      totalReviewsScanned: results.totalReviewsScanned,
      totalPagesScanned: results.totalPagesScanned,
      matchedReviewsCount: results.matchedReviews.length,
      matches: results.matchedReviews
    });
  }
}

testMobileLink().catch(console.error);
