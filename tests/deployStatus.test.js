const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDeployStatus } = require('../src/logic/deployStatus');

test('nunca_implantado when ultimoDeploy is null, regardless of checklist', () => {
  assert.equal(computeDeployStatus(null, '2024-01-01T10:00:00.000Z'), 'nunca_implantado');
  assert.equal(computeDeployStatus(null, null), 'nunca_implantado');
});

test('atualizado when no checklist has ever been marked done', () => {
  assert.equal(computeDeployStatus('2024-01-01T10:00:00.000Z', null), 'atualizado');
});

test('pendente when the last checklist completion is newer than the last deploy', () => {
  const status = computeDeployStatus('2024-01-01T10:00:00.000Z', '2024-01-01T12:00:00.000Z');
  assert.equal(status, 'pendente');
});

test('atualizado when the last deploy is newer than the last checklist completion', () => {
  const status = computeDeployStatus('2024-01-01T15:00:00.000Z', '2024-01-01T12:00:00.000Z');
  assert.equal(status, 'atualizado');
});

test('atualizado when deploy happens right after marking checklist done, same day', () => {
  // This is the bug this fix addresses: mark checklist, then immediately mark deploy done.
  const checklistTime = '2024-01-01T09:00:00.000Z';
  const deployTime = '2024-01-01T09:00:01.000Z';
  assert.equal(computeDeployStatus(deployTime, checklistTime), 'atualizado');
});
