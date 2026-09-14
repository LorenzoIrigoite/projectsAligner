let currentProjectId = null;

const TAB_RENDERERS = {
  contexto: renderContextoTab,
  estimativa: renderEstimativaTab,
  deploy: renderDeployTab,
  video: renderVideoTab,
  env: renderEnvTab,
  credenciais: renderCredenciaisTab,
  fotos: renderFotosTab,
};

async function openDetail(id) {
  currentProjectId = id;
  document.getElementById('view-macro').classList.add('hidden');
  document.getElementById('view-detail').classList.remove('hidden');
  await refreshDetail();
  activateTab('contexto');
  renderSidebar();
}

async function refreshDetail() {
  const project = await window.api.getProject(currentProjectId);
  document.getElementById('detail-title').textContent =
    `${project.numero} ${project.cliente} ${project.contextoMacro}`;
  document.getElementById('detail-identity').innerHTML = identityMarkup(project, 'identity-lg');
  renderDetailMeta(project);
  Object.values(TAB_RENDERERS).forEach((renderFn) => renderFn(project));
}

function renderDetailMeta(project) {
  const meta = document.getElementById('detail-meta');
  meta.innerHTML = `
    <label>Dias bônus
      <input type="number" id="input-dias-bonus" min="0" value="${escapeHtml(project.diasBonus)}" style="width:60px" />
    </label>
    <button type="button" id="btn-salvar-bonus" class="ghost">Salvar dias bônus</button>
    <button type="button" id="btn-toggle-ativo" class="ghost">
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
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === tabName);
  });
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

document.getElementById('btn-back-to-macro').addEventListener('click', async () => {
  currentProjectId = null;
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
            📌 Lembrete: ${escapeHtml(project.lembreteProximoDia)}
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
      <textarea id="textarea-contexto" rows="10">${escapeHtml(project.contexto || '')}</textarea>
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
      <textarea id="textarea-estimativa-nota" rows="5">${escapeHtml(project.estimativa.nota || '')}</textarea>
    </label>
    <button type="button" id="btn-salvar-estimativa">Salvar</button>
  `;

  panel.querySelector('#btn-salvar-estimativa').addEventListener('click', async () => {
    const feita = panel.querySelector('#chk-estimativa-feita').checked;
    const nota = panel.querySelector('#textarea-estimativa-nota').value;
    await window.api.updateProject(project.id, {
      estimativa: {
        ...project.estimativa,
        feita,
        nota,
        feitaEm: feita ? (project.estimativa.feitaEm || localDateStr()) : null,
      },
    });
  });
}

function renderDeployTab(project) {
  const panel = document.getElementById('tab-deploy');
  const done = project.statusDeploy === 'atualizado';
  const history = [...(project.deploys || [])].reverse();
  panel.innerHTML = `
    <p class="deploy-status">${escapeHtml(statusLabel(project.statusDeploy))}</p>
    <div class="form-actions deploy-tab-actions">
      ${done
        ? '<button type="button" id="btn-clear-deploy" class="ghost">Desfazer último deploy</button>'
        : `<button type="button" id="btn-detail-mark-deploy" class="primary">Marcar deploy feito</button>`}
    </div>
    <div class="deploy-log">
      <h3>Atualizações</h3>
      ${
        history.length === 0
          ? '<p class="hint">Nenhum deploy marcado ainda.</p>'
          : `<ol class="deploy-log-list">${history.map((entry) => {
              const when = entry.em
                ? new Date(entry.em).toLocaleString('pt-BR')
                : entry.data;
              return `<li><time datetime="${escapeHtml(entry.em || entry.data || '')}">${escapeHtml(when)}</time><span>Deploy marcado</span></li>`;
            }).join('')}</ol>`
      }
    </div>
  `;

  const markButton = panel.querySelector('#btn-detail-mark-deploy');
  if (markButton) {
    markButton.addEventListener('click', async () => {
      await window.api.markDeployDone(project.id);
      await refreshDetail();
      await loadProjects();
    });
  }

  const clearButton = panel.querySelector('#btn-clear-deploy');
  if (clearButton) {
    clearButton.addEventListener('click', async () => {
      await window.api.clearDeploy(project.id);
      await refreshDetail();
      await loadProjects();
    });
  }
}

