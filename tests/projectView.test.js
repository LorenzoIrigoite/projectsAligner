const test = require('node:test');
const assert = require('node:assert/strict');
const { annotateProject } = require('../src/logic/projectView');

test('annotateProject combines business days and deploy status into a view model', () => {
  const project = {
    id: 'abc',
    dataEntradaFila: '2024-01-01',
    diasBonus: 2,
    ultimoDeploy: null,
    ultimoChecklistFeitoEm: null,
    checklistHistorico: {},
  };

  const annotated = annotateProject(project, '2024-01-08', {
    dataInicio: '2024-01-01',
    dataFim: '2024-01-12',
  });

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
    ultimoChecklistFeitoEm: null,
    checklistHistorico: {},
  };

  const annotated = annotateProject(project, '2024-01-01', {
    dataInicio: '2024-01-01',
    dataFim: '2024-01-12',
  });
  assert.equal(annotated.diasBonus, 0);
});

test('annotateProject marks deploy pending when checklist completion is newer than deploy', () => {
  const project = {
    id: 'pending',
    dataEntradaFila: '2024-01-01',
    ultimoDeploy: '2024-01-02T10:00:00.000Z',
    ultimoChecklistFeitoEm: '2024-01-02T11:00:00.000Z',
    checklistHistorico: { '2024-01-02': true },
  };

  const annotated = annotateProject(project, '2024-01-02', {
    dataInicio: '2024-01-01',
    dataFim: '2024-01-12',
  });
  assert.equal(annotated.statusDeploy, 'pendente');
});

test('annotateProject marks deploy updated when deploy is newer than checklist completion', () => {
  const project = {
    id: 'updated',
    dataEntradaFila: '2024-01-01',
    ultimoDeploy: '2024-01-02T11:00:00.000Z',
    ultimoChecklistFeitoEm: '2024-01-02T10:00:00.000Z',
    checklistHistorico: { '2024-01-02': true },
  };

  const annotated = annotateProject(project, '2024-01-02', {
    dataInicio: '2024-01-01',
    dataFim: '2024-01-12',
  });
  assert.equal(annotated.statusDeploy, 'atualizado');
});

test('annotateProject starts project days at entry date inside the selected queue', () => {
  const project = {
    id: 'mid',
    dataEntradaFila: '2024-01-04',
    ultimoDeploy: null,
    ultimoChecklistFeitoEm: null,
    checklistHistorico: {},
  };

  const annotated = annotateProject(project, '2024-01-04', {
    dataInicio: '2024-01-01',
    dataFim: '2024-01-09',
  });

  assert.equal(annotated.diasUteis, 1);
  assert.equal(annotated.semana[0].date, '2024-01-04');
  assert.equal(annotated.semana[0].status, 'current');
  assert.equal(annotated.semana.some((day) => day.date === '2024-01-01'), false);
});

test('annotateProject leaves semana empty when project belongs to another queue', () => {
  const annotated = annotateProject({
    id: 'future',
    dataEntradaFila: '2024-02-05',
    ultimoDeploy: null,
    ultimoChecklistFeitoEm: null,
    checklistHistorico: {},
  }, '2024-01-04', {
    dataInicio: '2024-01-01',
    dataFim: '2024-01-09',
  });

  assert.equal(annotated.diasUteis, 0);
  assert.deepEqual(annotated.semana, []);
});
