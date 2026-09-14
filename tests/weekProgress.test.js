const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDayStatus, computeQueueDayStatus } = require('../src/logic/weekProgress');

const today = '2024-01-08';

function project(overrides = {}) {
  return {
    ativo: true,
    checklistHistorico: {},
    estimativa: { feita: false },
    deploys: [],
    ...overrides,
  };
}

test('future queue days stay empty', () => {
  assert.equal(
    computeDayStatus({ dateStr: '2024-01-09', dayNumber: 7, today, project: project() }),
    'future'
  );
});

test('days 1-5 are done only with checklist', () => {
  const overdue = computeDayStatus({
    dateStr: '2024-01-01',
    dayNumber: 1,
    today,
    project: project(),
  });
  const done = computeDayStatus({
    dateStr: '2024-01-01',
    dayNumber: 1,
    today,
    project: project({ checklistHistorico: { '2024-01-01': true } }),
  });
  assert.equal(overdue, 'overdue');
  assert.equal(done, 'done');
});

test('days 6 and 7 also require a deploy on that day', () => {
  const withCheck = project({ checklistHistorico: { '2024-01-08': true } });
  assert.equal(
    computeDayStatus({ dateStr: '2024-01-08', dayNumber: 6, today, project: withCheck }),
    'current'
  );

  const withDeploy = project({
    checklistHistorico: { '2024-01-08': true },
    deploys: [{ em: '2024-01-08T15:00:00.000Z', data: '2024-01-08' }],
  });
  assert.equal(
    computeDayStatus({ dateStr: '2024-01-08', dayNumber: 6, today, project: withDeploy }),
    'done'
  );
});

test('day 7 also requires the video', () => {
  const almost = project({
    checklistHistorico: { '2024-01-09': true },
    video: { feito: false },
    deploys: [{ em: '2024-01-09T12:00:00.000Z', data: '2024-01-09' }],
  });
  assert.equal(
    computeDayStatus({ dateStr: '2024-01-09', dayNumber: 7, today: '2024-01-09', project: almost }),
    'current'
  );

  const complete = { ...almost, video: { feito: true, feitoEm: '2024-01-09' } };
  assert.equal(
    computeDayStatus({ dateStr: '2024-01-09', dayNumber: 7, today: '2024-01-09', project: complete }),
    'done'
  );
});

test('queue day is overdue if any active project missed a closed day', () => {
  const done = project({ checklistHistorico: { '2024-01-01': true } });
  const pending = project({ id: 'b' });
  assert.equal(
    computeQueueDayStatus({
      dateStr: '2024-01-01',
      dayNumber: 1,
      today,
      projects: [done, pending],
    }),
    'overdue'
  );
  assert.equal(
    computeQueueDayStatus({
      dateStr: '2024-01-01',
      dayNumber: 1,
      today,
      projects: [done],
    }),
    'done'
  );
});

test('an unfinished day stays current until midnight, then becomes overdue', () => {
  const open = computeDayStatus({
    dateStr: '2024-01-02',
    dayNumber: 2,
    today: '2024-01-02',
    project: project(),
  });
  const closed = computeDayStatus({
    dateStr: '2024-01-02',
    dayNumber: 2,
    today: '2024-01-03',
    project: project(),
  });
  assert.equal(open, 'current');
  assert.equal(closed, 'overdue');
});

test('unchecking today video reopens only that day', () => {
  const marked = project({
    checklistHistorico: { '2024-01-09': true },
    videoHistorico: { '2024-01-09': false },
    video: { feito: true, feitoEm: '2024-01-01' },
    deploys: [{ em: '2024-01-09T12:00:00.000Z', data: '2024-01-09' }],
  });
  assert.equal(
    computeDayStatus({ dateStr: '2024-01-09', dayNumber: 7, today: '2024-01-09', project: marked }),
    'current'
  );
});

test('video marked after day 7 does not clear that closed day', () => {
  const late = project({
    checklistHistorico: { '2024-01-09': true },
    video: { feito: true, feitoEm: '2024-01-10' },
    deploys: [{ em: '2024-01-09T12:00:00.000Z', data: '2024-01-09' }],
  });
  assert.equal(
    computeDayStatus({ dateStr: '2024-01-09', dayNumber: 7, today: '2024-01-10', project: late }),
    'overdue'
  );
});
