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

async function dumpFull() {
  const url = 'https://www.flipkart.com/kechaoda-k115/product-reviews/itmexfz2mgxnzhnd?pid=MOBEXFZ2HMZMJGNH';
  console.log('Fetching:', url);
  const res = await fetchUrl(url);
  fs.writeFileSync('full_review_dump.html', res.body);
  console.log('Written full_review_dump.html (length: ' + res.body.length + ')');

  // Search for JSON scripts
  const matches = res.body.match(/<script id="is_json"[^>]*>([\s\S]*?)<\/script>/i);
  if (matches) {
    console.log('Found is_json script!');
    fs.writeFileSync('is_json.json', matches[1]);
  } else {
    console.log('No is_json script found.');
  }

  // Search for any script containing data or review
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let count = 0;
  while ((m = scriptRegex.exec(res.body)) !== null) {
    count++;
    if (m[1].includes('REVIEW') || m[1].includes('reviewer') || m[1].includes('rating') || m[1].includes('window.__INITIAL_STATE__') || m[1].includes('pageData')) {
      console.log(`Script #${count} has review data. Length: ${m[1].length}`);
      fs.writeFileSync(`script_${count}.js`, m[1].substring(0, 50000));
    }
  }
}

dumpFull().catch(console.error);
