const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDeployStatus } = require('../src/logic/deployStatus');

test('nunca_implantado when ultimoDeploy is null, regardless of checklist', () => {
  assert.equal(computeDeployStatus(null, { '2024-01-01': true }), 'nunca_implantado');
  assert.equal(computeDeployStatus(null, {}), 'nunca_implantado');
});

test('pendente when a checklist entry is newer than the last deploy', () => {
  const status = computeDeployStatus('2024-01-01T10:00:00.000Z', { '2024-01-02': true });
  assert.equal(status, 'pendente');
});

test('atualizado when the last deploy is newer than all checklist entries', () => {
  const status = computeDeployStatus('2024-01-05T10:00:00.000Z', { '2024-01-02': true });
  assert.equal(status, 'atualizado');
});

test('checklist entries marked false do not trigger pendente', () => {
  const status = computeDeployStatus('2024-01-01T10:00:00.000Z', { '2024-01-05': false });
  assert.equal(status, 'atualizado');
});
