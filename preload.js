const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAllProjects: () => ipcRenderer.invoke('projects:getAll'),
  getProject: (id) => ipcRenderer.invoke('projects:get', id),
  addProject: (payload) => ipcRenderer.invoke('projects:add', payload),
  updateProject: (id, patch) => ipcRenderer.invoke('projects:update', id, patch),
  toggleChecklistToday: (id, done) => ipcRenderer.invoke('projects:toggleChecklistToday', id, done),
  markDeployDone: (id) => ipcRenderer.invoke('projects:markDeployDone', id),
  addFoto: (id) => ipcRenderer.invoke('projects:addFoto', id),
  removeFoto: (id, relPath) => ipcRenderer.invoke('projects:removeFoto', id, relPath),
  getBaseDir: () => ipcRenderer.invoke('projects:getBaseDir'),
});
