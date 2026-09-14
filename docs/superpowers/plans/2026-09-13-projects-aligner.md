# Projects Aligner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Electron desktop app that replaces the manual text-based
tracking of an 8-slot project queue, with a macro grid view of all active
projects and a per-project detail view (context/reminder, estimate, deploy,
video, env/hosting, credentials, photos).

**Architecture:** Electron app, single window, vanilla HTML/CSS/JS renderer
(no UI framework — data volume is tiny). Business rules (business-day
counting, deploy status, warning triggers) live in plain Node modules with no
Electron dependency, so they're testable with Node's built-in test runner.
Persistence is a JSON file plus an uploads folder, both under
`app.getPath('userData')` — this keeps all personal data (credentials, env
backups, photos) out of the git repository by construction, since it lives
outside the project directory entirely.

**Tech Stack:** Electron, Node.js built-in `node:test` + `node:assert/strict`
for unit tests, `electron-builder` for packaging a Windows installer.

**Spec:** `docs/superpowers/specs/2026-09-13-projects-aligner-design.md`

## Global Constraints

- Electron desktop app (not a web-local app, not Tauri).
- No encryption of sensitive fields (credentials, API keys, env) — plain text, local-only.
- Checklist is a single daily toggle per project, not a customizable sub-item list.
- "Dias bônus" are informational only — they never shift the day-6/7 deploy or day-7 video/env triggers.
- The "lembrete para o próximo dia" only surfaces in the project detail view, never on the macro grid.
- Deploy status is always derived (never a directly-editable field): `nunca_implantado` / `pendente` / `atualizado`, computed from `ultimoDeploy` vs. `checklistHistorico`.
- Persisted data (`projects.json`, `uploads/`) lives under `app.getPath('userData')`, never inside the repo working tree.

---

### Task 1: Electron app scaffolding

**Files:**
- Create: `package.json`
- Create: `main.js`
- Create: `preload.js`
- Create: `renderer/index.html`
- Create: `renderer/styles.css`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable Electron shell. Later tasks extend `main.js`,
  `preload.js`, and `renderer/index.html` in place.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "projects-aligner",
  "version": "1.0.0",
  "description": "App local para organizar a fila de projetos de trabalho",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "node --test tests/",
    "dist": "electron-builder"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3"
  },
  "build": {
    "appId": "com.lorenzo.projectsaligner",
    "productName": "Projects Aligner",
    "files": ["main.js", "preload.js", "src/**/*", "renderer/**/*"],
    "win": {
      "target": "nsis"
    }
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 3: Create `main.js`**

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

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
```

- [ ] **Step 4: Create `preload.js`**

```js
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {});
```

- [ ] **Step 5: Create `renderer/index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Projects Aligner</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <h1>Projects Aligner</h1>
</body>
</html>
```

- [ ] **Step 6: Create `renderer/styles.css`**

```css
body {
  font-family: -apple-system, Segoe UI, Arial, sans-serif;
  margin: 0;
  padding: 16px;
  background: #1e1e1e;
  color: #eee;
}
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Manual smoke test**

Run: `npm start`
Expected: an Electron window opens showing the title "Projects Aligner".
Close the window when done.

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore main.js preload.js renderer/index.html renderer/styles.css
git commit -m "chore: scaffold Electron app shell"
```

---

### Task 2: Business-day queue logic

**Files:**
- Create: `src/logic/businessDays.js`
- Test: `tests/businessDays.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `countBusinessDays(startDateStr: 'YYYY-MM-DD', todayDateStr: 'YYYY-MM-DD'): number`
  - `getQueueTriggers(businessDayCount: number): { deployObrigatorio: boolean, videoEEnv: boolean }`

- [ ] **Step 1: Write the failing tests**

Create `tests/businessDays.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { countBusinessDays, getQueueTriggers } = require('../src/logic/businessDays');

test('countBusinessDays counts the start day itself as day 1', () => {
  // 2024-01-01 is a Monday
  assert.equal(countBusinessDays('2024-01-01', '2024-01-01'), 1);
});

test('countBusinessDays skips weekends', () => {
  // Mon 1 -> Sun 7: Mon,Tue,Wed,Thu,Fri = 5 business days, weekend excluded
  assert.equal(countBusinessDays('2024-01-01', '2024-01-07'), 5);
});

test('countBusinessDays continues counting into the next week', () => {
  // Mon 1 -> Mon 8: previous 5 + the following Monday = 6
  assert.equal(countBusinessDays('2024-01-01', '2024-01-08'), 6);
});

test('countBusinessDays returns 0 when today is before the start date', () => {
  assert.equal(countBusinessDays('2024-01-01', '2023-12-25'), 0);
});

test('getQueueTriggers flags deploy obrigatorio only on day 6 and day 7', () => {
  assert.equal(getQueueTriggers(5).deployObrigatorio, false);
  assert.equal(getQueueTriggers(6).deployObrigatorio, true);
  assert.equal(getQueueTriggers(7).deployObrigatorio, true);
  assert.equal(getQueueTriggers(8).deployObrigatorio, false);
});

test('getQueueTriggers flags video e env only on day 7', () => {
  assert.equal(getQueueTriggers(6).videoEEnv, false);
  assert.equal(getQueueTriggers(7).videoEEnv, true);
  assert.equal(getQueueTriggers(8).videoEEnv, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/businessDays.test.js`
Expected: FAIL with "Cannot find module '../src/logic/businessDays'"

- [ ] **Step 3: Implement `src/logic/businessDays.js`**

