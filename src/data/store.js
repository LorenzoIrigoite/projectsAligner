const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { queueEndDate, listQueueDays } = require('../logic/businessDays');
const { localDateFromIso } = require('../logic/weekProgress');

const MAX_ACTIVE_PROJECTS = 8;

function normalizeProjectNumber(value) {
  if (value === null || value === undefined || value === '') return Number.MAX_SAFE_INTEGER;
  const raw = String(value).trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function projectMatchesCurrentQueue(project, fila) {
  if (project.semFila) return false;
  if (!fila) return !!project.ativo;
  if (!project.ativo) return false;
  if (!project.dataEntradaFila) return true;

  const withinQueue = project.dataEntradaFila >= fila.dataInicio && project.dataEntradaFila <= fila.dataFim;
  if (!withinQueue) return false;

  const bonusThreshold = Math.max(0, Number(project.diasBonus) || 0);
  if (bonusThreshold > 0) {
    const queueDates = listQueueDays(project.dataEntradaFila || fila.dataInicio, 7);
    const completed = queueDates.filter((date) => project.checklistHistorico?.[date]).length;
    if (completed >= Math.max(3, bonusThreshold + 2)) {
      return false;
    }
  }

  return true;
}

function queueKey(fila) {
  return fila?.dataInicio || '';
}

function projectQueueOrder(project, fila) {
  const keyed = project.ordemPorFila?.[queueKey(fila)];
  if (Number.isFinite(Number(keyed))) return Number(keyed);
  if (Number.isFinite(Number(project.ordemFila))) return Number(project.ordemFila);
  return Number.MAX_SAFE_INTEGER;
}

function compareProjectOrder(a, b) {
  const aNum = normalizeProjectNumber(a.numero);
  const bNum = normalizeProjectNumber(b.numero);
  if (aNum !== bNum) return aNum - bNum;
  return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR', { sensitivity: 'base' });
}

const PLATAFORMAS = new Set(['app', 'web', 'app_web']);

function normalizePlataforma(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s+/_-]+/g, '_');
  if (key === 'app_web' || key === 'appweb' || key === 'ambos') return 'app_web';
  if (PLATAFORMAS.has(key)) return key;
  return 'web';
}

function withDefaults(project) {
  const estimativa = project.estimativa || { feita: false, nota: '' };
  const video = project.video || { feito: false, nota: '' };
  let estimativas = Array.isArray(project.estimativas) ? project.estimativas : [];
  if (estimativas.length === 0 && estimativa.feita && estimativa.feitaEm) {
    estimativas = [{ em: `${estimativa.feitaEm}T12:00:00.000Z`, data: String(estimativa.feitaEm).slice(0, 10) }];
  }
  let videos = Array.isArray(project.videos) ? project.videos : [];
  if (videos.length === 0 && video.feito && video.feitoEm) {
    videos = [{ em: `${video.feitoEm}T12:00:00.000Z`, data: String(video.feitoEm).slice(0, 10) }];
  }
  return {
    ...project,
    plataforma: normalizePlataforma(project.plataforma),
    diasBonus: Number.isFinite(Number(project.diasBonus)) ? Number(project.diasBonus) : 0,
    lembreteProximoDia: project.lembreteProximoDia || '',
    lembreteParaData: project.lembreteParaData || null,
    proximaDuvidaMeeting: project.proximaDuvidaMeeting || '',
    meetings: Array.isArray(project.meetings) ? project.meetings : [],
    estimativas,
    videos,
    estimativa,
    video,
  };
}

