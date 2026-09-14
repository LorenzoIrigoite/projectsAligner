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

function viewOf(project) {
  return annotateProject(project, todayStr(), store.getFila());
}

ipcMain.handle('projects:getAll', () => store.getAllProjects().map(viewOf));

ipcMain.handle('projects:get', (_event, id) => {
  const project = store.getProject(id);
  return project ? viewOf(project) : null;
});

ipcMain.handle('fila:get', () => {
  const fila = store.getFila();
  if (!fila) return null;
  return { ...fila, dias: listQueueDays(fila.dataInicio, 7) };
});

ipcMain.handle('fila:preview', (_event, dataInicio) => queueEndDate(dataInicio, 7));

ipcMain.handle('fila:set', (_event, payload) => store.setFila(payload));

ipcMain.handle('projects:add', (_event, payload) => store.addProject(payload));

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

ipcMain.handle('projects:toggleChecklistToday', (_event, id, done) =>
  store.toggleChecklistToday(id, todayStr(), done, new Date().toISOString())
);

ipcMain.handle('projects:toggleVideoToday', (_event, id, done) =>
  store.toggleVideoToday(id, todayStr(), done)
);

ipcMain.handle('projects:markDeployDone', (_event, id) =>
  store.markDeployDone(id, new Date().toISOString(), todayStr())
);

ipcMain.handle('projects:clearDeploy', (_event, id) => store.clearDeploy(id));

ipcMain.handle('projects:setDeployToday', (_event, id, done) =>
  store.setDeployOnDate(id, todayStr(), done, new Date().toISOString())
);

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
