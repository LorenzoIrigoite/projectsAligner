const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/data/store');
const { annotateProject } = require('../src/logic/projectView');
const { listQueueDays } = require('../src/logic/businessDays');
const { hasDeployOn, localDateFromIso } = require('../src/logic/weekProgress');

const START = '2026-09-14';
const FILA = { dataInicio: START, dataFim: '2026-09-22' };

function dayStatus(project, today, dateStr) {
  const view = annotateProject(project, today, FILA);
  return view.semana.find((day) => day.date === dateStr);
}

function queueStatus(projects, today, dateStr) {
  const views = projects.map((project) => annotateProject(project, today, FILA));
  const index = listQueueDays(START, 7).indexOf(dateStr);
  const allDone = views.every((project) => project.semana[index] && project.semana[index].status === 'done');
  if (dateStr > today) return 'future';
  if (allDone) return 'done';
  return dateStr < today ? 'overdue' : 'current';
}

test('day 1 closes and reopens from the checklist, and the ball follows every project', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-aligner-flow-'));
  const store = createStore(dir);
  store.setFila(FILA);
  const a = store.addProject({ numero: '567', cliente: 'A', contextoMacro: '' });
  const b = store.addProject({ numero: '568', cliente: 'B', contextoMacro: '' });
  const today = START;

  assert.equal(dayStatus(store.getProject(a.id), today, today).status, 'current');
  assert.equal(queueStatus([store.getProject(a.id), store.getProject(b.id)], today, today), 'current');

  store.toggleChecklistToday(a.id, today, true, `${today}T12:00:00.000Z`);
  assert.equal(dayStatus(store.getProject(a.id), today, today).status, 'done');
  assert.equal(queueStatus([store.getProject(a.id), store.getProject(b.id)], today, today), 'current');

  store.toggleChecklistToday(b.id, today, true, `${today}T12:00:00.000Z`);
  assert.equal(queueStatus([store.getProject(a.id), store.getProject(b.id)], today, today), 'done');

  store.toggleChecklistToday(a.id, today, false, `${today}T12:00:00.000Z`);
  assert.equal(dayStatus(store.getProject(a.id), today, today).status, 'current');
  assert.equal(queueStatus([store.getProject(a.id), store.getProject(b.id)], today, today), 'current');
});

test('day 6 needs estimativa and deploy, day 7 needs video, and unchecking only that day reopens it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-aligner-flow-'));
  const store = createStore(dir);
  store.setFila(FILA);
  const project = store.addProject({ numero: '1', cliente: 'A', contextoMacro: '' });
  const days = listQueueDays(START, 7);
  const day6 = days[5];
  const day7 = days[6];

  store.toggleChecklistToday(project.id, day6, true, `${day6}T12:00:00.000Z`);
  assert.deepEqual(dayStatus(store.getProject(project.id), day6, day6).faltas, ['Estimativa', 'Deploy']);

  store.setEstimativaOnDate(project.id, day6, true, `${day6}T13:00:00.000Z`);
  store.setDeployOnDate(project.id, day6, true, `${day6}T15:00:00.000Z`);
  assert.equal(dayStatus(store.getProject(project.id), day6, day6).status, 'done');
  store.setDeployOnDate(project.id, day6, false, `${day6}T16:00:00.000Z`);
  assert.equal(dayStatus(store.getProject(project.id), day6, day6).status, 'current');

  store.setDeployOnDate(project.id, day6, true, `${day6}T15:00:00.000Z`);
  store.toggleChecklistToday(project.id, day7, true, `${day7}T12:00:00.000Z`);
  store.setDeployOnDate(project.id, day7, true, `${day7}T15:00:00.000Z`);
  assert.deepEqual(dayStatus(store.getProject(project.id), day7, day7).faltas, ['Vídeo']);

  store.toggleVideoToday(project.id, day7, true);
  assert.equal(dayStatus(store.getProject(project.id), day7, day7).status, 'done');
  store.toggleVideoToday(project.id, day7, false);
  assert.equal(dayStatus(store.getProject(project.id), day7, day7).status, 'current');
  assert.equal(dayStatus(store.getProject(project.id), day7, day6).status, 'done');
});

test('a deploy timestamp uses the local day, not the UTC date', () => {
  const iso = '2026-09-14T02:03:23.167Z';
  const localDay = localDateFromIso(iso);
  const project = { deploys: [], ultimoDeploy: iso };
  assert.equal(hasDeployOn(project, localDay), true);
  if (localDay !== iso.slice(0, 10)) {
    assert.equal(hasDeployOn(project, iso.slice(0, 10)), false);
  }
});