function renderVideoTab(project) {
  const panel = document.getElementById('tab-video');
  panel.innerHTML = `
    <label>
      <input type="checkbox" id="chk-video-feito" ${project.video.feito ? 'checked' : ''} />
      Vídeo gravado
    </label>
    <label>Nota (link/local do vídeo)
      <textarea id="textarea-video-nota" rows="5">${escapeHtml(project.video.nota || '')}</textarea>
    </label>
    <button type="button" id="btn-salvar-video">Salvar</button>
  `;

  panel.querySelector('#btn-salvar-video').addEventListener('click', async () => {
    const feito = panel.querySelector('#chk-video-feito').checked;
    const nota = panel.querySelector('#textarea-video-nota').value;
    await window.api.updateProject(project.id, { video: { feito, nota } });
  });
}

function renderEnvTab(project) {
  const panel = document.getElementById('tab-env');
  const chaves = project.env.chavesApi || [];
  panel.innerHTML = `
    <label>Backend URL <input type="text" id="input-backend-url" value="${escapeHtml(project.env.backendUrl || '')}" /></label>
    <label>Frontend URL <input type="text" id="input-frontend-url" value="${escapeHtml(project.env.frontendUrl || '')}" /></label>
    <label>Gateway de pagamento <input type="text" id="input-gateway" value="${escapeHtml(project.env.gatewayPagamento || '')}" /></label>
    <div id="chaves-api-list">
      ${chaves
        .map(
          (chave) => `
        <div class="chave-api-row">
          <input type="text" class="chave-nome" value="${escapeHtml(chave.nome || '')}" placeholder="Nome" />
          <input type="text" class="chave-valor" value="${escapeHtml(chave.valor || '')}" placeholder="Valor" />
          <button type="button" class="btn-remove-chave">Remover</button>
        </div>`
        )
        .join('')}
    </div>
    <button type="button" id="btn-add-chave">+ Chave de API</button>
    <label>Env bruto (backup)
      <textarea id="textarea-env-raw" rows="8">${escapeHtml(project.env.envRaw || '')}</textarea>
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

function renderCredenciaisTab(project) {
  const panel = document.getElementById('tab-credenciais');
  const credenciais = project.credenciais || [];
  panel.innerHTML = `
    <div id="credenciais-list">
      ${credenciais
        .map(
          (cred) => `
        <div class="credencial-row">
          <input type="text" class="cred-titulo" value="${escapeHtml(cred.titulo || '')}" placeholder="Título (ex: Admin)" />
          <input type="text" class="cred-login" value="${escapeHtml(cred.login || '')}" placeholder="Login" />
          <input type="text" class="cred-senha" value="${escapeHtml(cred.senha || '')}" placeholder="Senha" />
          <input type="text" class="cred-nota" value="${escapeHtml(cred.nota || '')}" placeholder="Nota" />
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
    const next = Array.from(panel.querySelectorAll('.credencial-row')).map((row) => ({
      titulo: row.querySelector('.cred-titulo').value,
      login: row.querySelector('.cred-login').value,
      senha: row.querySelector('.cred-senha').value,
      nota: row.querySelector('.cred-nota').value,
    }));
    await window.api.updateProject(project.id, { credenciais: next });
  });
}

function fotoFileUrl(baseDir, relPath) {
  const full = `${baseDir.replace(/\\/g, '/')}/${relPath.replace(/\\/g, '/')}`.replace(/\/+/g, '/');
  const prefixed = full.startsWith('/') ? full : `/${full}`;
  return `file://${prefixed.split('/').map((seg) => encodeURIComponent(seg).replace(/%3A/gi, ':')).join('/')}`;
}

function renderFotosTab(project) {
  const panel = document.getElementById('tab-fotos');
  const fotos = project.fotos || [];
  panel.innerHTML = `
    <button type="button" id="btn-add-foto">+ Adicionar foto</button>
    <div id="fotos-drop" class="fotos-drop">Arraste imagens aqui (png, jpg, gif)</div>
    <div id="fotos-grid" class="fotos-grid"></div>
  `;

  const dropZone = panel.querySelector('#fotos-drop');
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    const files = Array.from(event.dataTransfer.files || []);
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await window.api.addFotoBytes(project.id, file.name, bytes);
    }
    if (files.length > 0) await refreshDetail();
  });

  window.api.getBaseDir().then((baseDir) => {
    const grid = panel.querySelector('#fotos-grid');
    if (!grid) return;
    fotos.forEach((relPath) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'foto-wrapper';
      wrapper.innerHTML = `
        <img src="${fotoFileUrl(baseDir, relPath)}" alt="" />
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