function createStore(baseDir) {
  const dataFile = path.join(baseDir, 'projects.json');
  const uploadsDir = path.join(baseDir, 'uploads');

  function ensureBaseFiles() {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(dataFile)) {
      fs.writeFileSync(dataFile, JSON.stringify({ projects: [] }, null, 2));
    }
  }

  function readAll() {
    ensureBaseFiles();
    return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  }

  function writeAll(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  }

  function getAllProjects() {
    return readAll().projects.map(withDefaults);
  }

  function getProject(id) {
    const project = readAll().projects.find((p) => p.id === id) || null;
    return project ? withDefaults(project) : null;
  }

  function getFila() {
    return readAll().fila || null;
  }

  function getSavedQueues() {
    const data = readAll();
    return Array.isArray(data.filasSalvas) ? [...data.filasSalvas].sort((a, b) => String(b.dataInicio || '').localeCompare(String(a.dataInicio || ''))) : [];
  }

  function saveQueueSnapshot(data, period) {
    const snapshot = { dataInicio: period.dataInicio, dataFim: period.dataFim };
    const existing = Array.isArray(data.filasSalvas) ? data.filasSalvas : [];
    const nextHistory = existing.filter((entry) => !(entry.dataInicio === snapshot.dataInicio && entry.dataFim === snapshot.dataFim));
    data.filasSalvas = [snapshot, ...nextHistory].slice(0, 12);
    return snapshot;
  }

  function setFila({ dataInicio }) {
    const period = queueEndDate(dataInicio, 7);
    const data = readAll();
    data.fila = { dataInicio: period.dataInicio, dataFim: period.dataFim };
    saveQueueSnapshot(data, period);
    writeAll(data);
    return data.fila;
  }

  function createFila({ dataInicio }) {
    const period = queueEndDate(dataInicio, 7);
    const data = readAll();
    const snapshot = saveQueueSnapshot(data, period);
    writeAll(data);
    return snapshot;
  }

  function ensureCurrentFila(todayStr) {
    const data = readAll();
    if (!data.fila) {
      const period = queueEndDate(todayStr, 7);
      data.fila = { dataInicio: period.dataInicio, dataFim: period.dataFim };
      saveQueueSnapshot(data, period);
      writeAll(data);
      return data.fila;
    }
    if (todayStr <= data.fila.dataFim) return data.fila;

    const existing = (Array.isArray(data.filasSalvas) ? data.filasSalvas : [])
      .find((queue) => queue.dataInicio <= todayStr && todayStr <= queue.dataFim);
    const period = existing || queueEndDate(todayStr, 7);
    data.fila = { dataInicio: period.dataInicio, dataFim: period.dataFim };
    saveQueueSnapshot(data, period);
    ensureQueueOrder(data);
    writeAll(data);
    return data.fila;
  }

  function sortQueueProjects(projects, fila = getFila()) {
    const ordered = [...projects].filter((project) => project && project.ativo && projectMatchesCurrentQueue(project, fila));
    ordered.sort(compareProjectOrder);
    ordered.forEach((project, index) => {
      project.ordemFila = index;
    });
    return ordered;
  }

  function ensureQueueOrder(data) {
    const fila = data.fila || getFila();
    const activeQueue = data.projects.filter((project) => project.ativo && projectMatchesCurrentQueue(project, fila));
    const queuedIds = activeQueue
      .sort((a, b) => {
        const manualA = projectQueueOrder(a, fila);
        const manualB = projectQueueOrder(b, fila);
        if (manualA !== manualB) return manualA - manualB;
        return compareProjectOrder(a, b);
      })
      .map((project) => project.id);

    data.projects.forEach((project) => {
      if (!project.ativo || !projectMatchesCurrentQueue(project, fila)) return;
      const nextIndex = queuedIds.indexOf(project.id);
      project.ordemFila = nextIndex >= 0 ? nextIndex : 0;
      project.ordemPorFila = { ...(project.ordemPorFila || {}), [queueKey(fila)]: project.ordemFila };
    });
  }

  function assertQueueCapacity(data, nextProject) {
    if (!nextProject.ativo || nextProject.semFila || !nextProject.dataEntradaFila) return;
    const fila = queueEndDate(nextProject.dataEntradaFila, 7);
    const activeCount = data.projects.filter((project) =>
      project.id !== nextProject.id && project.ativo && projectMatchesCurrentQueue(project, fila)
    ).length;
    if (activeCount >= MAX_ACTIVE_PROJECTS) {
      throw new Error('A fila já tem 8 projetos ativos. Conclua um antes de adicionar outro.');
    }
  }

  function addProject({ numero, cliente, contextoMacro, plataforma = 'web', dataEntradaFila, semFila = false, ativo = true }) {
    const data = readAll();
    const fila = data.fila; const desiredDate = semFila ? null : (dataEntradaFila || (fila && fila.dataInicio) || null);
    const inQueue = Boolean(fila && desiredDate && desiredDate >= fila.dataInicio && desiredDate <= fila.dataFim);

    if (fila && ativo && inQueue) {
      const activeCount = data.projects.filter((p) => p.ativo && projectMatchesCurrentQueue(p, fila)).length;
      if (activeCount >= MAX_ACTIVE_PROJECTS) {
        throw new Error('A fila já tem 8 projetos ativos. Conclua um antes de adicionar outro.');
      }
    }

    const project = {
      id: crypto.randomUUID(),
      numero,
      cliente,
      contextoMacro,
      plataforma: normalizePlataforma(plataforma),
      dataEntradaFila: desiredDate,
      semFila: Boolean(semFila),
      diasBonus: 0,
      ativo: Boolean(ativo),
      checklistHistorico: {},
      reunioes: [],
      ultimoDeploy: null,
      ultimoChecklistFeitoEm: null,
      deploys: [],
      estimativas: [],
      videos: [],
      videoHistorico: {},
      estimativa: { feita: false, nota: '' },
      video: { feito: false, nota: '' },
      contexto: '',
      lembreteProximoDia: '',
      lembreteParaData: null,
      proximaDuvidaMeeting: '',
      env: { backendUrl: '', frontendUrl: '', gatewayPagamento: '', chavesApi: [], envRaw: '' },
      credenciais: [],
      fotos: [],
      ordemFila: 0,
      ordemPorFila: {},
      meetings: [],
    };

    data.projects.push(project);
    ensureQueueOrder(data);
    writeAll(data);
    return project;
  }

  function updateProject(id, patch) {
    const data = readAll();
    const index = data.projects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Projeto não encontrado: ${id}`);
    const nextPatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(nextPatch, 'plataforma')) {
      nextPatch.plataforma = normalizePlataforma(nextPatch.plataforma);
    }
    const nextProject = withDefaults({ ...data.projects[index], ...nextPatch });
    assertQueueCapacity(data, nextProject);
    data.projects[index] = nextProject;
    ensureQueueOrder(data);
    writeAll(data);
    return data.projects[index];
  }

  function removeProject(id) {
    const data = readAll();
    const index = data.projects.findIndex((project) => project.id === id);
    if (index === -1) throw new Error(`Projeto não encontrado: ${id}`);
    data.projects.splice(index, 1);
    ensureQueueOrder(data);
    writeAll(data);
  }

  function getQueueProjects(fila = getFila()) {
    const data = readAll();
    const queueProjects = data.projects.filter((project) => project.ativo && projectMatchesCurrentQueue(project, fila));
    queueProjects.sort((a, b) => {
      const aPos = projectQueueOrder(a, fila);
      const bPos = projectQueueOrder(b, fila);
      if (aPos !== bPos) return aPos - bPos;
      return compareProjectOrder(a, b);
    });
    return queueProjects;
  }

  function getProjectsForQueue(fila = getFila()) {
    return getQueueProjects(fila).map(withDefaults);
  }

  function moveProjectInQueue(id, direction) {
    const fila = getFila();
    const data = readAll();
    const queueProjects = data.projects
      .filter((project) => project.ativo && projectMatchesCurrentQueue(project, fila))
      .sort((a, b) => {
        const aPos = projectQueueOrder(a, fila);
        const bPos = projectQueueOrder(b, fila);
        if (aPos !== bPos) return aPos - bPos;
        return compareProjectOrder(a, b);
      });
    const fromIndex = queueProjects.findIndex((project) => project.id === id);
    if (fromIndex === -1) return null;
    const nextIndex = Math.min(queueProjects.length - 1, Math.max(0, fromIndex + direction));
    if (nextIndex === fromIndex) return getQueueProjects(fila);

    const orderedIds = queueProjects.map((project) => project.id);
    const [movedId] = orderedIds.splice(fromIndex, 1);
    orderedIds.splice(nextIndex, 0, movedId);

    orderedIds.forEach((projectId, index) => {
      const project = data.projects.find((item) => item.id === projectId);
      if (project) {
        project.ordemFila = index;
        project.ordemPorFila = { ...(project.ordemPorFila || {}), [queueKey(fila)]: index };
      }
    });
    writeAll(data);
    return getQueueProjects(fila);
  }

  function reorderQueueProjects(orderIds, fila = getFila()) {
    const data = readAll();
    const queueIds = data.projects
      .filter((project) => project.ativo && projectMatchesCurrentQueue(project, fila))
      .map((project) => project.id);

    const orderedIds = Array.isArray(orderIds) ? orderIds.filter((id) => queueIds.includes(id)) : [];
    const missingIds = queueIds.filter((id) => !orderedIds.includes(id));
    orderedIds.push(...missingIds);

    orderedIds.forEach((projectId, index) => {
      const project = data.projects.find((item) => item.id === projectId);
      if (project && project.ativo && projectMatchesCurrentQueue(project, fila)) {
        project.ordemFila = index;
        project.ordemPorFila = { ...(project.ordemPorFila || {}), [queueKey(fila)]: index };
      }
    });

    writeAll(data);
    return getQueueProjects(fila);
  }

  function resetQueueOrder() {
    const data = readAll();
    const fila = data.fila;
    const activeQueue = data.projects.filter((project) => project.ativo && projectMatchesCurrentQueue(project, fila));
    activeQueue.sort(compareProjectOrder);
    activeQueue.forEach((project, index) => {
      project.ordemFila = index;
      project.ordemPorFila = { ...(project.ordemPorFila || {}), [queueKey(fila)]: index };
    });
    writeAll(data);
    return getQueueProjects(fila);
  }

  function toggleChecklistToday(id, dateStr, done, nowIso) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const checklistHistorico = { ...project.checklistHistorico, [dateStr]: done };
    const patch = { checklistHistorico };
    if (done === true && nowIso) patch.ultimoChecklistFeitoEm = nowIso;
    return updateProject(id, patch);
  }

  function existingDeploys(project) {
    if (Array.isArray(project.deploys) && project.deploys.length > 0) return [...project.deploys];
    if (project.ultimoDeploy) {
      return [{ em: project.ultimoDeploy, data: localDateFromIso(project.ultimoDeploy) }];
    }
    return [];
  }

  function markDeployDone(id, nowIso, dateStr) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const deploys = [...existingDeploys(project), { em: nowIso, data: dateStr }];
    return updateProject(id, { ultimoDeploy: nowIso, deploys });
  }

  function markEstimativaDone(id, nowIso, dateStr) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const estimativas = [...(project.estimativas || []), { em: nowIso, data: dateStr }];
    const estimativa = {
      ...(project.estimativa || { feita: false, nota: '' }),
      feita: true,
      feitaEm: dateStr,
    };
    return updateProject(id, { estimativas, estimativa });
  }

  function clearEstimativa(id) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const estimativas = [...(project.estimativas || [])].slice(0, -1);
    const last = estimativas[estimativas.length - 1] || null;
    const estimativa = {
      ...(project.estimativa || { feita: false, nota: '' }),
      feita: estimativas.length > 0,
      feitaEm: last ? last.data : null,
    };
    return updateProject(id, { estimativas, estimativa });
  }

  function setEstimativaOnDate(id, dateStr, done, nowIso) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    let estimativas = [...(project.estimativas || [])].filter((entry) => entry.data !== dateStr);
    if (done) estimativas = [...estimativas, { em: nowIso, data: dateStr }];
    const last = estimativas[estimativas.length - 1] || null;
    const estimativa = {
      ...(project.estimativa || { feita: false, nota: '' }),
      feita: estimativas.length > 0,
      feitaEm: last ? last.data : null,
    };
    return updateProject(id, { estimativas, estimativa });
  }

  function markVideoDone(id, nowIso, dateStr) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const videos = [...(project.videos || []), { em: nowIso, data: dateStr }];
    const videoHistorico = { ...(project.videoHistorico || {}), [dateStr]: true };
    const video = {
      ...(project.video || { feito: false, nota: '' }),
      feito: true,
      feitoEm: dateStr,
    };
    return updateProject(id, { videos, videoHistorico, video });
  }

  function clearVideo(id) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const videos = [...(project.videos || [])].slice(0, -1);
    const last = videos[videos.length - 1] || null;
    const videoHistorico = { ...(project.videoHistorico || {}) };
    if (project.video?.feitoEm) videoHistorico[project.video.feitoEm] = false;
    const video = {
      ...(project.video || { feito: false, nota: '' }),
      feito: videos.length > 0,
      feitoEm: last ? last.data : null,
    };
    return updateProject(id, { videos, videoHistorico, video });
  }

  function toggleVideoToday(id, dateStr, done) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const videoHistorico = { ...(project.videoHistorico || {}), [dateStr]: done };
    const previous = project.video || { feito: false, nota: '' };
    const video = {
      ...previous,
      feito: done || Object.values(videoHistorico).some(Boolean),
      feitoEm: done ? dateStr : (previous.feitoEm && previous.feitoEm !== dateStr ? previous.feitoEm : null),
    };
    return updateProject(id, { videoHistorico, video });
  }

  function setTaskOnDate(id, dateStr, task, done, nowIso) {
    if (task === 'Checklist') return toggleChecklistToday(id, dateStr, done, nowIso);
    if (task === 'Estimativa') return setEstimativaOnDate(id, dateStr, done, nowIso);
    if (task === 'Deploy') return setDeployOnDate(id, dateStr, done, nowIso);
    if (task === 'Vídeo') return toggleVideoToday(id, dateStr, done);
    throw new Error(`Pendência desconhecida: ${task}`);
  }

  function setDeployOnDate(id, dateStr, done, nowIso) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    let deploys = existingDeploys(project).filter((entry) => entry.data !== dateStr);
    if (done) deploys = [...deploys, { em: nowIso, data: dateStr }];
    const last = deploys[deploys.length - 1] || null;
    return updateProject(id, { ultimoDeploy: last ? last.em : null, deploys });
  }
  function clearDeploy(id) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const deploys = existingDeploys(project).slice(0, -1);
    const last = deploys[deploys.length - 1] || null;
    return updateProject(id, { ultimoDeploy: last ? last.em : null, deploys });
  }

  function markMeetingDone(id, dateStr, contexto = '', tipo = 'alinhamento') {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const meetingType = tipo === 'recompra' ? 'recompra' : 'alinhamento';
    const reunioes = [...(project.reunioes || []), {
      data: dateStr,
      tipo: meetingType,
      contexto: String(contexto || '').trim(),
      feito: true,
    }];
    return updateProject(id, { reunioes });
  }

  function scheduleMeeting(id, payload) {
    const project = id ? getProject(id) : null;
    if (id && !project) throw new Error(`Projeto não encontrado: ${id}`);
    const motivo = ['alinhamento', 'primeiro_meet', 'recompra'].includes(payload?.motivo)
      ? payload.motivo
      : 'alinhamento';
    const meeting = {
      id: crypto.randomUUID(),
      projectId: id || null,
      data: payload?.data,
      hora: payload?.hora,
      motivo,
      numero: project?.numero || String(payload?.numero || '').trim(),
      cliente: project?.cliente || String(payload?.cliente || '').trim(),
      contextoMacro: project?.contextoMacro || String(payload?.contextoMacro || '').trim(),
      contexto: String(payload?.contexto || project?.proximaDuvidaMeeting || '').trim(),
      feito: false,
    };
    if (!meeting.data || !meeting.hora) throw new Error('Informe data e hora do meeting.');
    if (project) {
      updateProject(id, { meetings: [...(project.meetings || []), meeting] });
    } else {
      const data = readAll();
      data.meetings = [...(Array.isArray(data.meetings) ? data.meetings : []), meeting];
      writeAll(data);
    }
    return meeting;
  }

  function getAgendaMeetings(dateStr) {
    const data = readAll();
    const standalone = Array.isArray(data.meetings) ? data.meetings : [];
    const projectMeetings = getAllProjects()
      .flatMap((project) => (project.meetings || []).map((meeting) => ({
        ...meeting,
        numero: project.numero,
        cliente: project.cliente,
        contextoMacro: project.contextoMacro,
      })));
    return [...standalone, ...projectMeetings]
      .filter((meeting) => !dateStr || meeting.data === dateStr)
      .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
  }

  function updateMeeting(meetingId, patch) {
    const data = readAll();
    let changed = false;
    data.meetings = (Array.isArray(data.meetings) ? data.meetings : []).map((meeting) => {
      if (meeting.id !== meetingId) return meeting;
      changed = true;
      return { ...meeting, ...patch };
    });
    data.projects = data.projects.map((project) => {
      const meetings = (project.meetings || []).map((meeting) => {
        if (meeting.id !== meetingId) return meeting;
        changed = true;
        return { ...meeting, ...patch };
      });
      return { ...project, meetings };
    });
    if (!changed) throw new Error(`Meeting não encontrado: ${meetingId}`);
    writeAll(data);
  }

  function setMeetingDone(meetingId, done) {
    updateMeeting(meetingId, { feito: !!done });
    if (!done) return;
    const data = readAll();
    const project = data.projects.find((item) => (item.meetings || []).some((meeting) => meeting.id === meetingId));
    if (!project) return;
    project.proximaDuvidaMeeting = '';
    writeAll(data);
  }

  function removeMeeting(meetingId) {
    const data = readAll();
    let changed = false;
    const standalone = Array.isArray(data.meetings) ? data.meetings : [];
    data.meetings = standalone.filter((meeting) => {
      const keep = meeting.id !== meetingId;
      if (!keep) changed = true;
      return keep;
    });
    data.projects = data.projects.map((project) => {
      const current = project.meetings || [];
      const meetings = current.filter((meeting) => {
        const keep = meeting.id !== meetingId;
        if (!keep) changed = true;
        return keep;
      });
      return { ...project, meetings };
    });
    if (!changed) throw new Error(`Meeting não encontrado: ${meetingId}`);
    writeAll(data);
  }

  return {
    uploadsDir,
    getAllProjects,
    getProject,
    getFila,
    getSavedQueues,
    setFila,
    createFila,
    ensureCurrentFila,
    addProject,
    getQueueProjects,
    getProjectsForQueue,
    moveProjectInQueue,
    reorderQueueProjects,
    resetQueueOrder,
    updateProject,
    removeProject,
    toggleChecklistToday,
    toggleVideoToday,
    setTaskOnDate,
    markDeployDone,
    clearDeploy,
    setDeployOnDate,
    markMeetingDone,
    scheduleMeeting,
    getAgendaMeetings,
    setMeetingDone,
    removeMeeting,
    markEstimativaDone,
    clearEstimativa,
    setEstimativaOnDate,
    markVideoDone,
    clearVideo,
  };
}

module.exports = { createStore, MAX_ACTIVE_PROJECTS, normalizePlataforma };
