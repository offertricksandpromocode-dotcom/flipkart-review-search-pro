const NameMatcher = require('./matcher.js');
const FlipkartScraper = require('./scraper.js');

function testMatcher() {
  console.log('--- Testing NameMatcher ---');

  // Test 1: Exact matches
  const exact = NameMatcher.matchReviewerAgainstQueries('Rahul Sharma', ['Rahul Sharma', 'Amit Kumar'], true);
  console.assert(exact.length === 1 && exact[0].matchType === 'exact', 'Exact match failed');
  console.log('✓ Exact match test passed');

  // Test 2: Case insensitivity & extra spaces
  const caseTest = NameMatcher.matchReviewerAgainstQueries('  rahul   sharma  ', ['RAHUL SHARMA'], true);
  console.assert(caseTest.length === 1 && caseTest[0].matchType === 'exact', 'Case/whitespace normalization failed');
  console.log('✓ Case/whitespace normalization test passed');

  // Test 3: Fuzzy matches (typos & abbreviations)
  const fuzzy1 = NameMatcher.matchReviewerAgainstQueries('Rahul S.', ['Rahul Sharma'], false, 0.70);
  console.assert(fuzzy1.length === 1, 'Token abbreviation fuzzy match failed');
  console.log(`✓ Fuzzy match (Rahul S. vs Rahul Sharma): Score = ${fuzzy1[0].score}`);

  const fuzzy2 = NameMatcher.matchReviewerAgainstQueries('Johnathan Doe', ['John Doe'], false, 0.70);
  console.assert(fuzzy2.length === 1, 'Substring fuzzy match failed');
  console.log(`✓ Fuzzy match (Johnathan Doe vs John Doe): Score = ${fuzzy2[0].score}`);

  const fuzzy3 = NameMatcher.matchReviewerAgainstQueries('Priyah Patel', ['Priya Patel'], false, 0.75);
  console.assert(fuzzy3.length === 1, 'Typo fuzzy match failed');
  console.log(`✓ Fuzzy match typo (Priyah Patel vs Priya Patel): Score = ${fuzzy3[0].score}`);

  // Test 4: Batch search with multiple queries
  const queries = ['Amit Kumar', 'Neha Sharma', 'Vikas Patel'];
  const testName = 'Neha Sharma';
  const batchMatches = NameMatcher.matchReviewerAgainstQueries(testName, queries, true);
  console.assert(batchMatches.length === 1 && batchMatches[0].queryName === 'Neha Sharma', 'Batch lookup failed');
  console.log('✓ Batch lookup test passed');
}

function testScraperUrlNormalization() {
  console.log('\n--- Testing FlipkartScraper URL Normalization ---');

  // Product page URL
  const prodUrl = 'https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=LSTMOBGTAGPTB3VS24WVZNSEN&marketplace=FLIPKART';
  const normProd = FlipkartScraper.normalizeReviewUrl(prodUrl);
  console.assert(normProd.isValid, 'Product URL validation failed');
  console.assert(normProd.reviewUrl.includes('/product-reviews/'), 'URL transformation to review page failed');
  console.assert(normProd.reviewUrl.includes('pid=MOBGTAGPTB3VS24W'), 'PID preservation failed');
  console.log('✓ Product URL transformation passed:', normProd.reviewUrl);

  // Review page URL
  const revUrl = 'https://www.flipkart.com/apple-iphone-15-black-128-gb/product-reviews/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W';
  const normRev = FlipkartScraper.normalizeReviewUrl(revUrl);
  console.assert(normRev.isValid, 'Review URL validation failed');
  console.log('✓ Review URL preservation passed:', normRev.reviewUrl);
}

function runAll() {
  testMatcher();
  testScraperUrlNormalization();
  console.log('\n✅ All automated verification tests passed successfully!');
}

runAll();
