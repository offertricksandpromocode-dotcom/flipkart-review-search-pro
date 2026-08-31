/**
 * Matcher utility for Exact and Fuzzy matching of Name and Location/Area.
 */

class NameMatcher {
  /**
   * Normalize a string by trimming, lowercasing, and removing accents/special characters.
   * @param {string} str
   * @returns {string}
   */
  static normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9\s]/g, ' ')   // replace symbols with spaces
      .replace(/\s+/g, ' ')           // collapse multiple spaces
      .trim();
  }

  /**
   * Calculate Levenshtein distance between two strings.
   */
  static levenshteinDistance(a, b) {
    const matrix = [];
    const aLen = a.length;
    const bLen = b.length;

    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;

    for (let i = 0; i <= bLen; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= aLen; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= bLen; i++) {
      for (let j = 1; j <= aLen; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[bLen][aLen];
  }

  /**
   * Calculate Levenshtein-based similarity score between 0.0 and 1.0.
   */
  static levenshteinSimilarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    const distance = this.levenshteinDistance(a, b);
    return Math.max(0, 1.0 - distance / maxLen);
  }

  /**
   * Calculate Bigram (Dice's Coefficient) similarity.
   */
  static diceCoefficient(a, b) {
    if (a === b) return 1.0;
    if (a.length < 2 || b.length < 2) return this.levenshteinSimilarity(a, b);

    const getBigrams = (str) => {
      const bigrams = new Set();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.substring(i, i + 2));
      }
      return bigrams;
    };

    const bigramsA = getBigrams(a);
    const bigramsB = getBigrams(b);

    let intersection = 0;
    for (const bg of bigramsA) {
      if (bigramsB.has(bg)) {
        intersection++;
      }
    }

    return (2.0 * intersection) / (bigramsA.size + bigramsB.size);
  }

  /**
   * Check token-level containment and similarity.
   */
  static tokenSimilarity(normTarget, normQuery) {
    const targetTokens = normTarget.split(' ').filter(Boolean);
    const queryTokens = normQuery.split(' ').filter(Boolean);

    if (targetTokens.length === 0 || queryTokens.length === 0) return 0;

    const queryInTarget = queryTokens.every(q => 
      targetTokens.some(t => t === q || (t.startsWith(q) && q.length > 1) || (q.startsWith(t) && t.length > 1))
    );
    if (queryInTarget) return 0.92;

    let totalScore = 0;
    for (const q of queryTokens) {
      let bestTokenScore = 0;
      for (const t of targetTokens) {
        const score = this.levenshteinSimilarity(q, t);
        if (score > bestTokenScore) bestTokenScore = score;
      }
      totalScore += bestTokenScore;
    }

    return totalScore / queryTokens.length;
  }

  /**
   * Comprehensive similarity evaluation.
   */
  static calculateSimilarity(targetStr, queryStr) {
    const normTarget = this.normalize(targetStr);
    const normQuery = this.normalize(queryStr);

    if (!normTarget || !normQuery) return 0;
    if (normTarget === normQuery) return 1.0;

    if (normTarget.includes(normQuery) || normQuery.includes(normTarget)) {
      const minLen = Math.min(normTarget.length, normQuery.length);
      const maxLen = Math.max(normTarget.length, normQuery.length);
      return Math.max(0.85, minLen / maxLen);
    }

    const levScore = this.levenshteinSimilarity(normTarget, normQuery);
    const diceScore = this.diceCoefficient(normTarget, normQuery);
    const tokScore = this.tokenSimilarity(normTarget, normQuery);

    return Math.max(levScore, diceScore, tokScore);
  }

  /**
   * Match a single review against query names and query locations.
   * 
   * @param {object} reviewData
   * @param {string} reviewData.reviewerName
   * @param {string} reviewData.location
   * @param {string[]} queryNames
   * @param {string[]} queryLocations
   * @param {boolean} exactOnly
   * @param {number} threshold
   * @returns {Array<object>}
   */
  static matchReview(reviewData, queryNames = [], queryLocations = [], exactOnly = false, threshold = 0.75) {
    const matches = [];
    const reviewerName = reviewData.reviewerName || '';
    const locationStr = reviewData.location || '';
    const fullLine = `${reviewerName} ${locationStr}`.trim();

    const normReviewer = this.normalize(reviewerName);
    const normLoc = this.normalize(locationStr);
    const normFull = this.normalize(fullLine);

    // Case 1: Search by Name only
    if (queryNames.length > 0 && queryLocations.length === 0) {
      for (const query of queryNames) {
        const normQuery = this.normalize(query);
        if (!normQuery) continue;

        if (exactOnly) {
          if (normReviewer === normQuery || normFull === normQuery) {
            matches.push({
              query: query,
              queryType: 'name',
              matchedTarget: reviewerName,
              matchedLocation: locationStr,
              score: 1.0,
              matchType: 'exact'
            });
          }
        } else {
          const score = Math.max(
            this.calculateSimilarity(reviewerName, query),
            this.calculateSimilarity(fullLine, query)
          );
          if (score >= threshold) {
            matches.push({
              query: query,
              queryType: 'name',
              matchedTarget: reviewerName,
              matchedLocation: locationStr,
              score: parseFloat(score.toFixed(2)),
              matchType: score >= 0.99 ? 'exact' : 'similar'
            });
          }
        }
      }
    }
    // Case 2: Search by Location only
    else if (queryNames.length === 0 && queryLocations.length > 0) {
      for (const locQuery of queryLocations) {
        const normQuery = this.normalize(locQuery);
        if (!normQuery) continue;

        if (exactOnly) {
          if (normLoc === normQuery || normLoc.includes(normQuery)) {
            matches.push({
              query: locQuery,
              queryType: 'location',
              matchedTarget: reviewerName,
              matchedLocation: locationStr,
              score: 1.0,
              matchType: 'exact'
            });
          }
        } else {
          const score = this.calculateSimilarity(locationStr, locQuery);
          if (score >= threshold || normLoc.includes(normQuery)) {
            matches.push({
              query: locQuery,
              queryType: 'location',
              matchedTarget: reviewerName,
              matchedLocation: locationStr,
              score: Math.max(score, normLoc.includes(normQuery) ? 0.9 : score),
              matchType: score >= 0.99 ? 'exact' : 'similar'
            });
          }
        }
      }
    }
    // Case 3: Search by both Name AND Location
    else if (queryNames.length > 0 && queryLocations.length > 0) {
      for (const nameQuery of queryNames) {
        for (const locQuery of queryLocations) {
          const nameScore = this.calculateSimilarity(reviewerName, nameQuery);
          const locScore = this.calculateSimilarity(locationStr, locQuery);

          const isNameMatch = exactOnly ? (normReviewer === this.normalize(nameQuery)) : (nameScore >= threshold);
          const isLocMatch = exactOnly ? (normLoc === this.normalize(locQuery) || normLoc.includes(this.normalize(locQuery))) : (locScore >= threshold || normLoc.includes(this.normalize(locQuery)));

          if (isNameMatch && isLocMatch) {
            const combinedScore = parseFloat(((nameScore + locScore) / 2).toFixed(2));
            matches.push({
              query: `${nameQuery} (${locQuery})`,
              queryType: 'name_and_location',
              matchedTarget: reviewerName,
              matchedLocation: locationStr,
              score: combinedScore,
              matchType: (nameScore >= 0.99 && locScore >= 0.99) ? 'exact' : 'similar'
            });
          }
        }
      }
    }

    return matches;
  }

  /**
   * Backwards compatible helper for single reviewer name query matching
   */
  static matchReviewerAgainstQueries(reviewerName, queryNames, exactOnly = false, threshold = 0.75) {
    const results = this.matchReview({ reviewerName, location: '' }, queryNames, [], exactOnly, threshold);
    return results.map(r => ({
      queryName: r.query,
      reviewerName: r.matchedTarget,
      isMatch: true,
      score: r.score,
      matchType: r.matchType
    }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NameMatcher;
} else if (typeof window !== 'undefined') {
  window.NameMatcher = NameMatcher;
}
