const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');

// Find doGet routing
const doGetMatch = code.match(/function doGet\([\s\S]*?^}/m);
console.log('--- doGet sample ---');

// Find all action strings
const actionRegex = /action\s*===?\s*['"]([^'"]+)['"]/g;
let match;
const actions = new Set();
while ((match = actionRegex.exec(code)) !== null) {
  actions.add(match[1]);
}

console.log('Found actions:', Array.from(actions).sort());
