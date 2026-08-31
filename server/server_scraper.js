const https = require('https');
const http = require('http');
const NameMatcher = require('../scripts/matcher.js');

class ServerScraper {
  static USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'
  ];

  static getRandomUserAgent() {
    return this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
  }

  static normalizeReviewUrl(urlStr) {
    try {
      if (!urlStr || typeof urlStr !== 'string') {
        return { isValid: false, error: 'Empty URL provided.' };
      }

      const cleanUrl = urlStr.trim();
      const parsed = new URL(cleanUrl);

      if (!parsed.hostname.includes('flipkart.com')) {
        return { isValid: false, error: 'Please enter a valid Flipkart product link.' };
      }

      const pid = parsed.searchParams.get('pid');
      const lid = parsed.searchParams.get('lid');
      const marketplace = parsed.searchParams.get('marketplace') || 'FLIPKART';

      const pathParts = parsed.pathname.split('/').filter(p => p.length > 0);
      const slug = pathParts[0] || 'product';

      let itmId = '';
      const pIdx = pathParts.indexOf('p');
      if (pIdx !== -1 && pathParts[pIdx + 1]) {
        itmId = pathParts[pIdx + 1];
      } else {
        const productReviewsIdx = pathParts.indexOf('product-reviews');
        if (productReviewsIdx !== -1 && pathParts[productReviewsIdx + 1]) {
          itmId = pathParts[productReviewsIdx + 1];
        }
      }

      const rawTitle = slug.replace(/-/g, ' ');
      const productTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

      let reviewUrl = '';
      if (itmId) {
        reviewUrl = `https://www.flipkart.com/${slug}/product-reviews/${itmId}?pid=${pid || ''}`;
      } else if (pid) {
        reviewUrl = `https://www.flipkart.com/${slug}/product-reviews/itm?pid=${pid}`;
      } else {
        reviewUrl = `https://www.flipkart.com${parsed.pathname}`;
      }

      if (lid) reviewUrl += `&lid=${lid}`;
      if (marketplace) reviewUrl += `&marketplace=${marketplace}`;

      return {
        isValid: true,
        reviewUrl,
        pid,
        productTitle
      };
    } catch (e) {
      return { isValid: false, error: 'Could not parse Flipkart URL: ' + e.message };
    }
  }

  static fetchHtml(url) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      };

      const req = https.request(options, (res) => {
        // Handle redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).href;
          return resolve(this.fetchHtml(redirectUrl));
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(12000, () => {
        req.destroy();
        reject(new Error('Request timeout fetching Flipkart review page.'));
      });
      req.end();
    });
  }

  static parseReviewsFromHtml(html, pageUrl) {
    const reviews = [];

    // 1. React Initial State Parser
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});<\/script>/s) ||
                       html.match(/<script>\s*window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*<\/script>/s);

    if (stateMatch && stateMatch[1]) {
      try {
        const state = JSON.parse(stateMatch[1]);
        if (state && state.multiWidgetState && state.multiWidgetState.widgetsData) {
          const slots = state.multiWidgetState.widgetsData.slots || [];
          for (const slot of slots) {
            const slotData = slot.slotData;
            if (!slotData || !slotData.widget) continue;
            const widget = slotData.widget;
            const comps = (widget.data && widget.data.renderableComponents) || [];

            for (const comp of comps) {
              const val = comp.value;
              if (val && (val.author || val.reviewerName || (val.text && val.rating))) {
                const id = val.reviewId || val.id || (val.author + '_' + (val.created || Math.random().toString(36).substr(2, 6)));
                const reviewerName = val.author || val.reviewerName || 'Anonymous';
                const rating = val.rating ? val.rating.toString() : 'N/A';
                const title = val.title || val.heading || '';
                const body = val.text || val.reviewText || val.comment || '';
                const isCertified = val.certifiedBuyer || val.isCertified || false;
                const createdDate = val.created || val.submissionTime || '';
                
                let location = '';
                if (val.location) {
                  if (typeof val.location === 'string') location = val.location;
                  else if (val.location.city) {
                    location = val.location.state ? `${val.location.city}, ${val.location.state}` : val.location.city;
                  }
                }

                let directUrl = pageUrl;
                if (val.url) {
                  directUrl = val.url.startsWith('http') ? val.url : `https://www.flipkart.com${val.url}`;
                } else if (val.reviewId) {
                  const pid = new URL(pageUrl).searchParams.get('pid') || '';
                  directUrl = `https://www.flipkart.com/reviews/${pid}?reviewId=${val.reviewId}`;
                }

                reviews.push({
                  id,
                  reviewerName,
                  location,
                  rating,
                  title,
                  body,
                  isCertified,
                  dateLocation: [createdDate, location].filter(Boolean).join(' • '),
                  directUrl
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('State parse error:', err.message);
      }
    }

    // 2. DOM Regex fallback
    if (reviews.length === 0) {
      const cardMatches = html.match(/<div class="[^"]*(?:col _2wQAZ[A-Za-z0-9_-]*|cPHDOP)[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) || [];
      for (const card of cardMatches) {
        const nameMatch = card.match(/<p class="[^"]*(?:_2NsDsF|_2sc7ZR)[^"]*">([^<]+)<\/p>/);
        const name = nameMatch ? nameMatch[1].trim() : '';
        if (name) {
          const ratingMatch = card.match(/<div class="[^"]*_3LWZlK[^"]*">([0-9.]+)<\s*img/);
          const rating = ratingMatch ? ratingMatch[1].trim() : 'N/A';
          const titleMatch = card.match(/<p class="[^"]*_2-N8zT[^"]*">([^<]+)<\/p>/);
          const title = titleMatch ? titleMatch[1].trim() : '';
          const bodyMatch = card.match(/<div class="[^"]*t-ZTKy[^"]*"><div><div class="[^"]*">([\s\S]*?)<\/div>/);
          const body = bodyMatch ? bodyMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          const isCertified = card.includes('Certified Buyer');

          const locMatch = card.match(/<p class="[^"]*_2mcPpE[^"]*"><span>([^<]+)<\/span>/);
          const location = locMatch ? locMatch[1].trim() : '';

          reviews.push({
            id: 'dom_' + Math.random().toString(36).substr(2, 8),
            reviewerName: name,
            location,
            rating,
            title,
            body,
            isCertified,
            dateLocation: location,
            directUrl: pageUrl
          });
        }
      }
    }

    const hasNextPage = html.includes('<span>Next</span>') ||
                       html.includes('&page=') ||
                       reviews.length >= 10;

    return { reviews, hasNextPage };
  }

  /**
   * Scrape reviews across sections and match against queries
   */
  static async searchReviews({
    reviewUrl,
    queryNames = [],
    queryLocations = [],
    exactOnly = false,
    threshold = 0.75,
    maxPagesPerSection = 25,
    searchScope = 'ALL_SECTIONS',
    onProgress = () => {}
  }) {
    const SECTIONS = [
      { sortOrder: 'MOST_RECENT', name: 'Latest / Recent Posts' },
      { sortOrder: 'MOST_HELPFUL', name: 'Most Helpful' },
      { sortOrder: 'POSITIVE_FIRST', name: 'Positive Reviews' },
      { sortOrder: 'NEGATIVE_FIRST', name: 'Negative Reviews' }
    ];

    let sectionsToScan = SECTIONS;
    if (searchScope && searchScope !== 'ALL_SECTIONS') {
      sectionsToScan = SECTIONS.filter(s => s.sortOrder === searchScope);
      if (sectionsToScan.length === 0) sectionsToScan = SECTIONS;
    }

    const matchedReviews = [];
    const seenReviewIds = new Set();
    let totalReviewsScanned = 0;
    let totalPagesScanned = 0;

    for (let sIdx = 0; sIdx < sectionsToScan.length; sIdx++) {
      const section = sectionsToScan[sIdx];
      let currentPage = 1;
      let hasNextPage = true;

      while (currentPage <= maxPagesPerSection && hasNextPage) {
        totalPagesScanned++;
        const targetUrl = new URL(reviewUrl);
        targetUrl.searchParams.set('page', currentPage.toString());
        targetUrl.searchParams.set('sortOrder', section.sortOrder);

        try {
          const html = await this.fetchHtml(targetUrl.href);
          const parsed = this.parseReviewsFromHtml(html, targetUrl.href);
          hasNextPage = parsed.hasNextPage;

          for (const review of parsed.reviews) {
            const dedupeKey = review.reviewerName.toLowerCase() + '_' + (review.title || '').substring(0, 15);
            if (seenReviewIds.has(dedupeKey)) continue;
            seenReviewIds.add(dedupeKey);
            totalReviewsScanned++;

            const matches = NameMatcher.matchReview(review, queryNames, queryLocations, exactOnly, threshold);
            for (const match of matches) {
              matchedReviews.push({
                ...review,
                foundInSection: section.name,
                searchedQuery: match.query,
                matchedTarget: match.matchedTarget,
                matchType: match.matchType,
                similarityScore: match.score,
                matchedLocation: match.matchedLocation
              });
            }
          }

          onProgress({
            currentPage,
            sectionIndex: sIdx + 1,
            totalSections: sectionsToScan.length,
            sectionName: section.name,
            totalPagesScanned,
            totalReviewsScanned,
            matchesFoundSoFar: matchedReviews.length
          });

          if (parsed.reviews.length === 0) break;
          currentPage++;

          // Small politeness delay
          await new Promise(r => setTimeout(r, 200));
        } catch (pageErr) {
          console.warn(`Error on section ${section.name} page ${currentPage}:`, pageErr.message);
          break;
        }
      }
    }

    return {
      matchedReviews,
      totalReviewsScanned,
      totalPagesScanned
    };
  }
}

module.exports = ServerScraper;
