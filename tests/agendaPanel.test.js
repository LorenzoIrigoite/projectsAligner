const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('agenda panel stays hidden when there are no meetings today', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

  assert.match(app, /panel\.classList\.toggle\('hidden', agenda\.length === 0\)/);
  assert.match(app, /if \(agenda\.length === 0\) \{[^}]*panel\.innerHTML = '';[^}]*return;/s);
  assert.doesNotMatch(app, /Nenhum meeting agendado para hoje/);
});
