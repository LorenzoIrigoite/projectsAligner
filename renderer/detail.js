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
  document.body.classList.add('modal-open');
  document.getElementById('view-detail').classList.remove('hidden');
  await refreshDetail();
  activateTab('contexto');
  renderSidebar();
}

async function refreshDetail() {
  const project = await window.api.getProject(currentProjectId, state.fila);
  document.getElementById('detail-title').textContent =
    `Projeto ${project.numero} · ${project.cliente}`;
  document.getElementById('detail-identity').innerHTML = `
    <div class="identity identity-lg identity-editable">
      <div class="id-col">
        <span class="id-label">Número</span>
        <span class="id-value id-num">${escapeHtml(project.numero)}</span>
      </div>
      <div class="id-col">
        <span class="id-label">Cliente</span>
        <span class="id-value">${escapeHtml(project.cliente)}</span>
      </div>
      <label class="id-col id-col-edit">
        <span class="id-label">Contexto</span>
        <input type="text" id="detail-contexto-macro" class="inline-text-input" value="${escapeHtml(project.contextoMacro || '')}" />
      </label>
      <label class="id-col id-col-edit">
        <span class="id-label">Plataforma</span>
        <select id="detail-plataforma" class="platform-select">
          <option value="web" ${project.plataforma === 'web' ? 'selected' : ''}>WEB</option>
          <option value="app" ${project.plataforma === 'app' ? 'selected' : ''}>APP</option>
          <option value="app_web" ${project.plataforma === 'app_web' ? 'selected' : ''}>APP/WEB</option>
        </select>
      </label>
    </div>
  `;
  document.getElementById('detail-plataforma').addEventListener('change', async (event) => {
    await window.api.updateProject(project.id, { plataforma: event.target.value });
    await loadProjects();
  });
  document.getElementById('detail-contexto-macro').addEventListener('change', async (event) => {
    await window.api.updateProject(project.id, { contextoMacro: event.target.value.trim() });
    await loadProjects();
    await refreshDetail();
  });
  renderDetailLembreteChip(project);
  await renderDetailActions(project);
  await renderDetailProgress(project);
  await renderDetailMeta(project);
  Object.values(TAB_RENDERERS).forEach((renderFn) => renderFn(project));
  requestAnimationFrame(updateScrollFadeState);
}

function shiftLocalDateStr(dateStr, days) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateStr(date);
}

function isLembreteDue(project, todayStr = localDateStr()) {
  const text = String(project?.lembreteProximoDia || '').trim();
  if (!text) return false;
  const due = project.lembreteParaData;
  if (!due) return true;
  return String(todayStr) >= String(due);
}

function truncateText(text, max = 42) {
  const value = String(text || '').trim();
  if (value.length <= max) return { preview: value, truncated: false };
  return { preview: `${value.slice(0, max - 1)}…`, truncated: true };
}

function renderDetailLembreteChip(project) {
  const slot = document.getElementById('detail-lembrete-slot');
  if (!slot) return;
  if (!isLembreteDue(project)) {
    slot.innerHTML = '';
    return;
  }

  const full = String(project.lembreteProximoDia || '').trim();
  const { preview } = truncateText(full);
  slot.innerHTML = `
    <button type="button" id="btn-lembrete-chip" class="lembrete-chip" title="${escapeHtml(full)}">
      <span class="lembrete-chip-kicker">Lembrete</span>
      <span class="lembrete-chip-text">${escapeHtml(preview)}</span>
    </button>
    <div id="lembrete-popover" class="lembrete-popover hidden" role="dialog" aria-label="Lembrete do projeto">
      <p>${escapeHtml(full)}</p>
      <div class="lembrete-popover-actions">
        <button type="button" id="btn-resolver-lembrete-chip" class="ghost">Marcar como resolvido</button>
        <button type="button" id="btn-fechar-lembrete-chip" class="primary">Fechar</button>
      </div>
    </div>
  `;

  const popover = slot.querySelector('#lembrete-popover');
  slot.querySelector('#btn-lembrete-chip').addEventListener('click', () => {
    popover.classList.toggle('hidden');
  });
  slot.querySelector('#btn-fechar-lembrete-chip').addEventListener('click', () => {
    popover.classList.add('hidden');
  });
  slot.querySelector('#btn-resolver-lembrete-chip').addEventListener('click', async () => {
    await window.api.updateProject(project.id, { lembreteProximoDia: '', lembreteParaData: null });
    await refreshDetail();
  });
}

