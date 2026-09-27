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
  assert.equal(project.plataforma, 'web');

  const all = store.getAllProjects();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, project.id);
});

test('addProject stores the selected plataforma and updateProject can change it', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '560',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    plataforma: 'APP/WEB',
  });
  assert.equal(project.plataforma, 'app_web');
  const updated = store.updateProject(project.id, { plataforma: 'app' });
  assert.equal(updated.plataforma, 'app');
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

test('setTaskOnDate resolves a checklist pendency without changing another date', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '44',
    cliente: 'Cliente histórico',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.setTaskOnDate(project.id, '2024-01-03', 'Checklist', true, '2024-01-05T12:00:00.000Z');
  const updated = store.getProject(project.id);
  assert.equal(updated.checklistHistorico['2024-01-03'], true);
  assert.equal(updated.checklistHistorico['2024-01-02'], undefined);
});

test('updateProject can schedule a next-day lembrete', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '12',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
  });
  store.updateProject(project.id, {
    lembreteProximoDia: 'Checar gateway',
    lembreteParaData: '2024-01-11',
  });
  const updated = store.getProject(project.id);
  assert.equal(updated.lembreteProximoDia, 'Checar gateway');
  assert.equal(updated.lembreteParaData, '2024-01-11');
});

test('markEstimativaDone and markVideoDone keep history like deploy', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '10',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
  });
  store.markEstimativaDone(project.id, '2024-01-05T12:00:00.000Z', '2024-01-05');
  store.markVideoDone(project.id, '2024-01-05T13:00:00.000Z', '2024-01-05');
  const updated = store.getProject(project.id);
  assert.equal(updated.estimativa.feita, true);
  assert.equal(updated.video.feito, true);
  assert.equal(updated.estimativas.length, 1);
  assert.equal(updated.videos.length, 1);
  store.clearEstimativa(project.id);
  store.clearVideo(project.id);
  const cleared = store.getProject(project.id);
  assert.equal(cleared.estimativa.feita, false);
  assert.equal(cleared.video.feito, false);
  assert.deepEqual(cleared.estimativas, []);
  assert.deepEqual(cleared.videos, []);
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

test('markMeetingDone records a meeting with context and keeps the history ordered by date', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '92',
    cliente: 'Cliente reunião',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.markMeetingDone(project.id, '2024-01-03', 'Cliente aprovou a proposta e pediu ajustes no onboarding.', 'recompra');
  const updated = store.getProject(project.id);
  assert.equal(updated.reunioes.length, 1);
  assert.equal(updated.reunioes[0].data, '2024-01-03');
  assert.equal(updated.reunioes[0].contexto, 'Cliente aprovou a proposta e pediu ajustes no onboarding.');
  assert.equal(updated.reunioes[0].tipo, 'recompra');
  assert.equal(updated.reunioes[0].feito, true);
});

test('project with bonus days leaves the current queue once the bonus is consumed', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '701',
    cliente: 'Cliente bonus',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
    diasBonus: 1,
  });

  store.updateProject(project.id, { checklistHistorico: { '2024-01-01': true, '2024-01-02': true, '2024-01-03': true }, diasBonus: 1 });
  const queue = store.getQueueProjects();
  assert.deepEqual(queue.map((item) => item.id), []);
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

test('addProject accepts a custom entry date and can be kept outside the current queue', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '99',
    cliente: 'Cliente futuro',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-02-05',
    ativo: false,
  });

  assert.equal(project.dataEntradaFila, '2024-02-05');
  assert.equal(project.ativo, false);
  assert.equal(store.getProject(project.id).ativo, false);
});

test('getQueueProjects sorts by project number and supports manual reordering', () => {
  const store = makeTempStore();
  const projectA = store.addProject({ numero: '200', cliente: 'Zebra', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });
  const projectB = store.addProject({ numero: '90', cliente: 'Alpha', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });
  const projectC = store.addProject({ numero: '150', cliente: 'Beta', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });

  assert.deepEqual(store.getQueueProjects().map((project) => project.numero), ['90', '150', '200']);

  store.moveProjectInQueue(projectA.id, -1);
  assert.deepEqual(store.getQueueProjects().map((project) => project.numero), ['90', '200', '150']);

  store.resetQueueOrder();
  assert.deepEqual(store.getQueueProjects().map((project) => project.numero), ['90', '150', '200']);
});

