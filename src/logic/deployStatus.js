function computeDeployStatus(ultimoDeploy, checklistHistorico) {
  if (!ultimoDeploy) return 'nunca_implantado';

  const deployTime = new Date(ultimoDeploy).getTime();
  const hasNewerChecklist = Object.entries(checklistHistorico || {}).some(
    ([dateStr, done]) => done && new Date(`${dateStr}T23:59:59Z`).getTime() > deployTime
  );

  return hasNewerChecklist ? 'pendente' : 'atualizado';
}

module.exports = { computeDeployStatus };
