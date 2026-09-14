const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/data/store');

function makeTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-aligner-test-'));
  const store = createStore(dir);
  store.setFila({ dataInicio: '2024-01-01', dataFim: '2024-01-12' });
  return store;
}

test('addProject persists a project with default fields', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '557',
    cliente: 'João Paulo',
    contextoMacro: 'Floricultura',
    dataEntradaFila: '2024-01-01',
  });

  assert.equal(project.numero, '557');
  assert.equal(project.ativo, true);
  assert.deepEqual(project.checklistHistorico, {});
  assert.equal(project.ultimoDeploy, null);
  assert.equal(project.ultimoChecklistFeitoEm, null);
  assert.deepEqual(project.deploys, []);

  const all = store.getAllProjects();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, project.id);
});

test('toggleChecklistToday records the date and checklist completion timestamp', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  const nowIso = '2024-01-02T10:30:00.000Z';
  store.toggleChecklistToday(project.id, '2024-01-02', true, nowIso);
  const updated = store.getProject(project.id);
  assert.equal(updated.checklistHistorico['2024-01-02'], true);
  assert.equal(updated.ultimoChecklistFeitoEm, nowIso);
});

test('toggleChecklistToday false updates history without rewinding completion timestamp', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  const nowIso = '2024-01-02T10:30:00.000Z';
  store.toggleChecklistToday(project.id, '2024-01-02', true, nowIso);
  store.toggleChecklistToday(project.id, '2024-01-02', false, '2024-01-02T11:00:00.000Z');

  const updated = store.getProject(project.id);
  assert.equal(updated.checklistHistorico['2024-01-02'], false);
  assert.equal(updated.ultimoChecklistFeitoEm, nowIso);
});

test('markDeployDone appends a dated history entry', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.markDeployDone(project.id, '2024-01-05T12:00:00.000Z', '2024-01-05');
  const updated = store.getProject(project.id);
  assert.equal(updated.ultimoDeploy, '2024-01-05T12:00:00.000Z');
  assert.equal(updated.deploys.length, 1);
  assert.equal(updated.deploys[0].data, '2024-01-05');
});

test('clearDeploy removes the last history entry and keeps earlier ones', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.markDeployDone(project.id, '2024-01-05T12:00:00.000Z', '2024-01-05');
  store.markDeployDone(project.id, '2024-01-08T09:00:00.000Z', '2024-01-08');
  store.clearDeploy(project.id);
  const updated = store.getProject(project.id);
  assert.equal(updated.ultimoDeploy, '2024-01-05T12:00:00.000Z');
  assert.equal(updated.deploys.length, 1);
  assert.equal(updated.deploys[0].data, '2024-01-05');
});

test('setDeployOnDate can mark and unmark only that day', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.setDeployOnDate(project.id, '2024-01-05', true, '2024-01-05T12:00:00.000Z');
  store.setDeployOnDate(project.id, '2024-01-08', true, '2024-01-08T09:00:00.000Z');
  store.setDeployOnDate(project.id, '2024-01-08', false, '2024-01-08T10:00:00.000Z');
  const updated = store.getProject(project.id);
  assert.equal(updated.deploys.length, 1);
  assert.equal(updated.deploys[0].data, '2024-01-05');
  assert.equal(updated.ultimoDeploy, '2024-01-05T12:00:00.000Z');
});

test('updateProject throws for an unknown id', () => {
  const store = makeTempStore();
  assert.throws(() => store.updateProject('unknown-id', {}), /não encontrado/);
});

test('addProject rejects a ninth active project', () => {
  const store = makeTempStore();
  for (let i = 0; i < 8; i += 1) {
    store.addProject({
      numero: String(i),
      cliente: 'Cliente',
      contextoMacro: 'Contexto',
      dataEntradaFila: '2024-01-01',
    });
  }
  assert.throws(
    () => store.addProject({
      numero: '9',
      cliente: 'Cliente',
      contextoMacro: 'Contexto',
      dataEntradaFila: '2024-01-01',
    }),
    /8 projetos ativos/
  );
});

test('data survives across store instances pointed at the same directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-aligner-test-'));
  const store1 = createStore(dir);
  store1.setFila({ dataInicio: '2024-01-01', dataFim: '2024-01-12' });
  const project = store1.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  const store2 = createStore(dir);
  const reloaded = store2.getProject(project.id);
  assert.equal(reloaded.numero, '1');
});
