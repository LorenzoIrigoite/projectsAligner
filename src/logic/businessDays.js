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
    estimativaObrigatoria: businessDayCount === 6,
    videoEEnv: businessDayCount === 7,
  };
}

function toISODate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function queueEndDate(startDateStr, businessDays = 7) {
  if (!startDateStr) throw new Error('Informe o início da fila.');
  const start = toUTCDate(startDateStr);
  const startIsBusinessDay = !isWeekend(start);
  let cursor = start;
  while (isWeekend(cursor)) cursor = new Date(cursor.getTime() + DAY_MS);

  const firstBusinessDay = toISODate(cursor);
  let counted = 0;
  while (counted < businessDays) {
    if (!isWeekend(cursor)) counted += 1;
    if (counted === businessDays) break;
    cursor = new Date(cursor.getTime() + DAY_MS);
  }

  return {
    dataInicio: startDateStr,
    dataFim: toISODate(cursor),
    startIsBusinessDay,
    firstBusinessDay,
    businessDays,
  };
}

function listQueueDays(startDateStr, businessDays = 7) {
  const { firstBusinessDay } = queueEndDate(startDateStr, businessDays);
  const days = [];
  let cursor = toUTCDate(firstBusinessDay);
  while (days.length < businessDays) {
    if (!isWeekend(cursor)) days.push(toISODate(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return days;
}

module.exports = { countBusinessDays, getQueueTriggers, queueEndDate, listQueueDays };
