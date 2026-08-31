const fs = require('fs');

const html = fs.readFileSync('full_review_dump.html', 'utf8');

// Find the script tag containing window.__INITIAL_STATE__
const match = html.match(/<script[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?);?\s*<\/script>/i);
if (match) {
  const jsonStr = match[1].replace(/;\s*$/, '');
  fs.writeFileSync('full_initial_state.json', jsonStr);
  console.log('Saved full_initial_state.json, length:', jsonStr.length);

  try {
    const state = JSON.parse(jsonStr);
    console.log('Parsed JSON successfully!');

    // Let's inspect pageDataV4 slots
    const pageData = state.pageDataV4 || state.pageData || {};
    const slots = pageData.slots || [];
    console.log(`Total slots: ${slots.length}`);

    const allReviews = [];

    slots.forEach((slot, idx) => {
      const widget = slot.widget || {};
      const data = widget.data || {};
      const renderableComponents = data.renderableComponents || [];

      // Check if slot or widget contains reviews
      if (data.renderableComponents) {
        data.renderableComponents.forEach(rc => {
          const val = rc.value || {};
          if (val.author || val.reviewer || (val.text && val.rating) || val.type === 'ProductReviewValue') {
            allReviews.push({
              reviewerName: val.author || val.reviewer || (val.reviewerDetails ? val.reviewerDetails.name : ''),
              rating: val.rating,
              title: val.title,
              text: val.text,
              location: val.location,
              createdDate: val.created || val.reviewDate,
              certifiedBuyer: val.certifiedBuyer
            });
          }
        });
      }

      // Check slot.widget.data.review
      if (data.review) {
        allReviews.push(data.review);
      }
    });

    console.log(`Found ${allReviews.length} structured reviews in slots.`);
    if (allReviews.length > 0) {
      console.log('Sample extracted review:', JSON.stringify(allReviews[0], null, 2));
    }

    // Also check JSON-LD Schema
    const ldJsonMatches = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    console.log(`Found ${ldJsonMatches.length} ld+json script tags.`);
    ldJsonMatches.forEach((ld, i) => {
      const content = ld.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      try {
        const parsed = JSON.parse(content);
        if (parsed.review || parsed['@type'] === 'Review') {
          console.log(`LD+JSON #${i} has reviews:`, parsed.review ? parsed.review.length : 1);
          if (parsed.review && parsed.review.length > 0) {
            console.log('Sample LD review:', JSON.stringify(parsed.review[0], null, 2));
          }
        }
      } catch (e) {}
    });

  } catch (err) {
    console.error('Error parsing full json:', err);
  }
} else {
  console.log('Could not find window.__INITIAL_STATE__ script in HTML.');
}
