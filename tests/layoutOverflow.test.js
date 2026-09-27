const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('layout prevents horizontal page scroll while sidebar is open', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');

  assert.match(css, /html\s*{[^}]*overflow-x:\s*hidden;/s);
  assert.match(css, /body\s*{[^}]*max-width:\s*100vw;[^}]*overflow-x:\s*hidden;/s);
});
