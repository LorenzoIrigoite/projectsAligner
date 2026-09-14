const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { queueEndDate } = require('../logic/businessDays');
const { localDateFromIso } = require('../logic/weekProgress');

const MAX_ACTIVE_PROJECTS = 8;

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
    return readAll().projects;
  }

  function getProject(id) {
    return readAll().projects.find((p) => p.id === id) || null;
  }

  function getFila() {
    return readAll().fila || null;
  }

  function setFila({ dataInicio }) {
    const period = queueEndDate(dataInicio, 7);
    const data = readAll();
    data.fila = { dataInicio: period.dataInicio, dataFim: period.dataFim };
    writeAll(data);
    return data.fila;
  }

  function addProject({ numero, cliente, contextoMacro }) {
    const data = readAll();
    if (!data.fila) throw new Error('Abra a fila antes de adicionar um projeto.');
    const activeCount = data.projects.filter((p) => p.ativo).length;
    if (activeCount >= MAX_ACTIVE_PROJECTS) {
      throw new Error('A fila já tem 8 projetos ativos. Conclua um antes de adicionar outro.');
    }
    const project = {
      id: crypto.randomUUID(),
      numero,
      cliente,
      contextoMacro,
      diasBonus: 0,
      ativo: true,
      checklistHistorico: {},
      ultimoDeploy: null,
      ultimoChecklistFeitoEm: null,
      deploys: [],
      videoHistorico: {},
      estimativa: { feita: false, nota: '' },
      video: { feito: false, nota: '' },
      contexto: '',
      lembreteProximoDia: '',
      env: { backendUrl: '', frontendUrl: '', gatewayPagamento: '', chavesApi: [], envRaw: '' },
      credenciais: [],
      fotos: [],
    };
    data.projects.push(project);
    writeAll(data);
    return project;
  }

  function updateProject(id, patch) {
    const data = readAll();
    const index = data.projects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Projeto não encontrado: ${id}`);
    data.projects[index] = { ...data.projects[index], ...patch };
    writeAll(data);
    return data.projects[index];
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

  return {
    uploadsDir,
    getAllProjects,
    getProject,
    getFila,
    setFila,
    addProject,
    updateProject,
    toggleChecklistToday,
    toggleVideoToday,
    markDeployDone,
    clearDeploy,
    setDeployOnDate,
  };
}

module.exports = { createStore, MAX_ACTIVE_PROJECTS };