test('addProject uses the current queue date when no explicit entry date is supplied', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '777',
    cliente: 'Sem data',
    contextoMacro: 'Contexto',
    dataEntradaFila: '',
  });

  assert.equal(project.dataEntradaFila, '2024-01-01');
  assert.equal(store.getProject(project.id).dataEntradaFila, '2024-01-01');
});

test('addProject can persist a project without a queue', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '778',
    cliente: 'Sem fila',
    contextoMacro: 'Contexto',
    semFila: true,
  });

  assert.equal(project.dataEntradaFila, null);
  assert.equal(project.ativo, true);
  assert.deepEqual(store.getQueueProjects().map((item) => item.id), []);
});

test('createFila saves a destination queue without replacing the active queue', () => {
  const store = makeTempStore();
  const created = store.createFila({ dataInicio: '2024-02-05' });

  assert.equal(store.getFila().dataInicio, '2024-01-01');
  assert.equal(created.dataInicio, '2024-02-05');
  assert.equal(store.getSavedQueues()[0].dataInicio, '2024-02-05');
});

test('ensureCurrentFila creates and switches to a new queue after the current end date', () => {
  const store = makeTempStore();

  const next = store.ensureCurrentFila('2024-01-10');

  assert.equal(next.dataInicio, '2024-01-10');
  assert.equal(store.getFila().dataInicio, '2024-01-10');
  assert.equal(store.getSavedQueues().some((queue) => queue.dataInicio === '2024-01-10'), true);
});

test('ensureCurrentFila switches to an already saved queue at rollover date', () => {
  const store = makeTempStore();
  store.createFila({ dataInicio: '2024-01-10' });

  const next = store.ensureCurrentFila('2024-01-10');

  assert.equal(next.dataInicio, '2024-01-10');
  assert.equal(store.getFila().dataInicio, '2024-01-10');
});

test('getProjectsForQueue returns projects from the selected saved queue', () => {
  const store = makeTempStore();
  const current = store.addProject({ numero: '1', cliente: 'Atual', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });
  const savedQueue = store.createFila({ dataInicio: '2024-02-05' });
  const future = store.addProject({ numero: '2', cliente: 'Futura', contextoMacro: 'Contexto', dataEntradaFila: savedQueue.dataInicio });

  assert.deepEqual(store.getProjectsForQueue(store.getFila()).map((project) => project.id), [current.id]);
  assert.deepEqual(store.getProjectsForQueue(savedQueue).map((project) => project.id), [future.id]);
});

test('updateProject rejects moving a project into a full queue', () => {
  const store = makeTempStore();
  for (let i = 0; i < 8; i += 1) {
    store.addProject({ numero: String(i), cliente: 'Cliente', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });
  }
  const outside = store.addProject({ numero: '9', cliente: 'Fora', contextoMacro: 'Contexto', semFila: true });

  assert.throws(
    () => store.updateProject(outside.id, { semFila: false, dataEntradaFila: '2024-01-01', ativo: true }),
    /8 projetos ativos/
  );
});

test('reorderQueueProjects can reorder a selected saved queue without changing current queue', () => {
  const store = makeTempStore();
  const currentA = store.addProject({ numero: '1', cliente: 'Atual A', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });
  const currentB = store.addProject({ numero: '2', cliente: 'Atual B', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });
  const savedQueue = store.createFila({ dataInicio: '2024-02-05' });
  const savedA = store.addProject({ numero: '10', cliente: 'Futura A', contextoMacro: 'Contexto', dataEntradaFila: savedQueue.dataInicio });
  const savedB = store.addProject({ numero: '11', cliente: 'Futura B', contextoMacro: 'Contexto', dataEntradaFila: savedQueue.dataInicio });

  store.reorderQueueProjects([savedB.id, savedA.id], savedQueue);

  assert.deepEqual(store.getProjectsForQueue(savedQueue).map((project) => project.id), [savedB.id, savedA.id]);
  assert.deepEqual(store.getProjectsForQueue(store.getFila()).map((project) => project.id), [currentA.id, currentB.id]);
});

test('bonus days are counted from the project entry date, not queue start', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '701',
    cliente: 'Entrada tardia',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-04',
  });

  store.updateProject(project.id, {
    diasBonus: 1,
    checklistHistorico: { '2024-01-04': true, '2024-01-05': true },
  });
  assert.deepEqual(store.getQueueProjects().map((item) => item.id), [project.id]);

  store.updateProject(project.id, {
    diasBonus: 1,
    checklistHistorico: { '2024-01-04': true, '2024-01-05': true, '2024-01-08': true },
  });
  assert.deepEqual(store.getQueueProjects().map((item) => item.id), []);
});

