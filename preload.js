const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAllProjects: () => ipcRenderer.invoke('projects:getAll'),
  getFila: () => ipcRenderer.invoke('fila:get'),
  previewFila: (dataInicio) => ipcRenderer.invoke('fila:preview', dataInicio),
  setFila: (payload) => ipcRenderer.invoke('fila:set', payload),
  getProject: (id) => ipcRenderer.invoke('projects:get', id),
  addProject: (payload) => ipcRenderer.invoke('projects:add', payload),
  updateProject: (id, patch) => ipcRenderer.invoke('projects:update', id, patch),
  toggleChecklistToday: (id, done) => ipcRenderer.invoke('projects:toggleChecklistToday', id, done),
  toggleVideoToday: (id, done) => ipcRenderer.invoke('projects:toggleVideoToday', id, done),
  markDeployDone: (id) => ipcRenderer.invoke('projects:markDeployDone', id),
  clearDeploy: (id) => ipcRenderer.invoke('projects:clearDeploy', id),
  setDeployToday: (id, done) => ipcRenderer.invoke('projects:setDeployToday', id, done),
  addFoto: (id) => ipcRenderer.invoke('projects:addFoto', id),
  addFotoBytes: (id, fileName, bytes) => ipcRenderer.invoke('projects:addFotoBytes', id, fileName, bytes),
  removeFoto: (id, relPath) => ipcRenderer.invoke('projects:removeFoto', id, relPath),
  getBaseDir: () => ipcRenderer.invoke('projects:getBaseDir'),
});
