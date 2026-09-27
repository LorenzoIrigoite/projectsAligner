const test = require('node:test');
const assert = require('node:assert/strict');
const { shiftLocalDateStr, isLembreteDue } = require('../src/logic/lembrete');

test('shiftLocalDateStr moves across month boundaries', () => {
  assert.equal(shiftLocalDateStr('2024-01-31', 1), '2024-02-01');
  assert.equal(shiftLocalDateStr('2024-02-28', 1), '2024-02-29');
});

test('isLembreteDue waits until the scheduled day', () => {
  const project = { lembreteProximoDia: 'Revisar env', lembreteParaData: '2024-01-10' };
  assert.equal(isLembreteDue(project, '2024-01-09'), false);
  assert.equal(isLembreteDue(project, '2024-01-10'), true);
  assert.equal(isLembreteDue(project, '2024-01-11'), true);
});

test('isLembreteDue treats legacy reminders without date as already due', () => {
  assert.equal(isLembreteDue({ lembreteProximoDia: 'Antigo' }, '2024-01-01'), true);
  assert.equal(isLembreteDue({ lembreteProximoDia: '   ' }, '2024-01-01'), false);
});