async function renderDetailActions(project) {
  const slot = document.getElementById('detail-actions-slot');
  if (!slot) return;
  slot.innerHTML = `
    <details class="project-actions-menu">
      <summary aria-label="Ações do projeto" title="Ações do projeto">...</summary>
      <div class="project-actions-panel">
        <button type="button" class="menu-action" data-project-action="toggle-active">${project.ativo ? 'Concluir e tirar da fila' : 'Reativar projeto'}</button>
        <button type="button" class="menu-action" data-project-action="unassign">Deixar sem fila</button>
        <div class="menu-divider"></div>
        <label>Enviar para uma fila salva
          <select id="detail-queue-destination">
            <option value="">Escolher fila</option>
          </select>
        </label>
        <button type="button" class="menu-action" data-project-action="move-saved">Mover para fila escolhida</button>
        <label>Criar fila e mover
          <input type="date" id="detail-new-queue-date" />
        </label>
        <button type="button" class="menu-action" data-project-action="move-new">Criar fila e mover</button>
        <div class="menu-divider"></div>
        <button type="button" class="menu-action is-danger" data-project-action="remove">Remover projeto</button>
      </div>
    </details>
  `;

  const queueSelect = slot.querySelector('#detail-queue-destination');
  (window.api.getSavedQueues ? await window.api.getSavedQueues() : []).forEach((queue) => {
    if (queue.dataInicio === state.fila?.dataInicio) return;
    const option = document.createElement('option');
    option.value = queue.dataInicio;
    option.textContent = `${formatDay(queue.dataInicio)} – ${formatDay(queue.dataFim)}`;
    queueSelect.appendChild(option);
  });

  async function closeAfterProjectChange() {
    currentProjectId = null;
    document.body.classList.remove('modal-open');
    document.getElementById('view-detail').classList.add('hidden');
    await loadProjects();
  }

  slot.querySelector('[data-project-action="toggle-active"]').addEventListener('click', async () => {
    await window.api.updateProject(project.id, { ativo: !project.ativo });
    await closeAfterProjectChange();
  });
  slot.querySelector('[data-project-action="unassign"]').addEventListener('click', async () => {
    await window.api.updateProject(project.id, { semFila: true, dataEntradaFila: null });
    await closeAfterProjectChange();
  });
  slot.querySelector('[data-project-action="move-saved"]').addEventListener('click', async () => {
    if (!queueSelect.value) return;
    await window.api.updateProject(project.id, { semFila: false, dataEntradaFila: queueSelect.value, ativo: true });
    await closeAfterProjectChange();
  });
  slot.querySelector('[data-project-action="move-new"]').addEventListener('click', async () => {
    const dataInicio = slot.querySelector('#detail-new-queue-date').value;
    if (!dataInicio) return;
    const created = await window.api.createFila({ dataInicio });
    await window.api.updateProject(project.id, { semFila: false, dataEntradaFila: created.dataInicio, ativo: true });
    await closeAfterProjectChange();
  });
  slot.querySelector('[data-project-action="remove"]').addEventListener('click', async () => {
    if (!window.confirm('Remover este projeto permanentemente?')) return;
    await window.api.removeProject(project.id);
    await closeAfterProjectChange();
  });
}

function progressToggleMarkup({ id, label, checked, required }) {
  return `
    <label class="mark progress-mark${required ? ' is-required' : ''}">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
      <span class="mark-box" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </label>
  `;
}

