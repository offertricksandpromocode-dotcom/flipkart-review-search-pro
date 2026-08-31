const NameMatcher = require('./matcher.js');

function testLocationMatching() {
  console.log('--- Testing Location / Area Matching ---');

  const sampleReview = {
    reviewerName: 'Riya Paul',
    location: 'Jamshedpur',
    title: 'Awesome watch',
    rating: '5'
  };

  // Test 1: Location-only query
  const locMatch = NameMatcher.matchReview(sampleReview, [], ['Jamshedpur'], false, 0.75);
  console.assert(locMatch.length === 1, 'Location-only match failed');
  console.log(`✓ Location-only match (Jamshedpur): Score = ${locMatch[0].score}, Matched Target = ${locMatch[0].matchedTarget}, Matched Location = ${locMatch[0].matchedLocation}`);

  // Test 2: Name + Location query
  const bothMatch = NameMatcher.matchReview(sampleReview, ['Riya Paul'], ['Jamshedpur'], false, 0.75);
  console.assert(bothMatch.length === 1, 'Both Name & Location match failed');
  console.log(`✓ Combined Name + Location match: Query = "${bothMatch[0].query}", Score = ${bothMatch[0].score}`);

  // Test 3: Fuzzy location match (e.g. "jamsedpur" typo)
  const fuzzyLoc = NameMatcher.matchReview(sampleReview, [], ['jamsedpur'], false, 0.75);
  console.assert(fuzzyLoc.length === 1, 'Fuzzy location typo match failed');
  console.log(`✓ Fuzzy location typo match (jamsedpur vs Jamshedpur): Score = ${fuzzyLoc[0].score}`);

  console.log('\n✅ All Location test cases passed successfully!');
}

testLocationMatching();