test('scheduleMeeting creates a visual agenda item with project identity and reason', () => {
  const store = makeTempStore();
  const project = store.addProject({ numero: '42', cliente: 'Cliente Meet', contextoMacro: 'Contexto' });

  const meeting = store.scheduleMeeting(project.id, {
    data: '2024-01-03',
    hora: '14:30',
    motivo: 'primeiro_meet',
    contexto: 'Briefing inicial',
  });
  const agenda = store.getAgendaMeetings('2024-01-03');

  assert.equal(meeting.feito, false);
  assert.equal(agenda.length, 1);
  assert.equal(agenda[0].numero, '42');
  assert.equal(agenda[0].cliente, 'Cliente Meet');
  assert.equal(agenda[0].motivo, 'primeiro_meet');
  assert.equal(agenda[0].hora, '14:30');
});

test('scheduleMeeting can create an agenda item without a project', () => {
  const store = makeTempStore();

  const meeting = store.scheduleMeeting(null, {
    data: '2024-01-04',
    hora: '09:00',
    motivo: 'alinhamento',
    cliente: 'Cliente externo',
    numero: '',
    contexto: 'Alocado para call sem projeto cadastrado',
  });
  const agenda = store.getAgendaMeetings('2024-01-04');

  assert.equal(meeting.projectId, null);
  assert.equal(agenda.length, 1);
  assert.equal(agenda[0].cliente, 'Cliente externo');
  assert.equal(agenda[0].contexto, 'Alocado para call sem projeto cadastrado');
});

test('setMeetingDone and removeMeeting update project and standalone meetings', () => {
  const store = makeTempStore();
  const project = store.addProject({ numero: '42', cliente: 'Cliente Meet', contextoMacro: 'Contexto' });
  const projectMeeting = store.scheduleMeeting(project.id, { data: '2024-01-03', hora: '14:30', motivo: 'alinhamento' });
  const looseMeeting = store.scheduleMeeting(null, { data: '2024-01-03', hora: '16:00', motivo: 'recompra', cliente: 'Avulso' });

  store.setMeetingDone(projectMeeting.id, true);
  assert.equal(store.getAgendaMeetings('2024-01-03').find((item) => item.id === projectMeeting.id).feito, true);

  store.removeMeeting(looseMeeting.id);
  assert.equal(store.getAgendaMeetings('2024-01-03').some((item) => item.id === looseMeeting.id), false);
});

test('next meeting question persists until a project meeting is marked done', () => {
  const store = makeTempStore();
  const project = store.addProject({ numero: '43', cliente: 'Cliente Duvida', contextoMacro: 'Contexto' });

  store.updateProject(project.id, { proximaDuvidaMeeting: 'Confirmar gateway de pagamento' });
  const meeting = store.scheduleMeeting(project.id, { data: '2024-01-03', hora: '15:00', motivo: 'alinhamento' });

  assert.equal(store.getAgendaMeetings('2024-01-03')[0].contexto, 'Confirmar gateway de pagamento');
  store.removeMeeting(meeting.id);
  assert.equal(store.getProject(project.id).proximaDuvidaMeeting, 'Confirmar gateway de pagamento');

  const rescheduled = store.scheduleMeeting(project.id, { data: '2024-01-04', hora: '15:00', motivo: 'alinhamento' });
  store.setMeetingDone(rescheduled.id, true);

  assert.equal(store.getProject(project.id).proximaDuvidaMeeting, '');
});

test('removeProject deletes a project from persistence', () => {
  const store = makeTempStore();
  const project = store.addProject({ numero: '779', cliente: 'Remover', contextoMacro: 'Contexto' });

  store.removeProject(project.id);

  assert.equal(store.getProject(project.id), null);
});

test('reorderQueueProjects accepts the full desired queue order based on project ids', () => {
  const store = makeTempStore();
  const projectA = store.addProject({ numero: '200', cliente: 'Zebra', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });
  const projectB = store.addProject({ numero: '90', cliente: 'Alpha', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });
  const projectC = store.addProject({ numero: '150', cliente: 'Beta', contextoMacro: 'Contexto', dataEntradaFila: '2024-01-01' });

  store.reorderQueueProjects([projectB.id, projectC.id, projectA.id]);

  assert.deepEqual(store.getQueueProjects().map((project) => project.numero), ['90', '150', '200']);
});
