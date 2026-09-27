const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('project detail header allows editing project context name', () => {
  const detail = fs.readFileSync(path.join(root, 'renderer', 'detail.js'), 'utf8');

  assert.match(detail, /id="detail-contexto-macro"/);
  assert.match(detail, /contextoMacro:\s*event\.target\.value\.trim\(\)/);
});

test('sidebar expand button centers its icon inside the box', () => {
  const css = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');

  assert.match(css, /\.sidebar-toggle\s*{[^}]*display:\s*grid;[^}]*place-items:\s*center;/s);
  assert.match(css, /\.toggle-icon\s*{[^}]*display:\s*grid;[^}]*place-items:\s*center;/s);
});
