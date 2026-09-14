const DAY_MS = 24 * 60 * 60 * 1000;

function toUTCDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isWeekend(date) {
  const weekday = date.getUTCDay();
  return weekday === 0 || weekday === 6;
}

function countBusinessDays(startDateStr, todayDateStr) {
  const start = toUTCDate(startDateStr);
  const end = toUTCDate(todayDateStr);
  if (end < start) return 0;

  let count = 0;
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    if (!isWeekend(cursor)) count += 1;
  }
  return count;
}

function getQueueTriggers(businessDayCount) {
  return {
    deployObrigatorio: businessDayCount === 6 || businessDayCount === 7,
    videoEEnv: businessDayCount === 7,
  };
}

module.exports = { countBusinessDays, getQueueTriggers };
