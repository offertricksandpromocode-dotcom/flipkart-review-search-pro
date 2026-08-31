const fs = require('fs');

const s3 = fs.readFileSync('script_3.js', 'utf8');

// Extract JSON object from window.__INITIAL_STATE__ = { ... };
const jsonStr = s3.replace(/^window\.__INITIAL_STATE__\s*=\s*/, '').replace(/;?\s*$/, '');
try {
  const state = JSON.parse(jsonStr);
  console.log('Successfully parsed __INITIAL_STATE__!');
  console.log('Top level keys:', Object.keys(state));

  const pageData = state.pageDataV4 || state.pageData || {};
  console.log('pageData keys:', Object.keys(pageData));

  // Check pageUriData / slots / widgets
  const slots = pageData.slots || [];
  console.log(`Found ${slots.length} slots in pageDataV4.`);

  slots.forEach((slot, idx) => {
    const widget = slot.widget || {};
    const type = widget.type || slot.slotType;
    console.log(`Slot ${idx}: type = ${type}`);
    if (type && type.toLowerCase().includes('review')) {
      console.log(`--> Review Slot ${idx} details:`, JSON.stringify(widget).substring(0, 500));
    }
  });

  // Check for any review objects in the entire state tree
  function findReviewObjects(obj, depth = 0, path = '') {
    if (!obj || depth > 10) return [];
    let results = [];
    if (typeof obj === 'object') {
      if (obj.author || obj.reviewer || (obj.rating && obj.text && obj.title)) {
        results.push({ path, obj });
      }
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          results = results.concat(findReviewObjects(obj[key], depth + 1, `${path}.${key}`));
        }
      }
    }
    return results;
  }

  const found = findReviewObjects(state);
  console.log(`Found ${found.length} review objects across state tree.`);
  if (found.length > 0) {
    console.log('Sample review object:', JSON.stringify(found[0].obj, null, 2));
    console.log('Path:', found[0].path);
  }

} catch (err) {
  console.error('Failed to parse JSON:', err.message);
}
