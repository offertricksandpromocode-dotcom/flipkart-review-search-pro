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

function extractReviewData(html) {
  const match = html.match(/<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?);?\s*<\/script>/i);
  if (!match) return { reviews: [], filters: [] };
  try {
    const state = JSON.parse(match[1].replace(/;\s*$/, ''));
    const slots = state.multiWidgetState?.widgetsData?.slots || [];
    const reviews = [];
    const filterOptions = [];

    slots.forEach(s => {
      const widget = s.slotData?.widget;
      const comps = widget?.data?.renderableComponents || [];
      
      // Check filters
      if (widget?.type?.includes('FILTER') || widget?.type?.includes('SORT')) {
        filterOptions.push(widget);
      }

      comps.forEach(c => {
        if (c.value && c.value.author) {
          reviews.push({
            author: c.value.author,
            created: c.value.created,
            rating: c.value.rating,
            title: c.value.title,
            id: c.value.id
          });
        }
      });
    });
    return { reviews, filterOptions, rawState: state };
  } catch (e) {
    return { reviews: [], filters: [], error: e.message };
  }
}

async function testAllSections() {
  const base = 'https://www.flipkart.com/apple-iphone-15-black-128-gb/product-reviews/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W';
  console.log('Testing iPhone 15 reviews page...');

  const sections = [
    { name: 'Latest (Recent)', param: '&sortOrder=MOST_RECENT' },
    { name: 'Most Helpful', param: '&sortOrder=MOST_HELPFUL' },
    { name: 'Positive First', param: '&sortOrder=POSITIVE_FIRST' },
    { name: 'Negative First', param: '&sortOrder=NEGATIVE_FIRST' },
    { name: '5 Star Only', param: '&rating=5' },
    { name: '4 Star Only', param: '&rating=4' },
    { name: '3 Star Only', param: '&rating=3' },
    { name: '2 Star Only', param: '&rating=2' },
    { name: '1 Star Only', param: '&rating=1' },
    { name: 'Certified Buyer', param: '&certifiedBuyer=true' },
    { name: 'Images / Media', param: '&reviewType=PHOTO_ONLY' }
  ];

  for (const sec of sections) {
    const url = base + sec.param + '&page=1';
    try {
      const html = await fetchUrl(url);
      const data = extractReviewData(html);
      console.log(`[${sec.name}]: Found ${data.reviews.length} reviews. Sample:`, data.reviews.slice(0, 2).map(r => `${r.author} (${r.rating}★, ${r.created})`));
    } catch (e) {
      console.log(`[${sec.name}]: Error`, e.message);
    }
  }
}

testAllSections().catch(console.error);
