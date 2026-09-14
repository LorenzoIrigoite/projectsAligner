const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./src/data/store');
const { annotateProject } = require('./src/logic/projectView');

const baseDir = path.join(app.getPath('userData'), 'projects-aligner-data');
const store = createStore(baseDir);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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

ipcMain.handle('projects:getAll', () => {
  const today = todayStr();
  return store.getAllProjects().map((p) => annotateProject(p, today));
});

ipcMain.handle('projects:get', (_event, id) => {
  const project = store.getProject(id);
  return project ? annotateProject(project, todayStr()) : null;
});

ipcMain.handle('projects:add', (_event, payload) => store.addProject(payload));

ipcMain.handle('projects:update', (_event, id, patch) => store.updateProject(id, patch));

ipcMain.handle('projects:toggleChecklistToday', (_event, id, done) =>
  store.toggleChecklistToday(id, todayStr(), done, new Date().toISOString())
);

ipcMain.handle('projects:markDeployDone', (_event, id) =>
  store.markDeployDone(id, new Date().toISOString())
);

ipcMain.handle('projects:addFoto', async (_event, id) => {
  const project = store.getProject(id);
  if (!project) throw new Error(`Projeto não encontrado: ${id}`);

  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return project;

  const sourcePath = result.filePaths[0];
  const projectUploadsDir = path.join(store.uploadsDir, id);
  fs.mkdirSync(projectUploadsDir, { recursive: true });
  const fileName = `${Date.now()}-${path.basename(sourcePath)}`;
  fs.copyFileSync(sourcePath, path.join(projectUploadsDir, fileName));

  const relPath = path.join('uploads', id, fileName);
  const fotos = [...project.fotos, relPath];
  return store.updateProject(id, { fotos });
});

ipcMain.handle('projects:removeFoto', (_event, id, relPath) => {
  const project = store.getProject(id);
  if (!project) throw new Error(`Projeto não encontrado: ${id}`);

  const absPath = path.join(baseDir, relPath);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

  const fotos = project.fotos.filter((f) => f !== relPath);
  return store.updateProject(id, { fotos });
});

ipcMain.handle('projects:getBaseDir', () => baseDir);
