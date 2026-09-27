const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('verify script runs tests, syntax checks, and exe build', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

  assert.match(pkg.scripts.verify, /npm test/);
  assert.match(pkg.scripts.verify, /node --check renderer\/app\.js/);
  assert.match(pkg.scripts.verify, /node --check renderer\/detail\.js/);
  assert.match(pkg.scripts.verify, /npm run dist/);
});
