const https = require('https');
const NameMatcher = require('./matcher.js');

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

function parseReviewsFromHtml(html, pageUrl, pageNumber) {
  const reviews = [];

  // Method 1: Extract from window.__INITIAL_STATE__
  const stateMatch = html.match(/<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?);?\s*<\/script>/i);
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1].replace(/;\s*$/, ''));
      const slots = state.multiWidgetState?.widgetsData?.slots || [];

      slots.forEach((slot, sIdx) => {
        const comps = slot.slotData?.widget?.data?.renderableComponents || [];
        comps.forEach((c, cIdx) => {
          const val = c.value;
          if (val && (val.author || val.reviewer || (val.text && val.rating))) {
            const reviewerName = val.author || val.reviewer || (val.reviewerDetails ? val.reviewerDetails.name : '');
            if (reviewerName) {
              const locationStr = val.location ? `${val.location.city || ''}, ${val.location.state || ''}`.replace(/^,\s*|,\s*$/g, '') : '';
              const dateLocation = [val.created, locationStr].filter(Boolean).join(' • ');
              const directReviewUrl = val.url ? (val.url.startsWith('http') ? val.url : `https://www.flipkart.com${val.url}`) : `${pageUrl}#review-p${pageNumber}-i${reviews.length + 1}`;

              reviews.push({
                reviewerName: reviewerName.trim(),
                rating: val.rating ? val.rating.toString() : 'N/A',
                title: val.title ? val.title.trim() : '',
                body: val.text ? val.text.trim() : '',
                isCertified: !!(val.certifiedBuyer || (val.reviewPropertyMap && val.reviewPropertyMap.VERIFIED_PURCHASE)),
                dateLocation: dateLocation,
                pageNumber: pageNumber,
                directUrl: directReviewUrl,
                id: val.id || `rev_${pageNumber}_${sIdx}_${cIdx}`
              });
            }
          }
        });
      });
    } catch (e) {
      console.warn('Failed to parse window.__INITIAL_STATE__:', e.message);
    }
  }

  // Method 2: Schema.org JSON-LD
  if (reviews.length === 0) {
    const ldMatches = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    ldMatches.forEach((ld, idx) => {
      const content = ld.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      try {
        const parsed = JSON.parse(content);
        const reviewArray = Array.isArray(parsed.review) ? parsed.review : (parsed['@type'] === 'Review' ? [parsed] : []);
        reviewArray.forEach((r, rIdx) => {
          const author = typeof r.author === 'string' ? r.author : (r.author?.name || '');
          if (author) {
            reviews.push({
              reviewerName: author.trim(),
              rating: r.reviewRating?.ratingValue ? r.reviewRating.ratingValue.toString() : 'N/A',
              title: r.name || '',
              body: r.reviewBody || '',
              isCertified: true,
              dateLocation: r.datePublished || '',
              pageNumber: pageNumber,
              directUrl: `${pageUrl}#review-p${pageNumber}-i${rIdx + 1}`,
              id: `ld_rev_${pageNumber}_${idx}_${rIdx}`
            });
          }
        });
      } catch (e) {}
    });
  }

  const hasNextPage = reviews.length > 0;
  return { reviews, hasNextPage };
}

async function testScraper() {
  const url = 'https://www.flipkart.com/kechaoda-k115/product-reviews/itmexfz2mgxnzhnd?pid=MOBEXFZ2HMZMJGNH&page=1';
  console.log('Fetching:', url);
  const html = await fetchUrl(url);
  const parsed = parseReviewsFromHtml(html, url, 1);
  console.log(`Parsed ${parsed.reviews.length} reviews from page 1.`);

  // Search for sample names
  const queryNames = ['Papu pani', 'Pankaj', 'Payal Sharma', 'nikhil'];
  console.log('Matching against queries:', queryNames);

  parsed.reviews.forEach(r => {
    const matches = NameMatcher.matchReviewerAgainstQueries(r.reviewerName, queryNames, false, 0.75);
    if (matches.length > 0) {
      console.log(`-> MATCH FOUND: Query "${matches[0].queryName}" matched Reviewer "${r.reviewerName}" (${matches[0].matchType}, score ${matches[0].score})`);
      console.log(`   Rating: ${r.rating}★ | Title: ${r.title} | Certified: ${r.isCertified}`);
      console.log(`   Link: ${r.directUrl}`);
    }
  });
}

testScraper().catch(console.error);
