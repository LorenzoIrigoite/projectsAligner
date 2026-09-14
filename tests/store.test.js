const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/data/store');

function makeTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-aligner-test-'));
  return createStore(dir);
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

  const all = store.getAllProjects();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, project.id);
});

test('toggleChecklistToday records the date in checklistHistorico', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.toggleChecklistToday(project.id, '2024-01-02', true);
  const updated = store.getProject(project.id);
  assert.equal(updated.checklistHistorico['2024-01-02'], true);
});

test('markDeployDone sets ultimoDeploy', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.markDeployDone(project.id, '2024-01-05T12:00:00.000Z');
  const updated = store.getProject(project.id);
  assert.equal(updated.ultimoDeploy, '2024-01-05T12:00:00.000Z');
});

test('updateProject throws for an unknown id', () => {
  const store = makeTempStore();
  assert.throws(() => store.updateProject('unknown-id', {}), /não encontrado/);
});

test('data survives across store instances pointed at the same directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-aligner-test-'));
  const store1 = createStore(dir);
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
