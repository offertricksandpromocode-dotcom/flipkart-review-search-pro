const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractReviewers(html) {
  const match = html.match(/<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?);?\s*<\/script>/i);
  if (!match) return [];
  try {
    const state = JSON.parse(match[1].replace(/;\s*$/, ''));
    const slots = state.multiWidgetState?.widgetsData?.slots || [];
    const reviews = [];
    slots.forEach(s => {
      const comps = s.slotData?.widget?.data?.renderableComponents || [];
      comps.forEach(c => {
        if (c.value && c.value.author) {
          reviews.push({
            author: c.value.author,
            created: c.value.created,
            rating: c.value.rating,
            title: c.value.title
          });
        }
      });
    });
    return reviews;
  } catch (e) {
    return [];
  }
}

async function testSorts() {
  const base = 'https://www.flipkart.com/kechaoda-k115/product-reviews/itmexfz2mgxnzhnd?pid=MOBEXFZ2HMZMJGNH';
  
  console.log('--- Testing Default (Helpful) ---');
  const hHtml = await fetchUrl(base + '&page=1');
  const hRevs = extractReviewers(hHtml);
  console.log('Helpful count:', hRevs.length, 'Sample dates:', hRevs.slice(0, 3).map(r => `${r.author} (${r.created})`));

  console.log('\n--- Testing sortOrder=MOST_RECENT ---');
  const rHtml = await fetchUrl(base + '&sortOrder=MOST_RECENT&page=1');
  const rRevs = extractReviewers(rHtml);
  console.log('Most Recent count:', rRevs.length, 'Sample dates:', rRevs.slice(0, 3).map(r => `${r.author} (${r.created})`));

  console.log('\n--- Testing sortOrder=POSITIVE_FIRST ---');
  const pHtml = await fetchUrl(base + '&sortOrder=POSITIVE_FIRST&page=1');
  const pRevs = extractReviewers(pHtml);
  console.log('Positive count:', pRevs.length);

  console.log('\n--- Testing sortOrder=NEGATIVE_FIRST ---');
  const nHtml = await fetchUrl(base + '&sortOrder=NEGATIVE_FIRST&page=1');
  const nRevs = extractReviewers(nHtml);
  console.log('Negative count:', nRevs.length);
}

testSorts().catch(console.error);
