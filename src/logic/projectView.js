const { countBusinessDays, getQueueTriggers } = require('./businessDays');
const { computeDeployStatus } = require('./deployStatus');

function annotateProject(project, todayDateStr) {
  const diasUteis = countBusinessDays(project.dataEntradaFila, todayDateStr);
  const triggers = getQueueTriggers(diasUteis);
  const statusDeploy = computeDeployStatus(project.ultimoDeploy, project.ultimoChecklistFeitoEm);

  return {
    ...project,
    diasBonus: project.diasBonus || 0,
    diasUteis,
    statusDeploy,
    avisoDeployObrigatorio: triggers.deployObrigatorio,
    avisoVideoEEnv: triggers.videoEEnv,
  };
}

module.exports = { annotateProject };
