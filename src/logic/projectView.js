const { countBusinessDays, getQueueTriggers, listQueueDays } = require('./businessDays');
const { computeDeployStatus } = require('./deployStatus');
const { buildSemana, normalizeDeploys } = require('./weekProgress');

function annotateProject(project, todayDateStr, fila) {
  const start = fila && fila.dataInicio;
  const end = fila && fila.dataFim;
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

module.exports = { annotateProject };
