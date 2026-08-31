const https = require('https');
const fs = require('fs');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function test() {
  console.log('Fetching search page...');
  const searchRes = await fetchUrl('https://www.flipkart.com/search?q=phone');
  console.log('Search status:', searchRes.status);
  
  // Find a real product URL
  const matches = searchRes.body.match(/\/[-a-zA-Z0-9()]+\/p\/itm[a-zA-Z0-9]+(\?[^"'\s<>]+)?/g);
  if (!matches || matches.length === 0) {
    console.log('No product URLs found in search response. Length:', searchRes.body.length);
    fs.writeFileSync('search_dump.html', searchRes.body);
    return;
  }

  const samplePath = matches[0];
  console.log('Sample product path:', samplePath);
  
  // Now let's test product reviews URL transformation
  const reviewPath = samplePath.replace('/p/', '/product-reviews/');
  const fullReviewUrl = 'https://www.flipkart.com' + reviewPath;
  console.log('Fetching review URL:', fullReviewUrl);

  const reviewRes = await fetchUrl(fullReviewUrl);
  console.log('Review page status:', reviewRes.status, 'Body length:', reviewRes.body.length);

  // Check review structure in body
  const certifiedCount = (reviewRes.body.match(/Certified Buyer/g) || []).length;
  console.log('Certified Buyer count in review page:', certifiedCount);

  // Check script tags or JSON state
  const hasScriptJson = reviewRes.body.includes('application/json');
  console.log('Contains json script tag:', hasScriptJson);

  fs.writeFileSync('review_dump.html', reviewRes.body.substring(0, 10000));
}

test().catch(console.error);