```js
const DAY_MS = 24 * 60 * 60 * 1000;

function toUTCDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isWeekend(date) {
  const weekday = date.getUTCDay();
  return weekday === 0 || weekday === 6;
}

function countBusinessDays(startDateStr, todayDateStr) {
  const start = toUTCDate(startDateStr);
  const end = toUTCDate(todayDateStr);
  if (end < start) return 0;

  let count = 0;
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    if (!isWeekend(cursor)) count += 1;
  }
  return count;
}

function getQueueTriggers(businessDayCount) {
  return {
    deployObrigatorio: businessDayCount === 6 || businessDayCount === 7,
    videoEEnv: businessDayCount === 7,
  };
}

module.exports = { countBusinessDays, getQueueTriggers };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/businessDays.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/logic/businessDays.js tests/businessDays.test.js
git commit -m "feat: add business-day queue counting logic"
```

---

### Task 3: Deploy status logic

**Files:**
- Create: `src/logic/deployStatus.js`
- Test: `tests/deployStatus.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `computeDeployStatus(ultimoDeploy: string|null, checklistHistorico: Record<string, boolean>): 'nunca_implantado' | 'pendente' | 'atualizado'`

- [ ] **Step 1: Write the failing tests**

Create `tests/deployStatus.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDeployStatus } = require('../src/logic/deployStatus');

test('nunca_implantado when ultimoDeploy is null, regardless of checklist', () => {
  assert.equal(computeDeployStatus(null, { '2024-01-01': true }), 'nunca_implantado');
  assert.equal(computeDeployStatus(null, {}), 'nunca_implantado');
});

test('pendente when a checklist entry is newer than the last deploy', () => {
  const status = computeDeployStatus('2024-01-01T10:00:00.000Z', { '2024-01-02': true });
  assert.equal(status, 'pendente');
});

test('atualizado when the last deploy is newer than all checklist entries', () => {
  const status = computeDeployStatus('2024-01-05T10:00:00.000Z', { '2024-01-02': true });
  assert.equal(status, 'atualizado');
});

