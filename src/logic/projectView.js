const { countBusinessDays, getQueueTriggers, listQueueDays, queueEndDate } = require('./businessDays');
const { computeDeployStatus } = require('./deployStatus');
const { buildSemana, normalizeDeploys } = require('./weekProgress');

function projectQueuePeriod(project, fila) {
  const queueStart = fila && fila.dataInicio;
  const queueEnd = fila && fila.dataFim;
  const entry = project.dataEntradaFila;
  if (entry && queueStart && queueEnd && (entry < queueStart || entry > queueEnd)) return null;
  const startsInsideQueue = entry && queueStart && queueEnd && entry >= queueStart && entry <= queueEnd;
  const start = startsInsideQueue ? entry : queueStart;
  if (!start) return null;
  const period = queueEndDate(start, 7);
  return { dataInicio: period.dataInicio, dataFim: period.dataFim };
}

function annotateProject(project, todayDateStr, fila) {
  const period = projectQueuePeriod(project, fila);
  const start = period && period.dataInicio;
  const end = period && period.dataFim;
  let countUntil = todayDateStr;
  if (start && end && todayDateStr > end) countUntil = end;
  const diasUteis = start ? countBusinessDays(start, countUntil) : 0;
  const triggers = getQueueTriggers(diasUteis);
  const statusDeploy = computeDeployStatus(project.ultimoDeploy, project.ultimoChecklistFeitoEm);
  const queueDates = start ? listQueueDays(start, 7) : [];
  const deploys = normalizeDeploys(project);

  return {
    ...project,
    deploys,
    diasBonus: project.diasBonus || 0,
    diasUteis,
    statusDeploy,
    avisoDeployObrigatorio: triggers.deployObrigatorio,
    avisoVideoEEnv: triggers.videoEEnv,
    semana: buildSemana(queueDates, todayDateStr, { ...project, deploys }),
  };
}

module.exports = { annotateProject, projectQueuePeriod };
