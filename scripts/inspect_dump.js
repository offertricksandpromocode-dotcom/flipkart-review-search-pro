const fs = require('fs');

const html = fs.readFileSync('review_dump.html', 'utf8');

// Check script tags
const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
console.log(`Found ${scriptTags.length} script tags.`);

scriptTags.forEach((st, i) => {
  if (st.includes('review') || st.includes('INITIAL') || st.includes('is_json') || st.includes('pageData') || st.includes('RESPONSE')) {
    console.log(`Script ${i}: length=${st.length}, snippet=${st.substring(0, 300)}`);
  }
});

// Search for any reviewer name or text in html
console.log('Includes review:', html.toLowerCase().includes('review'));
console.log('Includes rating:', html.toLowerCase().includes('rating'));
