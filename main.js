const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./src/data/store');
const { annotateProject } = require('./src/logic/projectView');
const { queueEndDate, listQueueDays } = require('./src/logic/businessDays');

const baseDir = path.join(app.getPath('userData'), 'projects-aligner-data');
const store = createStore(baseDir);

function todayStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function viewOf(project, fila = store.getFila()) {
  return annotateProject(project, todayStr(), fila);
}

function currentFila() {
  return store.ensureCurrentFila(todayStr());
}

ipcMain.handle('projects:getAll', (_event, fila) => {
  const targetFila = fila || currentFila();
  return store.getAllProjects().map((project) => viewOf(project, targetFila));
});

ipcMain.handle('projects:get', (_event, id, fila) => {
  const project = store.getProject(id);
  return project ? viewOf(project, fila || currentFila()) : null;
});

ipcMain.handle('fila:get', () => {
  const fila = currentFila();
  if (!fila) return null;
  return { ...fila, dias: listQueueDays(fila.dataInicio, 7) };
});

ipcMain.handle('fila:getSavedQueues', () =>
  store.getSavedQueues().map((fila) => ({ ...fila, dias: listQueueDays(fila.dataInicio, 7) }))
);

ipcMain.handle('fila:create', (_event, payload) => store.createFila(payload));

ipcMain.handle('fila:preview', (_event, dataInicio) => queueEndDate(dataInicio, 7));

ipcMain.handle('fila:set', (_event, payload) => store.setFila(payload));

ipcMain.handle('projects:add', (_event, payload) => store.addProject(payload));

ipcMain.handle('projects:getQueue', (_event, fila) => store.getProjectsForQueue(fila || store.getFila()).map((project) => viewOf(project, fila || store.getFila())));

ipcMain.handle('projects:moveInQueue', (_event, id, direction) => store.moveProjectInQueue(id, direction));

ipcMain.handle('projects:reorderQueue', (_event, orderIds, fila) => store.reorderQueueProjects(orderIds, fila || store.getFila()));

ipcMain.handle('projects:resetQueueOrder', () => store.resetQueueOrder());

ipcMain.handle('projects:update', (_event, id, patch) => {
  if (patch && patch.estimativa) {
    const current = store.getProject(id);
    const wasDone = !!current?.estimativa?.feita;
    const willBeDone = !!patch.estimativa.feita;
    if (willBeDone && !wasDone) {
      patch = { ...patch, estimativa: { ...patch.estimativa, feitaEm: todayStr() } };
    } else if (!willBeDone) {
      patch = { ...patch, estimativa: { ...patch.estimativa, feitaEm: null } };
    } else {
      patch = {
        ...patch,
        estimativa: { ...patch.estimativa, feitaEm: current?.estimativa?.feitaEm || null },
      };
    }
  }
  if (patch && patch.video) {
    const current = store.getProject(id);
    const wasDone = !!current?.video?.feito;
    const willBeDone = !!patch.video.feito;
    const today = todayStr();
    const videoHistorico = { ...(current?.videoHistorico || {}), [today]: willBeDone };
    let feitoEm = current?.video?.feitoEm || null;
    if (willBeDone && !wasDone) feitoEm = today;
    if (!willBeDone) feitoEm = null;
    patch = { ...patch, videoHistorico, video: { ...patch.video, feitoEm } };
  }
  return store.updateProject(id, patch);
});

ipcMain.handle('projects:remove', (_event, id) => store.removeProject(id));

ipcMain.handle('projects:toggleChecklistToday', (_event, id, done) =>
  store.toggleChecklistToday(id, todayStr(), done, new Date().toISOString())
);

ipcMain.handle('projects:toggleVideoToday', (_event, id, done) =>
  store.toggleVideoToday(id, todayStr(), done)
);

ipcMain.handle('projects:setTaskOnDate', (_event, id, dateStr, task, done) =>
  store.setTaskOnDate(id, dateStr, task, done, new Date().toISOString())
);

ipcMain.handle('projects:markDeployDone', (_event, id) =>
  store.markDeployDone(id, new Date().toISOString(), todayStr())
);

ipcMain.handle('projects:clearDeploy', (_event, id) => store.clearDeploy(id));

ipcMain.handle('projects:markMeetingDone', (_event, id, dateStr, contexto, tipo) =>
  store.markMeetingDone(id, dateStr || todayStr(), contexto || '', tipo || 'alinhamento')
);

ipcMain.handle('meetings:schedule', (_event, id, payload) => store.scheduleMeeting(id, payload));

ipcMain.handle('meetings:getAgenda', (_event, dateStr) => store.getAgendaMeetings(dateStr || todayStr()));

ipcMain.handle('meetings:setDone', (_event, meetingId, done) => store.setMeetingDone(meetingId, done));

ipcMain.handle('meetings:remove', (_event, meetingId) => store.removeMeeting(meetingId));

ipcMain.handle('projects:setDeployToday', (_event, id, done) =>
  store.setDeployOnDate(id, todayStr(), done, new Date().toISOString())
);

ipcMain.handle('projects:markEstimativaDone', (_event, id) =>
  store.markEstimativaDone(id, new Date().toISOString(), todayStr())
);

ipcMain.handle('projects:clearEstimativa', (_event, id) => store.clearEstimativa(id));

ipcMain.handle('projects:setEstimativaOnDate', (_event, id, dateStr, done) =>
  store.setEstimativaOnDate(id, dateStr, done, new Date().toISOString())
);

ipcMain.handle('projects:markVideoDone', (_event, id) =>
  store.markVideoDone(id, new Date().toISOString(), todayStr())
);

ipcMain.handle('projects:clearVideo', (_event, id) => store.clearVideo(id));

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif']);

function saveFoto(id, originalName, writeFile) {
  const project = store.getProject(id);
  if (!project) throw new Error(`Projeto não encontrado: ${id}`);

  const ext = path.extname(originalName).toLowerCase();
  if (!IMAGE_EXT.has(ext)) {
    throw new Error('Formato não suportado. Use png, jpg, jpeg ou gif.');
  }

  const safeBase = path.basename(originalName).replace(/[^\w.\-]+/g, '_');
  const fileName = `${Date.now()}-${safeBase}`;
  const projectUploadsDir = path.join(store.uploadsDir, id);
  fs.mkdirSync(projectUploadsDir, { recursive: true });
  writeFile(path.join(projectUploadsDir, fileName));

  const relPath = path.join('uploads', id, fileName);
  return store.updateProject(id, { fotos: [...project.fotos, relPath] });
}

ipcMain.handle('projects:addFoto', async (_event, id) => {
  const project = store.getProject(id);
  if (!project) throw new Error(`Projeto não encontrado: ${id}`);

  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return project;

  const sourcePath = result.filePaths[0];
  return saveFoto(id, path.basename(sourcePath), (dest) => fs.copyFileSync(sourcePath, dest));
});

ipcMain.handle('projects:addFotoBytes', (_event, id, fileName, bytes) =>
  saveFoto(id, fileName, (dest) => fs.writeFileSync(dest, Buffer.from(bytes)))
);

ipcMain.handle('projects:removeFoto', (_event, id, relPath) => {
  const project = store.getProject(id);
  if (!project) throw new Error(`Projeto não encontrado: ${id}`);

  const absPath = path.join(baseDir, relPath);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

  const fotos = project.fotos.filter((f) => f !== relPath);
  return store.updateProject(id, { fotos });
});

ipcMain.handle('projects:getBaseDir', () => baseDir);
