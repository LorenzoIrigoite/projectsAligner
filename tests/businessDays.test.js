const test = require('node:test');
const assert = require('node:assert/strict');
const { countBusinessDays, getQueueTriggers } = require('../src/logic/businessDays');

test('countBusinessDays counts the start day itself as day 1', () => {
  // 2024-01-01 is a Monday
  assert.equal(countBusinessDays('2024-01-01', '2024-01-01'), 1);
});

test('countBusinessDays skips weekends', () => {
  // Mon 1 -> Sun 7: Mon,Tue,Wed,Thu,Fri = 5 business days, weekend excluded
  assert.equal(countBusinessDays('2024-01-01', '2024-01-07'), 5);
});

test('countBusinessDays continues counting into the next week', () => {
  // Mon 1 -> Mon 8: previous 5 + the following Monday = 6
  assert.equal(countBusinessDays('2024-01-01', '2024-01-08'), 6);
});

test('countBusinessDays returns 0 when today is before the start date', () => {
  assert.equal(countBusinessDays('2024-01-01', '2023-12-25'), 0);
});

test('getQueueTriggers flags deploy obrigatorio only on day 6 and day 7', () => {
  assert.equal(getQueueTriggers(5).deployObrigatorio, false);
  assert.equal(getQueueTriggers(6).deployObrigatorio, true);
  assert.equal(getQueueTriggers(7).deployObrigatorio, true);
  assert.equal(getQueueTriggers(8).deployObrigatorio, false);
});

test('getQueueTriggers flags video e env only on day 7', () => {
  assert.equal(getQueueTriggers(6).videoEEnv, false);
  assert.equal(getQueueTriggers(7).videoEEnv, true);
  assert.equal(getQueueTriggers(8).videoEEnv, false);
});
