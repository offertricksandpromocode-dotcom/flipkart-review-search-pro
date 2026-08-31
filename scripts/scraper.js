/**
 * Flipkart Review Scraper Engine
 * Exhaustive multi-section crawler (Latest, Most Helpful, Positive, Negative)
 * with location/area extraction and multi-query matching.
 */

class FlipkartScraper {
  static SECTIONS = [
    { id: 'MOST_RECENT', label: '🕒 Latest / Recent', param: 'MOST_RECENT' },
    { id: 'MOST_HELPFUL', label: '👍 Most Helpful', param: 'MOST_HELPFUL' },
    { id: 'POSITIVE_FIRST', label: '⭐ Positive Reviews', param: 'POSITIVE_FIRST' },
    { id: 'NEGATIVE_FIRST', label: '⚠️ Negative Reviews', param: 'NEGATIVE_FIRST' }
  ];

  /**
   * Normalize any Flipkart URL into a base review listing URL.
   */
  static normalizeReviewUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { isValid: false, reviewUrl: '', productTitle: '', error: 'Please enter a valid Flipkart URL.' };
    }

    let urlObj;
    try {
      urlObj = new URL(rawUrl.trim());
    } catch (e) {
      return { isValid: false, reviewUrl: '', productTitle: '', error: 'Malformed URL format.' };
    }

    if (!urlObj.hostname.includes('flipkart.com') && !urlObj.hostname.includes('flixcart.com')) {
      return { isValid: false, reviewUrl: '', productTitle: '', error: 'URL must be from flipkart.com' };
    }

    let pathname = urlObj.pathname;
    let productTitle = 'Flipkart Product';
    const pathParts = pathname.split('/').filter(Boolean);
    if (pathParts.length > 0 && pathParts[0] !== 'p' && pathParts[0] !== 'product-reviews') {
      productTitle = pathParts[0].replace(/-/g, ' ');
      productTitle = productTitle.replace(/\b\w/g, l => l.toUpperCase());
    }

    if (pathname.includes('/p/')) {
      pathname = pathname.replace('/p/', '/product-reviews/');
    } else if (!pathname.includes('/product-reviews/')) {
      const itmIndex = pathParts.findIndex(p => p.startsWith('itm'));
      if (itmIndex !== -1) {
        const slug = pathParts[0];
        const itmId = pathParts[itmIndex];
        pathname = `/${slug}/product-reviews/${itmId}`;
      }
    }

    const pid = urlObj.searchParams.get('pid');
    const lid = urlObj.searchParams.get('lid');
    const marketplace = urlObj.searchParams.get('marketplace');

    const searchParams = new URLSearchParams();
    if (pid) searchParams.set('pid', pid);
    if (lid) searchParams.set('lid', lid);
    if (marketplace) searchParams.set('marketplace', marketplace);

    const queryString = searchParams.toString();
    const baseUrl = `https://www.flipkart.com${pathname}${queryString ? '?' + queryString : ''}`;

    return {
      isValid: true,
      reviewUrl: baseUrl,
      productTitle: productTitle
    };
  }

  /**
   * Fetch a single review page HTML.
   */
  static async fetchReviewPage(baseReviewUrl, pageNumber = 1, sortOrder = 'MOST_RECENT') {
    const url = new URL(baseReviewUrl);
    url.searchParams.set('page', pageNumber.toString());
    if (sortOrder) {
      url.searchParams.set('sortOrder', sortOrder);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: Failed to fetch page ${pageNumber}`);
    }

    const htmlText = await response.text();
    const parsedData = this.parseReviewsFromHtml(htmlText, url.toString(), pageNumber, sortOrder);
    return parsedData;
  }

  /**
   * Universal HTML parser extracting reviewer names and location data.
   */
  static parseReviewsFromHtml(html, pageUrl, pageNumber, sortOrder = 'MOST_RECENT') {
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
              let reviewerName = val.author || val.reviewer || (val.reviewerDetails ? val.reviewerDetails.name : '');
              let locationStr = '';

              if (val.location) {
                locationStr = `${val.location.city || ''}, ${val.location.state || ''}`.replace(/^,\s*|,\s*$/g, '').trim();
              }

              // Check if author string itself contains location (e.g. "Riya Paul, Jamshedpur")
              if (reviewerName && reviewerName.includes(',')) {
                const parts = reviewerName.split(',').map(p => p.trim());
                if (parts.length >= 2) {
                  reviewerName = parts[0];
                  if (!locationStr) {
                    locationStr = parts.slice(1).join(', ');
                  }
                }
              }

              if (reviewerName) {
                const dateLocation = [val.created, locationStr].filter(Boolean).join(' • ');
                const directReviewUrl = val.url 
                  ? (val.url.startsWith('http') ? val.url : `https://www.flipkart.com${val.url}`) 
                  : `${pageUrl}#review-p${pageNumber}-i${reviews.length + 1}`;

                reviews.push({
                  reviewerName: reviewerName.trim(),
                  location: locationStr,
                  rating: val.rating ? val.rating.toString() : 'N/A',
                  title: val.title ? val.title.trim() : '',
                  body: val.text ? val.text.trim() : '',
                  isCertified: !!(val.certifiedBuyer || (val.reviewPropertyMap && val.reviewPropertyMap.VERIFIED_PURCHASE)),
                  dateLocation: dateLocation,
                  pageNumber: pageNumber,
                  section: sortOrder,
                  directUrl: directReviewUrl,
                  id: val.id || `rev_${pageNumber}_${sIdx}_${cIdx}`
                });
              }
            }
          });
        });
      } catch (e) {
        console.warn('Initial state JSON parsing error:', e.message);
      }
    }

    // Method 2: Fallback Schema.org JSON-LD
    if (reviews.length === 0) {
      const ldMatches = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
      ldMatches.forEach((ld, idx) => {
        const content = ld.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
        try {
          const parsed = JSON.parse(content);
          const reviewArray = Array.isArray(parsed.review) ? parsed.review : (parsed['@type'] === 'Review' ? [parsed] : []);
          reviewArray.forEach((r, rIdx) => {
            let author = typeof r.author === 'string' ? r.author : (r.author?.name || '');
            let loc = '';
            if (author.includes(',')) {
              const parts = author.split(',').map(p => p.trim());
              author = parts[0];
              loc = parts.slice(1).join(', ');
            }
            if (author) {
              reviews.push({
                reviewerName: author.trim(),
                location: loc,
                rating: r.reviewRating?.ratingValue ? r.reviewRating.ratingValue.toString() : 'N/A',
                title: r.name || '',
                body: r.reviewBody || '',
                isCertified: true,
                dateLocation: r.datePublished || '',
                pageNumber: pageNumber,
                section: sortOrder,
                directUrl: `${pageUrl}#review-p${pageNumber}-i${rIdx + 1}`,
                id: `ld_rev_${pageNumber}_${idx}_${rIdx}`
              });
            }
          });
        } catch (e) {}
      });
    }

    const hasNextPage = reviews.length > 0;

    return {
      reviews,
      hasNextPage,
      rawHtmlLength: html.length
    };
  }

  /**
   * Search through Flipkart reviews with multi-section scanning, name and area filtering.
   */
  static async searchReviews({
    reviewUrl,
    queryNames = [],
    queryLocations = [],
    exactOnly = false,
    threshold = 0.75,
    maxPagesPerSection = 25,
    searchScope = 'ALL_SECTIONS',
    delayMs = 250,
    onPageScanned = () => {},
    onMatchFound = () => {},
    isCancelled = () => false
  }) {
    let totalReviewsScanned = 0;
    let totalPagesScanned = 0;
    const matchedReviews = [];
    const seenReviewIds = new Set();
    
    // Build availability map for all search queries (names & locations)
    const nameAvailability = {};
    const allQueryKeys = [
      ...queryNames.map(n => ({ key: n, type: 'name' })),
      ...queryLocations.map(l => ({ key: l, type: 'location' }))
    ];

    allQueryKeys.forEach(item => {
      nameAvailability[item.key] = {
        name: item.key,
        type: item.type,
        isAvailable: false,
        matchCount: 0,
        matches: []
      };
    });

    let targetSections = [];
    if (searchScope === 'ALL_SECTIONS') {
      targetSections = [
        { id: 'MOST_RECENT', label: 'Latest / Recent' },
        { id: 'MOST_HELPFUL', label: 'Most Helpful' },
        { id: 'POSITIVE_FIRST', label: 'Positive First' },
        { id: 'NEGATIVE_FIRST', label: 'Negative First' }
      ];
    } else {
      const found = this.SECTIONS.find(s => s.id === searchScope) || this.SECTIONS[0];
      targetSections = [{ id: found.id, label: found.label }];
    }

    const targetMaxPages = maxPagesPerSection === 0 || maxPagesPerSection === 'all' || maxPagesPerSection === Infinity ? 250 : parseInt(maxPagesPerSection, 10);

    for (let secIdx = 0; secIdx < targetSections.length; secIdx++) {
      if (isCancelled()) break;

      const currentSection = targetSections[secIdx];
      let pageNum = 1;
      let consecutiveEmptyPages = 0;

      while (pageNum <= targetMaxPages) {
        if (isCancelled()) break;

        try {
          const pageData = await this.fetchReviewPage(reviewUrl, pageNum, currentSection.id);
          const { reviews, hasNextPage } = pageData;

          if (reviews.length === 0) {
            consecutiveEmptyPages++;
            if (consecutiveEmptyPages >= 2) {
              break;
            }
          } else {
            consecutiveEmptyPages = 0;
          }

          totalPagesScanned++;

          for (const review of reviews) {
            const uniqueKey = review.id || `${review.reviewerName}_${review.location}_${review.title}`;
            if (seenReviewIds.has(uniqueKey)) {
              continue;
            }
            seenReviewIds.add(uniqueKey);
            totalReviewsScanned++;

            const matchResults = NameMatcher.matchReview(
              review,
              queryNames,
              queryLocations,
              exactOnly,
              threshold
            );

            if (matchResults.length > 0) {
              for (const match of matchResults) {
                const matchedReviewItem = {
                  ...review,
                  searchedQuery: match.query,
                  queryType: match.queryType,
                  matchedName: match.matchedTarget,
                  matchedLocation: match.matchedLocation,
                  similarityScore: match.score,
                  matchType: match.matchType,
                  foundInSection: currentSection.label
                };

                matchedReviews.push(matchedReviewItem);

                if (nameAvailability[match.query]) {
                  nameAvailability[match.query].isAvailable = true;
                  nameAvailability[match.query].matchCount++;
                  nameAvailability[match.query].matches.push(matchedReviewItem);
                }

                onMatchFound(matchedReviewItem);
              }
            }
          }

          onPageScanned({
            currentPage: pageNum,
            sectionIndex: secIdx + 1,
            totalSections: targetSections.length,
            sectionName: currentSection.label,
            totalPagesScanned,
            reviewsOnPage: reviews.length,
            totalReviewsScanned,
            matchesFoundSoFar: matchedReviews.length,
            hasNextPage
          });

          if (!hasNextPage || reviews.length === 0) {
            break;
          }

          pageNum++;

          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          console.error(`Error on section ${currentSection.id} page ${pageNum}:`, error);
          if (pageNum === 1 && targetSections.length === 1) {
            throw error;
          }
          break;
        }
      }
    }

    return {
      totalPagesScanned,
      totalReviewsScanned,
      matchedReviews,
      nameAvailability
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlipkartScraper;
} else if (typeof window !== 'undefined') {
  window.FlipkartScraper = FlipkartScraper;
}