async function renderDetailProgress(project) {
  const panel = document.getElementById('detail-progress');
  const today = localDateStr();
  const required = new Set(requiredLabels(project, today));
  const checklistDone = !!project.checklistHistorico?.[today];
  const deployToday = hasDeployToday(project, today);
  const videoDone = hasVideoToday(project, today);
  const estimativaDone = !!project.estimativa?.feita;
  const caption = required.size ? `Hoje: ${[...required].join(', ')}` : 'Fora dos dias obrigatórios da fila';

  panel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">Progresso do dia</h3>
      <p class="panel-sub">${escapeHtml(caption)}</p>
    </div>
    <div class="progress-marks">
      ${progressToggleMarkup({ id: 'detail-chk-checklist', label: 'Checklist', checked: checklistDone, required: required.has('Checklist') })}
      ${progressToggleMarkup({ id: 'detail-chk-estimativa', label: 'Estimativa', checked: estimativaDone, required: false })}
      ${progressToggleMarkup({ id: 'detail-chk-deploy', label: 'Deploy', checked: deployToday, required: required.has('Deploy') })}
      ${progressToggleMarkup({ id: 'detail-chk-video', label: 'Vídeo', checked: videoDone, required: required.has('Vídeo') })}
    </div>
  `;

  panel.querySelector('#detail-chk-checklist').addEventListener('change', async (event) => {
    await window.api.toggleChecklistToday(project.id, event.target.checked);
    await loadProjects();
    await refreshDetail();
  });
  panel.querySelector('#detail-chk-estimativa').addEventListener('change', async (event) => {
    if (event.target.checked) await window.api.markEstimativaDone(project.id);
    else await window.api.clearEstimativa(project.id);
    await loadProjects();
    await refreshDetail();
  });
  panel.querySelector('#detail-chk-deploy').addEventListener('change', async (event) => {
    await window.api.setDeployToday(project.id, event.target.checked);
    await loadProjects();
    await refreshDetail();
  });
  panel.querySelector('#detail-chk-video').addEventListener('change', async (event) => {
    if (event.target.checked) await window.api.markVideoDone(project.id);
    else await window.api.clearVideo(project.id);
    await loadProjects();
    await refreshDetail();
  });
}
async function renderDetailMeta(project) {
  const meta = document.getElementById('detail-meta');
  const count = Number(project.diasBonus) || 0;
  meta.innerHTML = `
    <div class="quick-action-group">
      <span class="bonus-simple-label">Dias bônus</span>
      <strong class="bonus-simple-count">${escapeHtml(count)}</strong>
      <button type="button" id="btn-bonus-plus" class="primary compact-action" title="Contabilizar +1 dia bônus">+1</button>
      <button type="button" id="btn-bonus-minus" class="ghost compact-action" title="Desfazer último" ${count === 0 ? 'disabled' : ''}>−</button>
    </div>
    <div class="quick-action-group quick-action-meeting">
      <span class="bonus-simple-label">Registro</span>
      <button type="button" id="btn-mark-meeting" class="ghost compact-action">+ Meeting</button>
    </div>
  `;

  meta.querySelector('#btn-bonus-plus').addEventListener('click', async () => {
    await window.api.updateProject(project.id, { diasBonus: count + 1 });
    await refreshDetail();
    await loadProjects();
  });
  meta.querySelector('#btn-bonus-minus').addEventListener('click', async () => {
    if (count <= 0) return;
    await window.api.updateProject(project.id, { diasBonus: count - 1 });
    await refreshDetail();
    await loadProjects();
  });
  meta.querySelector('#btn-mark-meeting').addEventListener('click', async () => {
    const project = await window.api.getProject(currentProjectId);
    openMeetingDialog(project);
  });
}

function openMeetingDialog(project) {
  const dialog = document.getElementById('dialog-meeting');
  const history = [...(project?.reunioes || [])].reverse();
  const externalFields = document.getElementById('meeting-external-fields');
  externalFields.classList.toggle('hidden', !!project);
  document.getElementById('meeting-project-number').value = project?.numero || '';
  document.getElementById('meeting-client').value = project?.cliente || '';
  document.getElementById('meeting-type').value = 'primeiro_meet';
  document.getElementById('meeting-date').value = localDateStr();
  document.getElementById('meeting-time').value = '';
  document.getElementById('meeting-context').value = project?.proximaDuvidaMeeting || '';
  document.getElementById('meeting-history-slot').innerHTML = history.length === 0
    ? '<p class="hint meeting-history-empty">Nenhuma reunião registrada ainda.</p>'
    : `<div class="meeting-history"><h3 class="panel-title">Histórico</h3><ol class="deploy-log-list">${history.map((meeting) => `
        <li>
          <div class="meeting-log-meta">
            <time datetime="${escapeHtml(meeting.data || '')}">${escapeHtml(meeting.data || '')}</time>
            <span class="meeting-type-badge">${escapeHtml(meeting.tipo || 'Alinhamento')}</span>
          </div>
          <span>${escapeHtml(meeting.contexto || 'Reunião marcada')}</span>
        </li>`).join('')}</ol></div>`;
  if (!project) {
    document.getElementById('meeting-history-slot').innerHTML =
      '<p class="hint meeting-history-empty">Meeting avulso: não precisa estar em uma fila ou projeto cadastrado.</p>';
  }
  dialog.showModal();
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
  document.body.classList.remove('modal-open');
  document.getElementById('view-detail').classList.add('hidden');
  await loadProjects();
});

let activeCredential = null;
let copiedCredentialFields = { login: false, senha: false };

function credentialLabel(cred, index) {
  return cred.titulo || cred.login || `Conta ${index + 1}`;
}

async function copyCredentialField(field) {
  if (!activeCredential) return;
  const value = activeCredential[field] || '';
  if (!value) return;
  await navigator.clipboard.writeText(value);
  copiedCredentialFields[field] = true;
  const status = document.getElementById('credential-copy-status');
  status.textContent = field === 'login' ? 'Email copiado' : 'Senha copiada';
  if (copiedCredentialFields.login && copiedCredentialFields.senha) {
    document.getElementById('dialog-credential-copy').close();
  }
}

function openCredentialCopy(cred, index) {
  activeCredential = cred;
  copiedCredentialFields = { login: false, senha: false };
  document.getElementById('credential-copy-title').textContent = credentialLabel(cred, index);
  document.getElementById('credential-copy-login').textContent = cred.login || 'Sem email';
  document.getElementById('credential-copy-status').textContent = '';
  document.getElementById('dialog-credential-picker').close();
  document.getElementById('dialog-credential-copy').showModal();
}

async function openCredentialPicker() {
  if (!currentProjectId) return;
  const project = await window.api.getProject(currentProjectId, state.fila);
  const credenciais = project?.credenciais || [];
  const list = document.getElementById('credential-picker-list');
  if (credenciais.length === 0) {
    list.innerHTML = '<p class="hint">Nenhuma credencial salva neste projeto.</p>';
    document.getElementById('dialog-credential-picker').showModal();
    return;
  }
  if (credenciais.length === 1) {
    openCredentialCopy(credenciais[0], 0);
    return;
  }
  list.innerHTML = credenciais.map((cred, index) => `
    <button type="button" class="credential-picker-option" data-credential-index="${index}">
      <strong>${escapeHtml(credentialLabel(cred, index))}</strong>
      <span>${escapeHtml(cred.login || 'Sem email')}</span>
    </button>
  `).join('');
  list.querySelectorAll('[data-credential-index]').forEach((button) => {
    button.addEventListener('click', () => {
      openCredentialCopy(credenciais[Number(button.dataset.credentialIndex)], Number(button.dataset.credentialIndex));
    });
  });
  document.getElementById('dialog-credential-picker').showModal();
}

document.getElementById('btn-open-credentials').addEventListener('click', openCredentialPicker);
document.getElementById('btn-copy-credential-login').addEventListener('click', () => copyCredentialField('login'));
document.getElementById('btn-copy-credential-password').addEventListener('click', () => copyCredentialField('senha'));

function renderContextoTab(project) {
  const panel = document.getElementById('tab-contexto');
  const today = localDateStr();
  const text = String(project.lembreteProximoDia || '').trim();
  const due = isLembreteDue(project, today);
  const scheduled = text && project.lembreteParaData && !due;
  const firstCred = firstCredential(project);
  const env = project.env || {};
  panel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">Contexto</h3>
      <p class="panel-sub">Lembretes, notas e reuniões do projeto</p>
    </div>
    ${
      due
        ? `<div class="lembrete-destaque">
            Lembrete de hoje: ${escapeHtml(text)}
            <button type="button" id="btn-resolver-lembrete">Marcar como resolvido</button>
          </div>`
        : ''
    }
    ${
      scheduled
        ? `<p class="hint">Lembrete agendado para ${escapeHtml(formatDay(project.lembreteParaData))} — aparece no modal a partir de 00h.</p>`
        : ''
    }
    <div class="quick-access-grid">
      <section class="quick-access-card">
        <h4>Acesso</h4>
        ${firstCred ? `
          <p><span>Login</span><strong>${escapeHtml(firstCred.login || 'Sem login')}</strong></p>
          <p><span>Senha</span><strong>${escapeHtml(firstCred.senha || 'Sem senha')}</strong></p>
          ${firstCred.nota ? `<p><span>Nota</span><strong>${escapeHtml(firstCred.nota)}</strong></p>` : ''}
          <button type="button" class="ghost" data-open-tab="credenciais">Abrir credenciais</button>
        ` : '<p class="hint">Nenhuma credencial salva.</p><button type="button" class="ghost" data-open-tab="credenciais">Adicionar credencial</button>'}
      </section>
      <section class="quick-access-card">
        <h4>Env</h4>
        <p><span>Front</span><strong>${escapeHtml(env.frontendUrl || 'Sem URL')}</strong></p>
        <p><span>Back</span><strong>${escapeHtml(env.backendUrl || 'Sem URL')}</strong></p>
        <p><span>Gateway</span><strong>${escapeHtml(env.gatewayPagamento || 'Não informado')}</strong></p>
        <button type="button" class="ghost" data-open-tab="env">Abrir env</button>
      </section>
    </div>
    <div class="clean-box">
      <label>Dúvida para o próximo meeting
        <textarea id="textarea-duvida-meeting" rows="4" placeholder="Pergunta ou dúvida para falar com o cliente">${escapeHtml(project.proximaDuvidaMeeting || '')}</textarea>
      </label>
      <p class="hint">Fica salva até um meeting deste projeto ser marcado como feito.</p>
      <div class="clean-box-actions">
        <button type="button" id="btn-salvar-duvida-meeting" class="primary">Salvar dúvida</button>
      </div>
    </div>
    <div class="clean-box">
      <label>Novo lembrete para o próximo dia
        <input type="text" id="input-novo-lembrete" placeholder="O que lembrar amanhã" />
      </label>
      <div class="clean-box-actions">
        <button type="button" id="btn-salvar-lembrete" class="primary">Salvar lembrete</button>
      </div>
    </div>
    <div class="clean-box">
      <label>Notas de contexto
        <textarea id="textarea-contexto" rows="10">${escapeHtml(project.contexto || '')}</textarea>
      </label>
      <div class="clean-box-actions">
        <button type="button" id="btn-salvar-contexto" class="primary">Salvar notas</button>
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-open-tab]').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.openTab));
  });

  if (due) {
    panel.querySelector('#btn-resolver-lembrete').addEventListener('click', async () => {
      await window.api.updateProject(project.id, { lembreteProximoDia: '', lembreteParaData: null });
      await refreshDetail();
    });
  }

  panel.querySelector('#btn-salvar-lembrete').addEventListener('click', async () => {
    const texto = panel.querySelector('#input-novo-lembrete').value.trim();
    await window.api.updateProject(project.id, {
      lembreteProximoDia: texto,
      lembreteParaData: texto ? shiftLocalDateStr(today, 1) : null,
    });
    await refreshDetail();
  });

  panel.querySelector('#btn-salvar-duvida-meeting').addEventListener('click', async () => {
    const texto = panel.querySelector('#textarea-duvida-meeting').value.trim();
    await window.api.updateProject(project.id, { proximaDuvidaMeeting: texto });
    await refreshDetail();
  });

  panel.querySelector('#btn-salvar-contexto').addEventListener('click', async () => {
    const texto = panel.querySelector('#textarea-contexto').value;
    await window.api.updateProject(project.id, { contexto: texto });
  });

}

document.getElementById('btn-cancel-meeting').addEventListener('click', () => {
  document.getElementById('dialog-meeting').close();
});

document.getElementById('form-meeting').addEventListener('submit', async (event) => {
  event.preventDefault();
  const project = await window.api.getProject(currentProjectId);
  const tipo = document.getElementById('meeting-type').value;
  const contexto = document.getElementById('meeting-context').value.trim();
  const data = document.getElementById('meeting-date').value;
  const hora = document.getElementById('meeting-time').value;
  if (data && hora && window.api.scheduleMeeting) {
    await window.api.scheduleMeeting(project?.id || null, {
      data,
      hora,
      motivo: tipo,
      contexto,
      numero: document.getElementById('meeting-project-number').value,
      cliente: document.getElementById('meeting-client').value,
    });
  } else if (project) {
    await window.api.markMeetingDone(project.id, localDateStr(), contexto, tipo);
  } else {
    return;
  }
  document.getElementById('dialog-meeting').close();
  if (project) await refreshDetail();
  await loadProjects();
});

function historyListMarkup(entries, emptyText, label) {
  const history = [...(entries || [])].reverse();
  if (history.length === 0) return `<p class="hint">${escapeHtml(emptyText)}</p>`;
  return `<ol class="deploy-log-list">${history.map((entry) => {
    const when = entry.em ? new Date(entry.em).toLocaleString('pt-BR') : entry.data;
    return `<li><time datetime="${escapeHtml(entry.em || entry.data || '')}">${escapeHtml(when)}</time><span>${escapeHtml(label)}</span></li>`;
  }).join('')}</ol>`;
}

function renderEstimativaTab(project) {
  const panel = document.getElementById('tab-estimativa');
  const done = !!(project.estimativa?.feita || (project.estimativas || []).length);
  panel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">Estimativa</h3>
      <p class="panel-sub">Status e histórico de marcações</p>
    </div>
    <p class="deploy-status">${done ? 'Feito' : 'Pendente'}</p>
    <div class="form-actions deploy-tab-actions">
      ${done
        ? '<button type="button" id="btn-clear-estimativa" class="ghost">Desfazer última estimativa</button>'
        : '<button type="button" id="btn-mark-estimativa" class="primary">Marcar estimativa feita</button>'}
    </div>
    <div class="clean-box">
      <label>Nota
        <textarea id="textarea-estimativa-nota" rows="4">${escapeHtml(project.estimativa?.nota || '')}</textarea>
      </label>
      <div class="clean-box-actions">
        <button type="button" id="btn-salvar-estimativa-nota" class="primary">Salvar nota</button>
      </div>
    </div>
    <div class="deploy-log">
      <h3 class="panel-title">Atualizações</h3>
      ${historyListMarkup(project.estimativas, 'Nenhuma estimativa marcada ainda.', 'Estimativa marcada')}
    </div>
  `;

  const markButton = panel.querySelector('#btn-mark-estimativa');
  if (markButton) {
    markButton.addEventListener('click', async () => {
      await window.api.markEstimativaDone(project.id);
      await refreshDetail();
      await loadProjects();
    });
  }
  const clearButton = panel.querySelector('#btn-clear-estimativa');
  if (clearButton) {
    clearButton.addEventListener('click', async () => {
      await window.api.clearEstimativa(project.id);
      await refreshDetail();
      await loadProjects();
    });
  }
  panel.querySelector('#btn-salvar-estimativa-nota').addEventListener('click', async () => {
    const nota = panel.querySelector('#textarea-estimativa-nota').value;
    await window.api.updateProject(project.id, {
      estimativa: { ...(project.estimativa || { feita: false }), nota },
    });
  });
}

