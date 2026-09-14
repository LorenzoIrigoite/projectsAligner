function localDateFromIso(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDeploys(project) {
  if (Array.isArray(project.deploys) && project.deploys.length > 0) {
    return project.deploys.map((entry) => ({
      em: entry.em,
      data: entry.data || localDateFromIso(entry.em),
    }));
  }
  if (project.ultimoDeploy) {
    return [{ em: project.ultimoDeploy, data: localDateFromIso(project.ultimoDeploy) }];
  }
  return [];
}

function hasDeployOn(project, dateStr) {
  return normalizeDeploys(project).some((entry) => entry.data === dateStr);
}

function videoCovers(project, dateStr) {
  if (project.videoHistorico && Object.prototype.hasOwnProperty.call(project.videoHistorico, dateStr)) {
    return !!project.videoHistorico[dateStr];
  }
  const video = project.video;
  if (!video?.feito) return false;
  if (!video.feitoEm) return true;
  return String(video.feitoEm).slice(0, 10) === dateStr || String(video.feitoEm).slice(0, 10) <= dateStr;
}

function missingTasks({ dateStr, dayNumber, project }) {
  const missing = [];
  if (!project.checklistHistorico?.[dateStr]) missing.push('Checklist');
  if (dayNumber >= 6 && !hasDeployOn(project, dateStr)) missing.push('Deploy');
  if (dayNumber === 7 && !videoCovers(project, dateStr)) missing.push('Vídeo');
  return missing;
}

function computeDayStatus({ dateStr, dayNumber, today, project }) {
  if (dateStr > today) return 'future';

  const complete = missingTasks({ dateStr, dayNumber, project }).length === 0;
  if (complete) return 'done';
  return dateStr < today ? 'overdue' : 'current';
}

function computeQueueDayStatus({ dateStr, dayNumber, today, projects }) {
  if (dateStr > today) return 'future';
  const active = (projects || []).filter((project) => project.ativo);
  if (active.length === 0) return 'pending';
  const allDone = active.every(
    (project) => computeDayStatus({ dateStr, dayNumber, today, project }) === 'done'
  );
  if (allDone) return 'done';
  return dateStr < today ? 'overdue' : 'current';
}

function buildSemana(queueDates, today, project) {
  return (queueDates || []).map((dateStr, index) => {
    const dayNumber = index + 1;
    const status = computeDayStatus({ dateStr, dayNumber, today, project });
    return {
      dayNumber,
      date: dateStr,
      status,
      faltas: status === 'done' || status === 'future'
        ? []
        : missingTasks({ dateStr, dayNumber, project }),
    };
  });
}

module.exports = {
  localDateFromIso,
  normalizeDeploys,
  hasDeployOn,
  videoCovers,
  missingTasks,
  computeDayStatus,
  computeQueueDayStatus,
  buildSemana,
};
