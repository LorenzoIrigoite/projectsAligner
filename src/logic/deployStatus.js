function computeDeployStatus(ultimoDeploy, ultimoChecklistFeitoEm) {
  if (!ultimoDeploy) return 'nunca_implantado';
  if (!ultimoChecklistFeitoEm) return 'atualizado';

  const deployTime = new Date(ultimoDeploy).getTime();
  const checklistTime = new Date(ultimoChecklistFeitoEm).getTime();

  return checklistTime > deployTime ? 'pendente' : 'atualizado';
}

module.exports = { computeDeployStatus };
