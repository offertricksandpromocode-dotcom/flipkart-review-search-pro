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

async function testPagination() {
  const url1 = 'https://www.flipkart.com/kechaoda-k115/product-reviews/itmexfz2mgxnzhnd?pid=MOBEXFZ2HMZMJGNH&page=1';
  const url2 = 'https://www.flipkart.com/kechaoda-k115/product-reviews/itmexfz2mgxnzhnd?pid=MOBEXFZ2HMZMJGNH&page=2';

  const html1 = await fetchUrl(url1);
  const html2 = await fetchUrl(url2);

  function extractAuthors(html) {
    const match = html.match(/<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?);?\s*<\/script>/i);
    if (!match) return [];
    try {
      const state = JSON.parse(match[1].replace(/;\s*$/, ''));
      const slots = state.multiWidgetState?.widgetsData?.slots || [];
      const authors = [];
      slots.forEach(s => {
        const comps = s.slotData?.widget?.data?.renderableComponents || [];
        comps.forEach(c => {
          if (c.value && c.value.author) {
            authors.push(c.value.author);
          }
        });
      });
      return authors;
    } catch (e) {
      return [];
    }
  }

  console.log('Page 1 Authors:', extractAuthors(html1));
  console.log('Page 2 Authors:', extractAuthors(html2));
}

testPagination().catch(console.error);
