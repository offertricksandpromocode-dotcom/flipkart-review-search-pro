const fs = require('fs');

const s3 = fs.readFileSync('script_3.js', 'utf8');
console.log('Script 3 start:', s3.substring(0, 300));

// Check if window.__INITIAL_STATE__ or json is in script 3
if (s3.includes('window.__INITIAL_STATE__')) {
  console.log('Found window.__INITIAL_STATE__ in script 3!');
}

// Check what variables are initialized
const varMatches = s3.match(/window\.[a-zA-Z0-9_$]+\s*=/g);
console.log('Window assignments:', varMatches);

// Also let's inspect the HTML for DOM classes
const html = fs.readFileSync('full_review_dump.html', 'utf8');
// Find any class containing review or rating
const classes = new Set();
const classRegex = /class="([^"]+)"/g;
let m;
while ((m = classRegex.exec(html)) !== null) {
  const list = m[1].split(' ');
  list.forEach(c => {
    if (c.toLowerCase().includes('rev') || c.toLowerCase().includes('rate') || c.toLowerCase().includes('star') || c.toLowerCase().includes('user') || c.toLowerCase().includes('auth')) {
      classes.add(c);
    }
  });
}
console.log('Interesting classes in HTML:', Array.from(classes).slice(0, 20));

// Check if any author/reviewer names exist in HTML or script
const authorMatches = html.match(/"author":\s*"([^"]+)"/g) || html.match(/"reviewer":\s*"([^"]+)"/g) || html.match(/"author":\s*\{\s*"@type":\s*"Person",\s*"name":\s*"([^"]+)"/g);
console.log('Schema.org or JSON author matches:', authorMatches ? authorMatches.slice(0, 5) : 'none');
