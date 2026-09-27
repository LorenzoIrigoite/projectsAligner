const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('project modal exposes credential copy popups and side button', () => {
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const detail = fs.readFileSync(path.join(root, 'renderer', 'detail.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');

  assert.match(html, /id="detail-credential-rail"/);
  assert.match(html, /id="dialog-credential-picker"/);
  assert.match(html, /id="dialog-credential-copy"/);
  assert.match(detail, /openCredentialPicker/);
  assert.match(detail, /copyCredentialField/);
  assert.match(detail, /copiedCredentialFields\.login && copiedCredentialFields\.senha/);
  assert.match(css, /\.detail-credential-rail/);
});
