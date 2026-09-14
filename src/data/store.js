const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

  function addProject({ numero, cliente, contextoMacro, dataEntradaFila }) {
    const data = readAll();
    const project = {
      id: crypto.randomUUID(),
      numero,
      cliente,
      contextoMacro,
      dataEntradaFila,
      diasBonus: 0,
      ativo: true,
      checklistHistorico: {},
      ultimoDeploy: null,
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

  function toggleChecklistToday(id, dateStr, done) {
    const project = getProject(id);
    if (!project) throw new Error(`Projeto não encontrado: ${id}`);
    const checklistHistorico = { ...project.checklistHistorico, [dateStr]: done };
    return updateProject(id, { checklistHistorico });
  }

  function markDeployDone(id, nowIso) {
    return updateProject(id, { ultimoDeploy: nowIso });
  }

  return {
    uploadsDir,
    getAllProjects,
    getProject,
    addProject,
    updateProject,
    toggleChecklistToday,
    markDeployDone,
  };
}

module.exports = { createStore };