test('checklist entries marked false do not trigger pendente', () => {
  const status = computeDeployStatus('2024-01-01T10:00:00.000Z', { '2024-01-05': false });
  assert.equal(status, 'atualizado');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/deployStatus.test.js`
Expected: FAIL with "Cannot find module '../src/logic/deployStatus'"

- [ ] **Step 3: Implement `src/logic/deployStatus.js`**

```js
function computeDeployStatus(ultimoDeploy, checklistHistorico) {
  if (!ultimoDeploy) return 'nunca_implantado';

  const deployTime = new Date(ultimoDeploy).getTime();
  const hasNewerChecklist = Object.entries(checklistHistorico || {}).some(
    ([dateStr, done]) => done && new Date(`${dateStr}T23:59:59Z`).getTime() > deployTime
  );

  return hasNewerChecklist ? 'pendente' : 'atualizado';
}

module.exports = { computeDeployStatus };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/deployStatus.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/logic/deployStatus.js tests/deployStatus.test.js
git commit -m "feat: add deploy status calculation logic"
```

---

### Task 4: Project view annotation

**Files:**
- Create: `src/logic/projectView.js`
- Test: `tests/projectView.test.js`

**Interfaces:**
- Consumes:
  - `countBusinessDays`, `getQueueTriggers` from `src/logic/businessDays.js` (Task 2)
  - `computeDeployStatus` from `src/logic/deployStatus.js` (Task 3)
- Produces:
  - `annotateProject(project: object, todayDateStr: 'YYYY-MM-DD'): object` — returns a shallow copy of `project` plus `diasUteis`, `statusDeploy`, `avisoDeployObrigatorio`, `avisoVideoEEnv`.

- [ ] **Step 1: Write the failing test**

Create `tests/projectView.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { annotateProject } = require('../src/logic/projectView');

test('annotateProject combines business days and deploy status into a view model', () => {
  const project = {
    id: 'abc',
    dataEntradaFila: '2024-01-01',
    diasBonus: 2,
    ultimoDeploy: null,
    checklistHistorico: {},
  };

  const annotated = annotateProject(project, '2024-01-08');

  assert.equal(annotated.id, 'abc');
  assert.equal(annotated.diasUteis, 6);
  assert.equal(annotated.avisoDeployObrigatorio, true);
  assert.equal(annotated.avisoVideoEEnv, false);
  assert.equal(annotated.statusDeploy, 'nunca_implantado');
});

test('annotateProject defaults diasBonus to 0 when missing', () => {
  const project = {
    id: 'xyz',
    dataEntradaFila: '2024-01-01',
    ultimoDeploy: null,
    checklistHistorico: {},
  };

  const annotated = annotateProject(project, '2024-01-01');
  assert.equal(annotated.diasBonus, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/projectView.test.js`
Expected: FAIL with "Cannot find module '../src/logic/projectView'"

- [ ] **Step 3: Implement `src/logic/projectView.js`**

```js
const { countBusinessDays, getQueueTriggers } = require('./businessDays');
const { computeDeployStatus } = require('./deployStatus');

function annotateProject(project, todayDateStr) {
  const diasUteis = countBusinessDays(project.dataEntradaFila, todayDateStr);
  const triggers = getQueueTriggers(diasUteis);
  const statusDeploy = computeDeployStatus(project.ultimoDeploy, project.checklistHistorico);

  return {
    ...project,
    diasBonus: project.diasBonus || 0,
    diasUteis,
    statusDeploy,
    avisoDeployObrigatorio: triggers.deployObrigatorio,
    avisoVideoEEnv: triggers.videoEEnv,
  };
}

module.exports = { annotateProject };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/projectView.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/logic/projectView.js tests/projectView.test.js
git commit -m "feat: add project view annotation combining queue and deploy logic"
```

---

### Task 5: Local JSON data store

**Files:**
- Create: `src/data/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: nothing (pure Node `fs`/`path`/`crypto`).
- Produces: `createStore(baseDir: string)` returning an object with:
  - `uploadsDir: string`
  - `getAllProjects(): object[]`
  - `getProject(id: string): object|null`
  - `addProject({ numero, cliente, contextoMacro, dataEntradaFila }): object`
  - `updateProject(id: string, patch: object): object` (throws if id not found)
  - `toggleChecklistToday(id: string, dateStr: string, done: boolean): object`
  - `markDeployDone(id: string, nowIso: string): object`

- [ ] **Step 1: Write the failing tests**

Create `tests/store.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/data/store');

function makeTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-aligner-test-'));
  return createStore(dir);
}

test('addProject persists a project with default fields', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '557',
    cliente: 'João Paulo',
    contextoMacro: 'Floricultura',
    dataEntradaFila: '2024-01-01',
  });

  assert.equal(project.numero, '557');
  assert.equal(project.ativo, true);
  assert.deepEqual(project.checklistHistorico, {});
  assert.equal(project.ultimoDeploy, null);

  const all = store.getAllProjects();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, project.id);
});

test('toggleChecklistToday records the date in checklistHistorico', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.toggleChecklistToday(project.id, '2024-01-02', true);
  const updated = store.getProject(project.id);
  assert.equal(updated.checklistHistorico['2024-01-02'], true);
});

test('markDeployDone sets ultimoDeploy', () => {
  const store = makeTempStore();
  const project = store.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  store.markDeployDone(project.id, '2024-01-05T12:00:00.000Z');
  const updated = store.getProject(project.id);
  assert.equal(updated.ultimoDeploy, '2024-01-05T12:00:00.000Z');
});

test('updateProject throws for an unknown id', () => {
  const store = makeTempStore();
  assert.throws(() => store.updateProject('unknown-id', {}), /não encontrado/);
});

test('data survives across store instances pointed at the same directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-aligner-test-'));
  const store1 = createStore(dir);
  const project = store1.addProject({
    numero: '1',
    cliente: 'Cliente',
    contextoMacro: 'Contexto',
    dataEntradaFila: '2024-01-01',
  });

  const store2 = createStore(dir);
  const reloaded = store2.getProject(project.id);
  assert.equal(reloaded.numero, '1');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/store.test.js`
Expected: FAIL with "Cannot find module '../src/data/store'"

- [ ] **Step 3: Implement `src/data/store.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/store.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/store.js tests/store.test.js
git commit -m "feat: add JSON-backed local project store"
```

---

### Task 6: Wire IPC between renderer and main process

**Files:**
- Modify: `main.js` (rewrite entire file)
- Modify: `preload.js` (rewrite entire file)

**Interfaces:**
- Consumes:
  - `createStore` from `src/data/store.js` (Task 5)
  - `annotateProject` from `src/logic/projectView.js` (Task 4)
- Produces: `window.api` in the renderer with methods:
  - `getAllProjects(): Promise<object[]>`
  - `getProject(id): Promise<object|null>`
  - `addProject(payload): Promise<object>`
  - `updateProject(id, patch): Promise<object>`
  - `toggleChecklistToday(id, done): Promise<object>`
  - `markDeployDone(id): Promise<object>`
  - `addFoto(id): Promise<object>`
  - `removeFoto(id, relPath): Promise<object>`
  - `getBaseDir(): Promise<string>`

- [ ] **Step 1: Rewrite `main.js`**

```js
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
  store.toggleChecklistToday(id, todayStr(), done)
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
```

- [ ] **Step 2: Rewrite `preload.js`**

```js
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
```

- [ ] **Step 3: Manual smoke test**

Run: `npm start`
In the opened window, open DevTools (Ctrl+Shift+I), go to the Console tab,
and run:

```js
await window.api.getAllProjects()
```

Expected: `[]` (empty array, no projects yet).

Then run:

```js
await window.api.addProject({ numero: '1', cliente: 'Teste', contextoMacro: 'Teste', dataEntradaFila: '2026-09-01' })
await window.api.getAllProjects()
```

Expected: an array with one project object, including `diasUteis`,
`statusDeploy: 'nunca_implantado'`, and `avisoDeployObrigatorio`/`avisoVideoEEnv`
fields. Close the window when done.

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "feat: wire IPC layer between renderer and local project store"
```

---

### Task 7: Macro grid view

**Files:**
- Modify: `renderer/index.html` (rewrite entire file)
- Create: `renderer/app.js`
- Modify: `renderer/styles.css` (append rules)

**Interfaces:**
- Consumes: `window.api.getAllProjects`, `window.api.addProject`,
  `window.api.toggleChecklistToday`, `window.api.markDeployDone` (Task 6).
- Produces:
  - Global `state.projects: object[]` in `renderer/app.js`.
  - `loadProjects(): Promise<void>` — refetches and re-renders the grid.
  - `renderMacroGrid(): void`
  - `statusColor(status): string`, `statusLabel(status): string` — used later
    by `renderer/detail.js` (Task 8).
  - Calls a global `openDetail(id)` function on card click — implemented in
    Task 8; until Task 8 lands, clicking "Ver detalhes" is a no-op console
    error, which is acceptable since this task's deliverable is the macro
    grid itself.

- [ ] **Step 1: Rewrite `renderer/index.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Projects Aligner</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="app-header">
    <h1>Projects Aligner</h1>
    <button id="btn-add-project">+ Novo projeto</button>
  </header>

  <main id="view-macro" class="view">
    <div id="macro-grid" class="macro-grid"></div>
  </main>

  <main id="view-detail" class="view hidden">
    <button id="btn-back-to-macro">&larr; Voltar</button>
    <h2 id="detail-title"></h2>
    <div id="detail-meta"></div>
    <nav class="tabs">
      <button class="tab-btn" data-tab="contexto">Contexto</button>
      <button class="tab-btn" data-tab="estimativa">Estimativa</button>
      <button class="tab-btn" data-tab="deploy">Deploy</button>
      <button class="tab-btn" data-tab="video">Vídeo</button>
      <button class="tab-btn" data-tab="env">Env &amp; Hospedagem</button>
      <button class="tab-btn" data-tab="credenciais">Credenciais</button>
      <button class="tab-btn" data-tab="fotos">Fotos</button>
    </nav>

    <section id="tab-contexto" class="tab-panel"></section>
    <section id="tab-estimativa" class="tab-panel hidden"></section>
    <section id="tab-deploy" class="tab-panel hidden"></section>
    <section id="tab-video" class="tab-panel hidden"></section>
    <section id="tab-env" class="tab-panel hidden"></section>
    <section id="tab-credenciais" class="tab-panel hidden"></section>
    <section id="tab-fotos" class="tab-panel hidden"></section>
  </main>

  <dialog id="dialog-add-project">
    <form id="form-add-project">
      <label>Número <input type="text" name="numero" required /></label>
      <label>Cliente <input type="text" name="cliente" required /></label>
      <label>Contexto macro <input type="text" name="contextoMacro" required /></label>
      <label>Data de entrada na fila <input type="date" name="dataEntradaFila" required /></label>
      <menu>
        <button type="button" id="btn-cancel-add-project">Cancelar</button>
        <button type="submit">Adicionar</button>
      </menu>
    </form>
  </dialog>

  <script src="app.js"></script>
  <script src="detail.js"></script>
</body>
</html>
```

Note: `renderer/detail.js` does not exist yet — it is created in Task 8. The
`<script>` tag is added now so this file doesn't need another edit later.

- [ ] **Step 2: Create a placeholder `renderer/detail.js` so the page loads**

```js
function openDetail(id) {
  console.warn('Detail view not implemented yet:', id);
}
```

(This file is fully rewritten in Task 8.)

- [ ] **Step 3: Create `renderer/app.js`**

```js
const state = { projects: [] };

async function loadProjects() {
  state.projects = await window.api.getAllProjects();
  renderMacroGrid();
}

function statusColor(status) {
  if (status === 'atualizado') return 'status-green';
  if (status === 'pendente') return 'status-yellow';
  return 'status-gray';
}

function statusLabel(status) {
  if (status === 'atualizado') return 'Atualizado';
  if (status === 'pendente') return 'Pendente';
  return 'Nunca implantado';
}

function renderMacroGrid() {
  const grid = document.getElementById('macro-grid');
  grid.innerHTML = '';

  const today = new Date().toISOString().slice(0, 10);

  state.projects
    .filter((p) => p.ativo)
    .forEach((project) => {
      const card = document.createElement('div');
      card.className = 'project-card';

      const checklistDoneToday = !!project.checklistHistorico[today];

      card.innerHTML = `
        <h3>${project.numero} - ${project.cliente} - ${project.contextoMacro}</h3>
        <div class="badges">
          ${project.avisoDeployObrigatorio ? '<span class="badge badge-warn">Deploy obrigatório</span>' : ''}
          ${project.avisoVideoEEnv ? '<span class="badge badge-warn">Vídeo + env</span>' : ''}
        </div>
        <label class="checklist-toggle">
          <input type="checkbox" class="chk-checklist" ${checklistDoneToday ? 'checked' : ''} />
          Checklist de hoje
        </label>
        <div class="deploy-status ${statusColor(project.statusDeploy)}">
          ${statusLabel(project.statusDeploy)}
        </div>
        <button type="button" class="btn-mark-deploy">Marcar deploy feito</button>
        <button type="button" class="btn-open-detail">Ver detalhes</button>
      `;

      card.querySelector('.chk-checklist').addEventListener('change', async (event) => {
        await window.api.toggleChecklistToday(project.id, event.target.checked);
        await loadProjects();
      });

      card.querySelector('.btn-mark-deploy').addEventListener('click', async () => {
        await window.api.markDeployDone(project.id);
        await loadProjects();
      });

      card.querySelector('.btn-open-detail').addEventListener('click', () => openDetail(project.id));

      grid.appendChild(card);
    });
}

document.getElementById('btn-add-project').addEventListener('click', () => {
  document.getElementById('dialog-add-project').showModal();
});

document.getElementById('btn-cancel-add-project').addEventListener('click', () => {
  document.getElementById('dialog-add-project').close();
});

document.getElementById('form-add-project').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  await window.api.addProject({
    numero: formData.get('numero'),
    cliente: formData.get('cliente'),
    contextoMacro: formData.get('contextoMacro'),
    dataEntradaFila: formData.get('dataEntradaFila'),
  });
  event.target.reset();
  document.getElementById('dialog-add-project').close();
  await loadProjects();
});

window.addEventListener('DOMContentLoaded', loadProjects);
```

- [ ] **Step 4: Append macro-grid styles to `renderer/styles.css`**

```css
.hidden {
  display: none !important;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.macro-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.project-card {
  background: #2a2a2a;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.badge-warn {
  background: #b45309;
  color: #fff;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
}

.deploy-status {
  border-radius: 4px;
  padding: 4px 8px;
  text-align: center;
  font-weight: bold;
}

.status-gray { background: #555; color: #eee; }
.status-yellow { background: #b59f00; color: #111; }
.status-green { background: #2e7d32; color: #fff; }
```

- [ ] **Step 5: Manual smoke test**

Run: `npm start`
Expected: the macro grid shows the test project created in Task 6's smoke
test (or none, if that data directory was cleared). Click "+ Novo projeto",
fill the form, submit, and see a new card appear. Toggle its checklist
checkbox and confirm the deploy status badge stays "Nunca implantado" (since
no deploy has been marked yet). Click "Marcar deploy feito" and confirm the
badge turns green ("Atualizado"). Toggle the checklist again and confirm the
badge turns yellow ("Pendente").

- [ ] **Step 6: Commit**

```bash
git add renderer/index.html renderer/app.js renderer/detail.js renderer/styles.css
git commit -m "feat: add macro grid view with checklist and deploy actions"
```

---

### Task 8: Project detail view shell + simple tabs

**Files:**
- Modify: `renderer/detail.js` (rewrite entire file)
- Modify: `renderer/styles.css` (append rules)

**Interfaces:**
- Consumes: `window.api.getProject`, `window.api.updateProject`,
  `window.api.markDeployDone` (Task 6); `statusLabel` and `loadProjects` from
  `renderer/app.js` (Task 7); the `#detail-meta` container added to
  `renderer/index.html` in Task 7.
- Produces:
  - `openDetail(id: string): Promise<void>` (replaces Task 7's placeholder)
  - `refreshDetail(): Promise<void>` — also renders the `#detail-meta` block
    (dias bônus + marcar projeto como inativo/concluído), covering the
    spec's macro-view actions "editar dias bônus" and "marcar projeto como
    inativo" via controls reachable from the detail view.
  - `activateTab(tabName: string): void`
  - `TAB_RENDERERS: Record<string, (project) => void>` — a plain object
    Tasks 9-11 extend with one more entry each (`env`, `credenciais`, `fotos`).

- [ ] **Step 1: Rewrite `renderer/detail.js`**

```js
let currentProjectId = null;

const TAB_RENDERERS = {
  contexto: renderContextoTab,
  estimativa: renderEstimativaTab,
  deploy: renderDeployTab,
  video: renderVideoTab,
};

async function openDetail(id) {
  currentProjectId = id;
  document.getElementById('view-macro').classList.add('hidden');
  document.getElementById('view-detail').classList.remove('hidden');
  await refreshDetail();
  activateTab('contexto');
}

async function refreshDetail() {
  const project = await window.api.getProject(currentProjectId);
  document.getElementById('detail-title').textContent =
    `${project.numero} - ${project.cliente} - ${project.contextoMacro}`;
  renderDetailMeta(project);
  Object.values(TAB_RENDERERS).forEach((renderFn) => renderFn(project));
}

function renderDetailMeta(project) {
  const meta = document.getElementById('detail-meta');
  meta.innerHTML = `
    <label>Dias bônus
      <input type="number" id="input-dias-bonus" min="0" value="${project.diasBonus}" style="width:60px" />
    </label>
    <button type="button" id="btn-salvar-bonus">Salvar dias bônus</button>
    <button type="button" id="btn-toggle-ativo">
      ${project.ativo ? 'Marcar como concluído/inativo' : 'Reativar na fila'}
    </button>
  `;

  meta.querySelector('#btn-salvar-bonus').addEventListener('click', async () => {
    const diasBonus = Number(meta.querySelector('#input-dias-bonus').value) || 0;
    await window.api.updateProject(project.id, { diasBonus });
    await refreshDetail();
  });

  meta.querySelector('#btn-toggle-ativo').addEventListener('click', async () => {
    await window.api.updateProject(project.id, { ativo: !project.ativo });
    document.getElementById('view-detail').classList.add('hidden');
    document.getElementById('view-macro').classList.remove('hidden');
    await loadProjects();
  });
}

function activateTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

document.getElementById('btn-back-to-macro').addEventListener('click', async () => {
  document.getElementById('view-detail').classList.add('hidden');
  document.getElementById('view-macro').classList.remove('hidden');
  await loadProjects();
});

function renderContextoTab(project) {
  const panel = document.getElementById('tab-contexto');
  panel.innerHTML = `
    ${
      project.lembreteProximoDia
        ? `<div class="lembrete-destaque">
            📌 Lembrete: ${project.lembreteProximoDia}
            <button type="button" id="btn-resolver-lembrete">Marcar como resolvido</button>
          </div>`
        : ''
    }
    <label>Novo lembrete para o próximo dia
      <input type="text" id="input-novo-lembrete" placeholder="O que lembrar amanhã" />
    </label>
    <button type="button" id="btn-salvar-lembrete">Salvar lembrete</button>
    <hr />
    <label>Notas de contexto
      <textarea id="textarea-contexto" rows="10">${project.contexto || ''}</textarea>
    </label>
    <button type="button" id="btn-salvar-contexto">Salvar notas</button>
  `;

  if (project.lembreteProximoDia) {
    panel.querySelector('#btn-resolver-lembrete').addEventListener('click', async () => {
      await window.api.updateProject(project.id, { lembreteProximoDia: '' });
      await refreshDetail();
    });
  }

  panel.querySelector('#btn-salvar-lembrete').addEventListener('click', async () => {
    const texto = panel.querySelector('#input-novo-lembrete').value;
    await window.api.updateProject(project.id, { lembreteProximoDia: texto });
    await refreshDetail();
  });

  panel.querySelector('#btn-salvar-contexto').addEventListener('click', async () => {
    const texto = panel.querySelector('#textarea-contexto').value;
    await window.api.updateProject(project.id, { contexto: texto });
  });
}

function renderEstimativaTab(project) {
  const panel = document.getElementById('tab-estimativa');
  panel.innerHTML = `
    <label>
      <input type="checkbox" id="chk-estimativa-feita" ${project.estimativa.feita ? 'checked' : ''} />
      Estimativa feita
    </label>
    <label>Nota
      <textarea id="textarea-estimativa-nota" rows="5">${project.estimativa.nota || ''}</textarea>
    </label>
    <button type="button" id="btn-salvar-estimativa">Salvar</button>
  `;

  panel.querySelector('#btn-salvar-estimativa').addEventListener('click', async () => {
    const feita = panel.querySelector('#chk-estimativa-feita').checked;
    const nota = panel.querySelector('#textarea-estimativa-nota').value;
    await window.api.updateProject(project.id, { estimativa: { feita, nota } });
  });
}

function renderDeployTab(project) {
  const panel = document.getElementById('tab-deploy');
  panel.innerHTML = `
    <p>Status atual: <strong>${statusLabel(project.statusDeploy)}</strong></p>
    <p>Último deploy: ${project.ultimoDeploy ? new Date(project.ultimoDeploy).toLocaleString('pt-BR') : 'nunca'}</p>
    <button type="button" id="btn-detail-mark-deploy">Marcar deploy feito</button>
  `;

  panel.querySelector('#btn-detail-mark-deploy').addEventListener('click', async () => {
    await window.api.markDeployDone(project.id);
    await refreshDetail();
  });
}

function renderVideoTab(project) {
  const panel = document.getElementById('tab-video');
  panel.innerHTML = `
    <label>
      <input type="checkbox" id="chk-video-feito" ${project.video.feito ? 'checked' : ''} />
      Vídeo gravado
    </label>
    <label>Nota (link/local do vídeo)
      <textarea id="textarea-video-nota" rows="5">${project.video.nota || ''}</textarea>
    </label>
    <button type="button" id="btn-salvar-video">Salvar</button>
  `;

  panel.querySelector('#btn-salvar-video').addEventListener('click', async () => {
    const feito = panel.querySelector('#chk-video-feito').checked;
    const nota = panel.querySelector('#textarea-video-nota').value;
    await window.api.updateProject(project.id, { video: { feito, nota } });
  });
}
```

- [ ] **Step 2: Append detail-view styles to `renderer/styles.css`**

```css
.tabs {
  display: flex;
  gap: 4px;
  margin: 12px 0;
  flex-wrap: wrap;
}

.tab-btn {
  background: #3a3a3a;
  color: #eee;
  border: none;
  border-radius: 4px 4px 0 0;
  padding: 8px 12px;
  cursor: pointer;
}

.tab-panel {
  background: #2a2a2a;
  border-radius: 0 8px 8px 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 640px;
}

.lembrete-destaque {
  background: #7a5c00;
  color: #fff;
  border-radius: 6px;
  padding: 10px;
}
```

- [ ] **Step 3: Manual smoke test**

Run: `npm start`
Open a project's detail view. Confirm the tab bar shows all 7 tabs and
clicking each one shows its own panel. In the Contexto tab, type a reminder,
save it, and confirm it disappears from the input but reappears as a
highlighted banner after clicking "Voltar" and reopening the same project.
Click "Marcar como resolvido" and confirm the banner disappears. Save some
notes, estimate, and video fields, reopen the project, and confirm the saved
values are shown. In the meta row below the title, set "Dias bônus" to `2`,
save, reopen the project, and confirm it still shows `2`. Click "Marcar como
concluído/inativo" and confirm the project disappears from the macro grid
(it is now `ativo: false`, filtered out by Task 7's grid render).

- [ ] **Step 4: Commit**

```bash
git add renderer/detail.js renderer/styles.css
git commit -m "feat: add project detail view with contexto, estimativa, deploy and video tabs"
```

---

### Task 9: Env & Hospedagem tab

**Files:**
- Modify: `renderer/detail.js`

**Interfaces:**
- Consumes: `TAB_RENDERERS`, `refreshDetail` from Task 8.
- Produces: adds `env: renderEnvTab` to `TAB_RENDERERS` and the
  `renderEnvTab(project)` function.

- [ ] **Step 1: Add the `env` entry to `TAB_RENDERERS`**

```js
// old_string
const TAB_RENDERERS = {
  contexto: renderContextoTab,
  estimativa: renderEstimativaTab,
  deploy: renderDeployTab,
  video: renderVideoTab,
};
```

```js
// new_string
const TAB_RENDERERS = {
  contexto: renderContextoTab,
  estimativa: renderEstimativaTab,
  deploy: renderDeployTab,
  video: renderVideoTab,
  env: renderEnvTab,
};
```

- [ ] **Step 2: Append `renderEnvTab` to the end of `renderer/detail.js`**

```js
function renderEnvTab(project) {
  const panel = document.getElementById('tab-env');
  const chaves = project.env.chavesApi || [];
  panel.innerHTML = `
    <label>Backend URL <input type="text" id="input-backend-url" value="${project.env.backendUrl || ''}" /></label>
    <label>Frontend URL <input type="text" id="input-frontend-url" value="${project.env.frontendUrl || ''}" /></label>
    <label>Gateway de pagamento <input type="text" id="input-gateway" value="${project.env.gatewayPagamento || ''}" /></label>
    <div id="chaves-api-list">
      ${chaves
        .map(
          (chave) => `
        <div class="chave-api-row">
          <input type="text" class="chave-nome" value="${chave.nome || ''}" placeholder="Nome" />
          <input type="text" class="chave-valor" value="${chave.valor || ''}" placeholder="Valor" />
          <button type="button" class="btn-remove-chave">Remover</button>
        </div>`
        )
        .join('')}
    </div>
    <button type="button" id="btn-add-chave">+ Chave de API</button>
    <label>Env bruto (backup)
      <textarea id="textarea-env-raw" rows="8">${project.env.envRaw || ''}</textarea>
    </label>
    <button type="button" id="btn-salvar-env">Salvar</button>
  `;

  function bindRemoveChave(row) {
    row.querySelector('.btn-remove-chave').addEventListener('click', () => row.remove());
  }

  panel.querySelectorAll('.chave-api-row').forEach(bindRemoveChave);

  panel.querySelector('#btn-add-chave').addEventListener('click', () => {
    const list = panel.querySelector('#chaves-api-list');
    const row = document.createElement('div');
    row.className = 'chave-api-row';
    row.innerHTML = `
      <input type="text" class="chave-nome" placeholder="Nome" />
      <input type="text" class="chave-valor" placeholder="Valor" />
      <button type="button" class="btn-remove-chave">Remover</button>
    `;
    bindRemoveChave(row);
    list.appendChild(row);
  });

  panel.querySelector('#btn-salvar-env').addEventListener('click', async () => {
    const chavesApi = Array.from(panel.querySelectorAll('.chave-api-row')).map((row) => ({
      nome: row.querySelector('.chave-nome').value,
      valor: row.querySelector('.chave-valor').value,
    }));
    await window.api.updateProject(project.id, {
      env: {
        backendUrl: panel.querySelector('#input-backend-url').value,
        frontendUrl: panel.querySelector('#input-frontend-url').value,
        gatewayPagamento: panel.querySelector('#input-gateway').value,
        chavesApi,
        envRaw: panel.querySelector('#textarea-env-raw').value,
      },
    });
  });
}
```

- [ ] **Step 3: Manual smoke test**

Run: `npm start`. Open a project, go to the "Env & Hospedagem" tab, fill in
backend/frontend URLs, gateway, add two API keys, paste some raw env text,
save. Reopen the project and confirm every field, including both API keys,
is restored.

- [ ] **Step 4: Commit**

```bash
git add renderer/detail.js
git commit -m "feat: add env and hosting tab to project detail view"
```

---

### Task 10: Credenciais tab

**Files:**
- Modify: `renderer/detail.js`

**Interfaces:**
- Consumes: `TAB_RENDERERS`, `refreshDetail` from Task 8.
- Produces: adds `credenciais: renderCredenciaisTab` to `TAB_RENDERERS` and
  the `renderCredenciaisTab(project)` function.

- [ ] **Step 1: Add the `credenciais` entry to `TAB_RENDERERS`**

```js
// old_string
const TAB_RENDERERS = {
  contexto: renderContextoTab,
  estimativa: renderEstimativaTab,
  deploy: renderDeployTab,
  video: renderVideoTab,
  env: renderEnvTab,
};
```

```js
// new_string
const TAB_RENDERERS = {
  contexto: renderContextoTab,
  estimativa: renderEstimativaTab,
  deploy: renderDeployTab,
  video: renderVideoTab,
  env: renderEnvTab,
  credenciais: renderCredenciaisTab,
};
```

- [ ] **Step 2: Append `renderCredenciaisTab` to the end of `renderer/detail.js`**

```js
function renderCredenciaisTab(project) {
  const panel = document.getElementById('tab-credenciais');
  const credenciais = project.credenciais || [];
  panel.innerHTML = `
    <div id="credenciais-list">
      ${credenciais
        .map(
          (cred) => `
        <div class="credencial-row">
          <input type="text" class="cred-titulo" value="${cred.titulo || ''}" placeholder="Título (ex: Admin)" />
          <input type="text" class="cred-login" value="${cred.login || ''}" placeholder="Login" />
          <input type="text" class="cred-senha" value="${cred.senha || ''}" placeholder="Senha" />
          <input type="text" class="cred-nota" value="${cred.nota || ''}" placeholder="Nota" />
          <button type="button" class="btn-remove-cred">Remover</button>
        </div>`
        )
        .join('')}
    </div>
    <button type="button" id="btn-add-cred">+ Credencial</button>
    <button type="button" id="btn-salvar-credenciais">Salvar</button>
  `;

  function bindRemoveCred(row) {
    row.querySelector('.btn-remove-cred').addEventListener('click', () => row.remove());
  }

  panel.querySelectorAll('.credencial-row').forEach(bindRemoveCred);

  panel.querySelector('#btn-add-cred').addEventListener('click', () => {
    const list = panel.querySelector('#credenciais-list');
    const row = document.createElement('div');
    row.className = 'credencial-row';
    row.innerHTML = `
      <input type="text" class="cred-titulo" placeholder="Título (ex: Admin)" />
      <input type="text" class="cred-login" placeholder="Login" />
      <input type="text" class="cred-senha" placeholder="Senha" />
      <input type="text" class="cred-nota" placeholder="Nota" />
      <button type="button" class="btn-remove-cred">Remover</button>
    `;
    bindRemoveCred(row);
    list.appendChild(row);
  });

  panel.querySelector('#btn-salvar-credenciais').addEventListener('click', async () => {
    const credenciais = Array.from(panel.querySelectorAll('.credencial-row')).map((row) => ({
      titulo: row.querySelector('.cred-titulo').value,
      login: row.querySelector('.cred-login').value,
      senha: row.querySelector('.cred-senha').value,
      nota: row.querySelector('.cred-nota').value,
    }));
    await window.api.updateProject(project.id, { credenciais });
  });
}
```

- [ ] **Step 3: Manual smoke test**

Run: `npm start`. Open a project, go to "Credenciais", add two credentials
(e.g. "Admin" and "Hospedagem"), save, reopen the project and confirm both
rows are restored with their values. Remove one, save, reopen, confirm only
one remains.

- [ ] **Step 4: Commit**

```bash
git add renderer/detail.js
git commit -m "feat: add credenciais tab to project detail view"
```

---

### Task 11: Fotos tab

**Files:**
- Modify: `renderer/detail.js`

**Interfaces:**
- Consumes: `TAB_RENDERERS`, `refreshDetail` from Task 8;
  `window.api.addFoto`, `window.api.removeFoto`, `window.api.getBaseDir`
  (Task 6).
- Produces: adds `fotos: renderFotosTab` to `TAB_RENDERERS` and the
  `renderFotosTab(project)` function.

- [ ] **Step 1: Add the `fotos` entry to `TAB_RENDERERS`**

```js
// old_string
const TAB_RENDERERS = {
  contexto: renderContextoTab,
  estimativa: renderEstimativaTab,
  deploy: renderDeployTab,
  video: renderVideoTab,
  env: renderEnvTab,
  credenciais: renderCredenciaisTab,
};
```

```js
// new_string
const TAB_RENDERERS = {
  contexto: renderContextoTab,
  estimativa: renderEstimativaTab,
  deploy: renderDeployTab,
  video: renderVideoTab,
  env: renderEnvTab,
  credenciais: renderCredenciaisTab,
  fotos: renderFotosTab,
};
```

- [ ] **Step 2: Append `renderFotosTab` to the end of `renderer/detail.js`**

```js
function renderFotosTab(project) {
  const panel = document.getElementById('tab-fotos');
  const fotos = project.fotos || [];
  panel.innerHTML = `
    <button type="button" id="btn-add-foto">+ Adicionar foto</button>
    <div id="fotos-grid" class="fotos-grid"></div>
  `;

  window.api.getBaseDir().then((baseDir) => {
    const grid = panel.querySelector('#fotos-grid');
    const normalizedBaseDir = baseDir.replace(/\\/g, '/');
    fotos.forEach((relPath) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'foto-wrapper';
      const normalizedPath = relPath.replace(/\\/g, '/');
      wrapper.innerHTML = `
        <img src="file://${normalizedBaseDir}/${normalizedPath}" />
        <button type="button" class="btn-remove-foto">Remover</button>
      `;
      wrapper.querySelector('.btn-remove-foto').addEventListener('click', async () => {
        await window.api.removeFoto(project.id, relPath);
        await refreshDetail();
      });
      grid.appendChild(wrapper);
    });
  });

  panel.querySelector('#btn-add-foto').addEventListener('click', async () => {
    await window.api.addFoto(project.id);
    await refreshDetail();
  });
}
```

- [ ] **Step 3: Append fotos-grid styles to `renderer/styles.css`**

```css
.fotos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.foto-wrapper img {
  width: 100%;
  border-radius: 6px;
}
```

- [ ] **Step 4: Manual smoke test**

Run: `npm start`. Open a project, go to "Fotos", click "+ Adicionar foto",
pick an image file from the system dialog, and confirm the thumbnail appears
in the grid. Click "Remover" on it and confirm it disappears. Reopen the
project after adding a photo (without removing it) and confirm it's still
shown, proving the file was actually copied and persisted under the app's
`userData` directory rather than referencing the original file location.

- [ ] **Step 5: Commit**

```bash
git add renderer/detail.js renderer/styles.css
git commit -m "feat: add fotos tab to project detail view"
```

---

### Task 12: Packaging for distribution

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the fully assembled app from Tasks 1-11 and the `build` config
  already present in `package.json` (Task 1).
- Produces: a Windows installer under `dist/`.

- [ ] **Step 1: Build the Windows installer**

Run: `npm run dist`
Expected: `electron-builder` completes without errors and produces an
installer executable under `dist/` (e.g.
`dist/Projects Aligner Setup 1.0.0.exe`).

- [ ] **Step 2: Manual install smoke test**

Run the generated installer from `dist/`. Expected: it installs the app and
creates a desktop/start-menu shortcut. Launch it from that shortcut (not from
the terminal) and confirm the macro grid loads with previously entered
projects intact (since data lives under `app.getPath('userData')`, it
persists independently of the install).

- [ ] **Step 3: Update `README.md`** with usage instructions

```markdown
# Projects Aligner

App local (Electron) para organizar a fila de 8 projetos de trabalho:
checklist diário, estimativa, status de deploy, vídeo, contexto/lembretes,
env de hospedagem, credenciais e fotos por projeto.

## Rodando em modo desenvolvimento

\`\`\`bash
npm install
npm start
\`\`\`

## Rodando os testes

\`\`\`bash
npm test
\`\`\`

## Gerando o instalador (.exe)

\`\`\`bash
npm run dist
\`\`\`

O instalador é gerado em `dist/`. Os dados dos projetos (JSON + fotos) ficam
salvos na pasta de dados do usuário do Windows, fora deste repositório.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add usage and packaging instructions"
```

---

## Plan self-review notes

- **Spec coverage:** Electron shell (Task 1), business-day + deploy status +
  trigger logic (Tasks 2-4), JSON persistence (Task 5), IPC (Task 6), macro
  grid with checklist/deploy actions and add/warn badges (Task 7), detail
  view with contexto+lembrete, estimativa, deploy, video (Task 8), env
  (Task 9), credenciais (Task 10), fotos (Task 11), packaging (Task 12).
  The spec's "marcar projeto como inativo" and "editar dias bônus" actions
  are implemented as dedicated controls in the detail view's `#detail-meta`
  block (Task 8), backed by `updateProject(id, patch)` exposed through
  `window.api.updateProject`.
- **Placeholder scan:** no TBD/TODO markers; every step has concrete code or
  a concrete manual-test procedure with expected output.
- **Type consistency:** `TAB_RENDERERS` keys/function names match across
  Tasks 8-11 (`env`/`renderEnvTab`, `credenciais`/`renderCredenciaisTab`,
  `fotos`/`renderFotosTab`); `window.api.*` method names match between
  `preload.js` (Task 6) and all renderer call sites (Tasks 7-11); `store.js`
  function names match between Task 5 and their use in Task 6's `main.js`.