function renderDeployTab(project) {
  const panel = document.getElementById('tab-deploy');
  const done = project.statusDeploy === 'atualizado';
  const history = [...(project.deploys || [])].reverse();
  panel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">Deploy</h3>
      <p class="panel-sub">Status atual e histórico de atualizações</p>
    </div>
    <p class="deploy-status">${escapeHtml(statusLabel(project.statusDeploy))}</p>
    <div class="form-actions deploy-tab-actions">
      ${done
        ? '<button type="button" id="btn-clear-deploy" class="ghost">Desfazer último deploy</button>'
        : `<button type="button" id="btn-detail-mark-deploy" class="primary">Marcar deploy feito</button>`}
    </div>
    <div class="deploy-log">
      <h3 class="panel-title">Atualizações</h3>
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
  const done = !!(project.video?.feito || (project.videos || []).length);
  panel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">Vídeo</h3>
      <p class="panel-sub">Status e histórico de marcações</p>
    </div>
    <p class="deploy-status">${done ? 'Feito' : 'Pendente'}</p>
    <div class="form-actions deploy-tab-actions">
      ${done
        ? '<button type="button" id="btn-clear-video" class="ghost">Desfazer último vídeo</button>'
        : '<button type="button" id="btn-mark-video" class="primary">Marcar vídeo feito</button>'}
    </div>
    <div class="clean-box">
      <label>Nota (link/local do vídeo)
        <textarea id="textarea-video-nota" rows="4">${escapeHtml(project.video?.nota || '')}</textarea>
      </label>
      <div class="clean-box-actions">
        <button type="button" id="btn-salvar-video-nota" class="primary">Salvar nota</button>
      </div>
    </div>
    <div class="deploy-log">
      <h3 class="panel-title">Atualizações</h3>
      ${historyListMarkup(project.videos, 'Nenhum vídeo marcado ainda.', 'Vídeo marcado')}
    </div>
  `;

  const markButton = panel.querySelector('#btn-mark-video');
  if (markButton) {
    markButton.addEventListener('click', async () => {
      await window.api.markVideoDone(project.id);
      await refreshDetail();
      await loadProjects();
    });
  }
  const clearButton = panel.querySelector('#btn-clear-video');
  if (clearButton) {
    clearButton.addEventListener('click', async () => {
      await window.api.clearVideo(project.id);
      await refreshDetail();
      await loadProjects();
    });
  }
  panel.querySelector('#btn-salvar-video-nota').addEventListener('click', async () => {
    const nota = panel.querySelector('#textarea-video-nota').value;
    await window.api.updateProject(project.id, {
      video: { ...(project.video || { feito: false }), nota },
    });
  });
}

function renderEnvTab(project) {
  const panel = document.getElementById('tab-env');
  const chaves = project.env.chavesApi || [];
  panel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">Env e hospedagem</h3>
      <p class="panel-sub">URLs, chaves e backup do ambiente</p>
    </div>
    <div class="clean-box">
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
            <button type="button" class="btn-remove-chave ghost">Remover</button>
          </div>`
          )
          .join('')}
      </div>
      <button type="button" id="btn-add-chave" class="ghost">+ Chave de API</button>
      <label>Env bruto (backup)
        <textarea id="textarea-env-raw" rows="8">${escapeHtml(project.env.envRaw || '')}</textarea>
      </label>
      <div class="clean-box-actions">
        <span id="env-save-status" class="save-status" aria-live="polite"></span>
        <button type="button" id="btn-salvar-env" class="primary">Salvar</button>
      </div>
    </div>
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
      <button type="button" class="btn-remove-chave ghost">Remover</button>
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
    const status = panel.querySelector('#env-save-status');
    status.textContent = 'Salvo';
    status.classList.add('is-visible');
    window.setTimeout(() => status.classList.remove('is-visible'), 1600);
  });
}

