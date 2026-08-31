const fs = require('fs');

const jsonStr = fs.readFileSync('full_initial_state.json', 'utf8');
const state = JSON.parse(jsonStr);

console.log('Keys:', Object.keys(state));

// Search for any string like "Papu pani" or "Pankaj Barot" or "Payal Sharma" which we saw earlier!
function searchKeyVal(obj, searchTerm, path = '') {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (obj.toLowerCase().includes(searchTerm.toLowerCase())) {
      console.log(`Found "${searchTerm}" at path: ${path} = "${obj}"`);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => searchKeyVal(item, searchTerm, `${path}[${idx}]`));
  } else if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      searchKeyVal(obj[k], searchTerm, `${path}.${k}`);
    }
  }
}

searchKeyVal(state, 'Papu pani');
searchKeyVal(state, 'Pankaj Barot');
searchKeyVal(state, 'Payal Sharma');
