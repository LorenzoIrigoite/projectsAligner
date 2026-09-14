const test = require('node:test');
const assert = require('node:assert/strict');
const { annotateProject } = require('../src/logic/projectView');

test('annotateProject combines business days and deploy status into a view model', () => {
  const project = {
    id: 'abc',
    dataEntradaFila: '2024-01-01',
    diasBonus: 2,
    ultimoDeploy: null,
    checklistHistorico: {},
  };

  const annotated = annotateProject(project, '2024-01-08');

  assert.equal(annotated.id, 'abc');
  assert.equal(annotated.diasUteis, 6);
  assert.equal(annotated.avisoDeployObrigatorio, true);
  assert.equal(annotated.avisoVideoEEnv, false);
  assert.equal(annotated.statusDeploy, 'nunca_implantado');
});

test('annotateProject defaults diasBonus to 0 when missing', () => {
  const project = {
    id: 'xyz',
    dataEntradaFila: '2024-01-01',
    ultimoDeploy: null,
    checklistHistorico: {},
  };

  const annotated = annotateProject(project, '2024-01-01');
  assert.equal(annotated.diasBonus, 0);
});
