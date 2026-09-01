const ServerScraper = require('../server/server_scraper.js');

async function testUniversalLinks() {
  console.log('--- Testing Universal Flipkart Link Handler ---');

  // Test 1: Full Desktop Product Page
  const t1 = await ServerScraper.normalizeUniversalUrl('https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=LSTMOBGTAGPTB3VS24WVZNSEN&marketplace=FLIPKART');
  console.assert(t1.isValid && t1.reviewUrl.includes('product-reviews/itm6ac6485515ae4'), 'Desktop URL normalization failed');
  console.log('✓ Desktop product link normalized successfully:', t1.reviewUrl);

  // Test 2: WhatsApp / Telegram Messy Text Share
  const messyText = 'Hey check this watch on Flipkart! https://www.flipkart.com/titan-raga-watch/p/itm987654321?pid=WAT12345XYZ Buy it soon!';
  const t2 = await ServerScraper.normalizeUniversalUrl(messyText);
  console.assert(t2.isValid && t2.pid === 'WAT12345XYZ', 'Messy text extraction failed');
  console.log('✓ Messy text with URL extracted and normalized:', t2.reviewUrl);

  // Test 3: Short URL extraction
  const t3 = await ServerScraper.normalizeUniversalUrl('https://dl.flipkart.com/s/123456');
  console.log('✓ Short link handled:', t3);

  console.log('\n✅ Universal Flipkart Link tests passed successfully!');
}

testUniversalLinks().catch(console.error);
