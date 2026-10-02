const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function extractRouteActions() {
  const source = read('server/src/routes/api.js');
  return new Set([...source.matchAll(/case '([^']+)'/g)].map(match => match[1]));
}

function extractAppsScriptActions() {
  const source = read('apps-script/Code.gs');
  const actions = new Set();
  const patterns = [
    /case\s+['"]([^'"]+)['"]/g,
    /action\s*={2,3}\s*['"]([^'"]+)['"]/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      actions.add(match[1]);
    }
  }

  return actions;
}

function runActionCoverageTest() {
  const routeActions = extractRouteActions();
  const legacyActions = extractAppsScriptActions();
  const missing = [...legacyActions].filter(action => !routeActions.has(action)).sort();

  console.log('Action contract coverage');
  console.log(`- Legacy Apps Script actions: ${legacyActions.size}`);
  console.log(`- Local Express actions     : ${routeActions.size}`);
  console.log(`- Missing actions           : ${missing.length}`);

  if (missing.length > 0) {
    console.log('- First missing actions     :');
    missing.slice(0, 30).forEach(action => console.log(`  ${action}`));
  }

  assert.strictEqual(
    missing.length,
    0,
    `Local backend is missing ${missing.length} legacy Apps Script action(s).`
  );
}

if (require.main === module) {
  try {
    runActionCoverageTest();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = runActionCoverageTest;