function renderCredenciaisTab(project) {
  const panel = document.getElementById('tab-credenciais');
  const credenciais = project.credenciais || [];

  function credentialCardMarkup(cred = {}, { open = false, isNew = false } = {}) {
    const title = cred.titulo || (isNew ? 'Nova credencial' : 'Credencial sem título');
    const login = cred.login || (isNew ? 'Preencha os dados' : 'Sem login');
    return `
      <details class="credential-card"${open ? ' open' : ''}>
        <summary>
          <strong class="cred-summary-title">${escapeHtml(title)}</strong>
          <span class="cred-summary-login">${escapeHtml(login)}</span>
        </summary>
        <div class="credential-fields">
          <label>Título<input type="text" class="cred-titulo" value="${escapeHtml(cred.titulo || '')}" placeholder="Admin" /></label>
          <label>Login<input type="text" class="cred-login" value="${escapeHtml(cred.login || '')}" placeholder="email ou usuário" /></label>
          <label>Senha<input type="text" class="cred-senha" value="${escapeHtml(cred.senha || '')}" placeholder="Senha" /></label>
          <label>Nota<input type="text" class="cred-nota" value="${escapeHtml(cred.nota || '')}" placeholder="Observação" /></label>
          <button type="button" class="btn-remove-cred ghost">Remover credencial</button>
        </div>
      </details>
    `;
  }

  panel.innerHTML = `
    <div class="credential-header">
      <div>
        <h3 class="panel-title">Credenciais salvas</h3>
        <p class="hint">Abra uma credencial para editar. O título atualiza na hora.</p>
      </div>
      <button type="button" id="btn-add-cred" class="ghost">+ Adicionar</button>
    </div>
    <div id="credenciais-list" class="credentials-list">
      ${credenciais.map((cred) => credentialCardMarkup(cred)).join('')}
    </div>
    <div class="clean-box">
      <div class="clean-box-actions">
        <span id="credential-save-status" class="save-status" aria-live="polite"></span>
        <button type="button" id="btn-salvar-credenciais" class="primary">Salvar credenciais</button>
      </div>
    </div>
  `;

  function syncCredentialSummary(card) {
    const titleInput = card.querySelector('.cred-titulo');
    const loginInput = card.querySelector('.cred-login');
    const titleEl = card.querySelector('.cred-summary-title');
    const loginEl = card.querySelector('.cred-summary-login');
    const title = titleInput.value.trim();
    const login = loginInput.value.trim();
    titleEl.textContent = title || 'Credencial sem título';
    loginEl.textContent = login || 'Sem login';
  }

  function bindCredentialCard(card) {
    card.querySelector('.btn-remove-cred').addEventListener('click', (event) => {
      event.preventDefault();
      card.remove();
    });
    card.querySelector('.cred-titulo').addEventListener('input', () => syncCredentialSummary(card));
    card.querySelector('.cred-login').addEventListener('input', () => syncCredentialSummary(card));
  }

  panel.querySelectorAll('.credential-card').forEach(bindCredentialCard);

  panel.querySelector('#btn-add-cred').addEventListener('click', () => {
    const list = panel.querySelector('#credenciais-list');
    const wrap = document.createElement('div');
    wrap.innerHTML = credentialCardMarkup({}, { open: true, isNew: true }).trim();
    const card = wrap.firstElementChild;
    list.appendChild(card);
    bindCredentialCard(card);
    card.querySelector('.cred-titulo').focus();
  });

  panel.querySelector('#btn-salvar-credenciais').addEventListener('click', async () => {
    const next = Array.from(panel.querySelectorAll('.credential-card')).map((row) => ({
      titulo: row.querySelector('.cred-titulo').value.trim(),
      login: row.querySelector('.cred-login').value.trim(),
      senha: row.querySelector('.cred-senha').value,
      nota: row.querySelector('.cred-nota').value.trim(),
    }));
    await window.api.updateProject(project.id, { credenciais: next });
    const status = panel.querySelector('#credential-save-status');
    status.textContent = 'Salvo';
    status.classList.add('is-visible');
    window.setTimeout(() => status.classList.remove('is-visible'), 1600);
    await refreshDetail();
    activateTab('credenciais');
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
