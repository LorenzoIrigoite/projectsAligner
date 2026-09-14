const state = { projects: [], fila: null };

if (typeof window.api === 'undefined') {
  window.api = createBrowserPreviewApi();
}

async function loadProjects() {
  state.fila = await window.api.getFila();
  state.projects = await window.api.getAllProjects();
  renderBoard();
}

function renderBoard() {
  const hasFila = Boolean(state.fila);
  document.getElementById('fila-setup').classList.toggle('hidden', hasFila);
  document.getElementById('view-macro').classList.toggle('hidden', !hasFila || !document.getElementById('view-detail').classList.contains('hidden'));
  document.getElementById('btn-add-project').classList.toggle('hidden', !hasFila);
  document.getElementById('btn-edit-fila').classList.toggle('hidden', !hasFila);

  if (!hasFila) {
    document.getElementById('fila-title').textContent = 'Abrir a fila';
    document.getElementById('fila-period').textContent = 'O período é da fila, não de cada projeto.';
    document.getElementById('week-track').classList.add('hidden');
    renderSidebar();
    return;
  }

  const active = state.projects.filter((p) => p.ativo);
  document.getElementById('fila-title').textContent = 'Fila da semana';
  document.getElementById('fila-period').textContent =
    `${formatDay(state.fila.dataInicio)} – ${formatDay(state.fila.dataFim)} · ${active.length} de 8`;
  renderWeekTrack(active);
  renderMacroGrid();
  renderSidebar();
}

function statusLabel(status) {
  if (status === 'atualizado') return 'Deploy já feito';
  if (status === 'pendente') return 'Pendente';
  return 'Nunca implantado';
}

function formatDay(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function identityMarkup(project, extraClass = '') {
  return `
    <div class="identity ${extraClass}">
      <div class="id-col">
        <span class="id-label">Número</span>
        <span class="id-value id-num">${escapeHtml(project.numero)}</span>
      </div>
      <div class="id-col">
        <span class="id-label">Cliente</span>
        <span class="id-value">${escapeHtml(project.cliente)}</span>
      </div>
      <div class="id-col">
        <span class="id-label">Contexto</span>
        <span class="id-value id-ctx">${escapeHtml(project.contextoMacro)}</span>
      </div>
    </div>
  `;
}

function statusWord(status) {
  if (status === 'done') return 'concluído';
  if (status === 'overdue') return 'fechou com pendência';
  if (status === 'current') return 'em aberto hoje';
  return 'ainda não chegou';
}

function dotsMarkup(semana, today) {
  const days = semana || [];
  if (days.length === 0) return '';
  return `
    <div class="dots" role="list" aria-label="Progresso da semana">
      ${days.map((day) => {
        const isToday = day.date === today;
        const clickable = day.status === 'overdue' || day.status === 'current';
        const title = `Dia ${day.dayNumber} · ${formatDay(day.date)} · ${statusWord(day.status)}`;
        const tag = clickable ? 'button' : 'span';
        const typeAttr = clickable ? ' type="button"' : '';
        return `<${tag}${typeAttr} class="dot is-${day.status}${isToday ? ' is-today' : ''}" data-date="${escapeHtml(day.date)}" title="${escapeHtml(title)}" role="listitem"><span>${day.dayNumber}</span></${tag}>`;
      }).join('')}
    </div>
  `;
}

function renderWeekTrack(active) {
  const track = document.getElementById('week-track');
  const dias = state.fila?.dias || [];
  const today = localDateStr();
  if (dias.length === 0) {
    track.classList.add('hidden');
    track.innerHTML = '';
    return;
  }

  const elapsed = dias.filter((date) => date <= today).length;
  const remaining = Math.max(0, 7 - elapsed);
  const semanaFila = dias.map((date, index) => {
    const dayNumber = index + 1;
    if (date > today) return { dayNumber, date, status: 'future' };
    const allDone = active.length > 0 && active.every((project) => {
      const day = (project.semana || [])[index];
      return day && day.status === 'done';
    });
    if (allDone) return { dayNumber, date, status: 'done' };
    return { dayNumber, date, status: date < today ? 'overdue' : 'current' };
  });

  track.classList.remove('hidden');
  track.innerHTML = `
    <div class="week-copy">
      <strong>Dia ${Math.min(elapsed, 7)} de 7</strong>
      <span>${remaining === 0 ? 'Semana encerrada' : `faltam ${remaining}`}</span>
    </div>
    ${dotsMarkup(semanaFila, today)}
  `;
  track.querySelectorAll('button.dot').forEach((button) => {
    button.addEventListener('click', () => openDayReview(button.dataset.date, active));
  });
}

function openDayReview(dateStr, active) {
  const dialog = document.getElementById('dialog-day-review');
  const title = document.getElementById('day-review-title');
  const body = document.getElementById('day-review-body');
  const dayNumber = (state.fila?.dias || []).indexOf(dateStr) + 1;
  const closed = dateStr < localDateStr();
  title.textContent = `Dia ${dayNumber} · ${formatDay(dateStr)}`;

  const rows = (active || []).map((project) => {
    const day = (project.semana || []).find((item) => item.date === dateStr);
    const faltas = day?.faltas || [];
    return { project, faltas, status: day?.status || 'future' };
  }).filter((row) => row.faltas.length > 0);

  if (rows.length === 0) {
    body.innerHTML = `<p class="hint">${closed ? 'Esse dia fechou sem pendência.' : 'Nada obrigatório em aberto hoje.'}</p>`;
  } else {
    body.innerHTML = `
      <p class="hint">${closed ? 'Ficou pendente quando o dia virou.' : 'Ainda falta hoje.'}</p>
      <ul class="day-review-list">
        ${rows.map((row) => `
          <li>
            <strong>${escapeHtml(row.project.numero)} ${escapeHtml(row.project.cliente)}</strong>
            <span>${row.faltas.map((item) => escapeHtml(item)).join(' · ')}</span>
          </li>
        `).join('')}
      </ul>
    `;
  }
  dialog.showModal();
}

function firstCredential(project) {
  return (project.credenciais || []).find((cred) => cred.login || cred.senha || cred.nota) || null;
}

function loginMarkup(project) {
  const cred = firstCredential(project);
  if (!cred) return '';
  const login = cred.login ? `<span class="login-value">${escapeHtml(cred.login)}</span>` : '';
  const senha = cred.senha ? escapeHtml(cred.senha) : '';
  const joined = [login, senha].filter(Boolean).join('; ');
  const extra = cred.nota ? ` <span class="login-nota">(${escapeHtml(cred.nota)})</span>` : '';
  return `<p class="card-login">LOGIN: ${joined}${extra}</p>`;
}

function noteLines(project) {
  const lines = [];
  if (project.env?.gatewayPagamento) {
    lines.push(`GATEWAY: ${project.env.gatewayPagamento}`);
  }
  const contexto = String(project.contexto || '').trim();
  if (contexto) {
    contexto.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      lines.push(line);
    });
  }
  return lines.slice(0, 2);
}

function requiredLabels(project, today) {
  const day = (project.semana || []).find((item) => item.date === today);
  if (!day || day.status === 'future') return [];
  if (day.dayNumber === 7) return ['Checklist', 'Deploy', 'Vídeo'];
  if (day.dayNumber === 6) return ['Checklist', 'Deploy'];
  return ['Checklist'];
}

function hasDeployToday(project, today) {
  return (project.deploys || []).some((entry) => entry.data === today);
}

function hasVideoToday(project, today) {
  if (project.videoHistorico && Object.prototype.hasOwnProperty.call(project.videoHistorico, today)) {
    return !!project.videoHistorico[today];
  }
  const video = project.video;
  if (!video?.feito) return false;
  if (!video.feitoEm) return true;
  return String(video.feitoEm).slice(0, 10) <= today;
}

function marksMarkup(project, today) {
  const required = new Set(requiredLabels(project, today));
  const markClass = (name) => (required.has(name) ? 'mark is-required' : 'mark');
  const checklistDone = !!project.checklistHistorico[today];
  const deployToday = hasDeployToday(project, today);
  const caption = required.size
    ? `Hoje: ${[...required].join(', ')}`
    : '';
  return `
    <div class="card-marks">
      <label class="${markClass('Checklist')}">
        <input type="checkbox" class="chk-checklist" ${checklistDone ? 'checked' : ''} />
        Checklist
      </label>
      <span class="mark-sep" aria-hidden="true">|</span>
      <label class="mark">
        <input type="checkbox" class="chk-estimativa" ${project.estimativa?.feita ? 'checked' : ''} />
        Estimativa
      </label>
      <span class="mark-sep" aria-hidden="true">|</span>
      <label class="${markClass('Deploy')}">
        <input type="checkbox" class="chk-deploy" ${deployToday ? 'checked' : ''} />
        Deploy
      </label>
      <span class="mark-sep" aria-hidden="true">|</span>
      <label class="${markClass('Vídeo')}">
        <input type="checkbox" class="chk-video" ${hasVideoToday(project, today) ? 'checked' : ''} />
        Vídeo
      </label>
    </div>
    ${caption ? `<p class="card-required">${escapeHtml(caption)}</p>` : ''}
  `;
}

function localDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function renderMacroGrid() {
  const grid = document.getElementById('macro-grid');
  grid.innerHTML = '';

  const today = localDateStr();
  const active = state.projects.filter((p) => p.ativo);
  const inactive = state.projects.filter((p) => !p.ativo);

  document.getElementById('btn-add-project').disabled = active.length >= 8;
  document.getElementById('btn-add-project').title = active.length >= 8
    ? 'Fila cheia. Conclua um projeto antes de adicionar outro.'
    : '';

  if (active.length === 0) {
    grid.innerHTML = '<p class="empty-state">Nenhum projeto nesta fila.</p>';
  }

  active.forEach((project) => {
    const card = document.createElement('article');
    const todayDone = (project.semana || []).some((day) => day.date === today && day.status === 'done');
    const doneLabel = todayDone ? '<p class="day-done-label">Dia concluído</p>' : '';
    card.className = `project-card${todayDone ? ' is-day-done' : ''}`;
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', `Abrir ${project.numero} ${project.cliente}`);

    const login = loginMarkup(project);
    const notes = noteLines(project);

    card.innerHTML = `
      <div class="card-main">
        ${identityMarkup(project)}
        ${marksMarkup(project, today)}
        ${doneLabel}
        ${login}
        ${notes.length ? `<div class="card-notes">${notes.map((line) => `<p class="card-note">${escapeHtml(line)}</p>`).join('')}</div>` : ''}
      </div>
    `;

    const open = () => openDetail(project.id);
    card.addEventListener('click', (event) => {
      if (event.target.closest('.card-marks, input, label, button, a')) return;
      open();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    const marks = card.querySelector('.card-marks');
    if (marks) marks.addEventListener('click', (event) => event.stopPropagation());

    const saveMark = async (work) => {
      try {
        await work();
      } finally {
        await loadProjects();
      }
    };

    card.querySelector('.chk-checklist').addEventListener('change', (event) => {
      saveMark(() => window.api.toggleChecklistToday(project.id, event.target.checked));
    });

    card.querySelector('.chk-estimativa').addEventListener('change', (event) => {
      saveMark(() => window.api.updateProject(project.id, {
        estimativa: {
          ...project.estimativa,
          feita: event.target.checked,
          feitaEm: event.target.checked ? localDateStr() : null,
        },
      }));
    });

    card.querySelector('.chk-video').addEventListener('change', (event) => {
      const toggle = window.api.toggleVideoToday
        ? window.api.toggleVideoToday(project.id, event.target.checked)
        : window.api.updateProject(project.id, { video: { ...project.video, feito: event.target.checked } });
      saveMark(() => toggle);
    });

    card.querySelector('.chk-deploy').addEventListener('change', (event) => {
      saveMark(() => window.api.setDeployToday(project.id, event.target.checked));
    });

    grid.appendChild(card);
  });

  const inactiveSection = document.getElementById('inactive-section');
  const inactiveList = document.getElementById('inactive-list');
  inactiveList.innerHTML = '';
  inactiveSection.classList.toggle('hidden', inactive.length === 0);
  inactive.forEach((project) => {
    const row = document.createElement('div');
    row.className = 'inactive-row';
    row.innerHTML = `
      ${identityMarkup(project, 'identity-sm')}
      <button type="button" class="btn-open-inactive ghost">Abrir</button>
    `;
    row.querySelector('.btn-open-inactive').addEventListener('click', () => openDetail(project.id));
    inactiveList.appendChild(row);
  });
}

function matchesSearch(project, query) {
  if (!query) return true;
  const haystack = `${project.numero} ${project.cliente} ${project.contextoMacro}`.toLocaleLowerCase('pt-BR');
  return haystack.includes(query);
}

function renderSidebar() {
  const list = document.getElementById('sidebar-list');
  const query = document.getElementById('project-search').value.trim().toLocaleLowerCase('pt-BR');
  const projects = [...state.projects].sort((a, b) =>
    `${a.cliente} ${a.numero}`.localeCompare(`${b.cliente} ${b.numero}`, 'pt-BR', { sensitivity: 'base' })
  );
  const visible = projects.filter((project) => matchesSearch(project, query));
  list.innerHTML = '';

  if (visible.length === 0) {
    list.innerHTML = '<p class="sidebar-empty">Nenhum projeto</p>';
    return;
  }

  visible.forEach((project) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-item';
    if (typeof currentProjectId !== 'undefined' && currentProjectId === project.id) {
      button.classList.add('is-active');
    }
    if (!project.ativo) button.classList.add('is-inactive');
    button.innerHTML = `
      <span class="sb-num">${escapeHtml(project.numero)}</span>
      <span class="sb-copy">
        <span class="sb-name">${escapeHtml(project.cliente)}</span>
        <span class="sb-ctx">${escapeHtml(project.contextoMacro)}</span>
      </span>
    `;
    button.addEventListener('click', () => openDetail(project.id));
    list.appendChild(button);
  });
}

function formatPreview(period) {
  const end = formatDay(period.dataFim);
  if (period.startIsBusinessDay) {
    return `7 dias úteis, contando o início. Termina em ${end}.`;
  }
  return `O início não é dia útil. O 1º dia útil é ${formatDay(period.firstBusinessDay)}. Termina em ${end}.`;
}

async function fillPeriodPreview(input, previewEl, hiddenEl) {
  if (!input.value) {
    previewEl.textContent = 'O fim é o 7º dia útil, contando o início.';
    hiddenEl.value = '';
    return;
  }
  const period = await window.api.previewFila(input.value);
  hiddenEl.value = period.dataFim;
  previewEl.textContent = formatPreview(period);
}

document.getElementById('btn-add-project').addEventListener('click', () => {
  document.getElementById('dialog-add-project').showModal();
});

document.getElementById('btn-cancel-add-project').addEventListener('click', () => {
  document.getElementById('dialog-add-project').close();
});

document.getElementById('form-add-project').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const error = document.getElementById('add-project-error');
  error.textContent = '';
  const formData = new FormData(form);
  try {
    await window.api.addProject({
      numero: formData.get('numero'),
      cliente: formData.get('cliente'),
      contextoMacro: formData.get('contextoMacro'),
    });
  } catch (err) {
    error.textContent = err.message || 'Não foi possível adicionar o projeto.';
    return;
  }
  form.reset();
  document.getElementById('dialog-add-project').close();
  await loadProjects();
});

document.getElementById('project-search').addEventListener('input', renderSidebar);

function applySidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  const button = document.getElementById('btn-toggle-sidebar');
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  button.title = collapsed ? 'Mostrar lista' : 'Ocultar lista';
  button.setAttribute('aria-label', collapsed ? 'Mostrar lista' : 'Ocultar lista');
  try {
    localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
  } catch (err) {
    /* ignore quota / private mode */
  }
}

document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
  applySidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
});

window.addEventListener('DOMContentLoaded', () => {
  try {
    applySidebarCollapsed(localStorage.getItem('sidebar-collapsed') === '1');
  } catch (err) {
    applySidebarCollapsed(false);
  }
  loadProjects();
  watchDayRollover();
});

function watchDayRollover() {
  let trackedDay = localDateStr();

  async function rollIfNeeded() {
    const today = localDateStr();
    if (today === trackedDay) return;
    trackedDay = today;
    await loadProjects();
  }

  function msUntilMidnight() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    return Math.max(250, next.getTime() - now.getTime() + 200);
  }

  function arm() {
    window.setTimeout(async () => {
      await rollIfNeeded();
      arm();
    }, Math.min(msUntilMidnight(), 60 * 1000));
  }

  arm();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rollIfNeeded();
  });
  window.addEventListener('focus', rollIfNeeded);
}

async function saveFila(form, errorEl, dialog) {
  errorEl.textContent = '';
  const formData = new FormData(form);
  try {
    await window.api.setFila({
      dataInicio: formData.get('dataInicio'),
      dataFim: formData.get('dataFim'),
    });
  } catch (err) {
    errorEl.textContent = err.message || 'Não foi possível salvar o período.';
    return;
  }
  if (dialog) dialog.close();
  await loadProjects();
}

document.getElementById('form-fila').addEventListener('submit', (event) => {
  event.preventDefault();
  saveFila(event.target, document.getElementById('fila-error'));
});

document.getElementById('form-fila').dataInicio.addEventListener('change', (event) => {
  const form = document.getElementById('form-fila');
  fillPeriodPreview(event.target, document.getElementById('fila-preview'), form.dataFim);
});

document.getElementById('btn-edit-fila').addEventListener('click', async () => {
  const form = document.getElementById('form-fila-edit');
  form.dataInicio.value = state.fila.dataInicio;
  document.getElementById('fila-edit-error').textContent = '';
  await fillPeriodPreview(form.dataInicio, document.getElementById('fila-edit-preview'), form.dataFim);
  document.getElementById('dialog-fila').showModal();
});

document.getElementById('form-fila-edit').dataInicio.addEventListener('change', (event) => {
  const form = document.getElementById('form-fila-edit');
  fillPeriodPreview(event.target, document.getElementById('fila-edit-preview'), form.dataFim);
});

document.getElementById('btn-cancel-fila').addEventListener('click', () => {
  document.getElementById('dialog-fila').close();
});

document.getElementById('form-fila-edit').addEventListener('submit', (event) => {
  event.preventDefault();
  saveFila(event.target, document.getElementById('fila-edit-error'), document.getElementById('dialog-fila'));
});

function createBrowserPreviewApi() {
  const today = localDateStr();
  const queueDays = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16'];
  let fila = { dataInicio: '2026-09-08', dataFim: '2026-09-16', dias: queueDays };

  function mockSemana(project) {
    return queueDays.map((date, index) => {
      const dayNumber = index + 1;
      const faltas = [];
      if (date <= today && !project.checklistHistorico?.[date]) faltas.push('Checklist');
      const deploys = project.deploys || [];
      if (date <= today && dayNumber >= 6 && !deploys.some((entry) => entry.data === date)) faltas.push('Deploy');
      if (date <= today && dayNumber === 7 && !project.video?.feito) faltas.push('Vídeo');
      let status = 'future';
      if (date < today) status = faltas.length ? 'overdue' : 'done';
      else if (date === today) status = faltas.length ? 'current' : 'done';
      return { dayNumber, date, status, faltas: status === 'done' || status === 'future' ? [] : faltas };
    });
  }

  function withView(project) {
    return { ...project, deploys: project.deploys || [], semana: mockSemana(project) };
  }
  let projects = [
    {
      id: 'p1',
      numero: '420',
      cliente: 'Rerond',
      contextoMacro: 'Trânsito',
      diasBonus: 0,
      ativo: true,
      checklistHistorico: {},
      ultimoDeploy: null,
      ultimoChecklistFeitoEm: null,
      deploys: [],
      estimativa: { feita: false, nota: '' },
      video: { feito: false, nota: '' },
      contexto: 'FALTA código netlify para o DEPLOY',
      lembreteProximoDia: '',
      env: { backendUrl: '', frontendUrl: '', gatewayPagamento: '', chavesApi: [], envRaw: '' },
      credenciais: [{ titulo: 'Admin', login: 'borderlessrerond@gmail.com', senha: 'Borderless02$$', nota: '' }],
      fotos: [],
      diasUteis: 5,
      statusDeploy: 'nunca_implantado',
      avisoDeployObrigatorio: false,
      avisoVideoEEnv: false,
    },
    {
      id: 'p2',
      numero: '557',
      cliente: 'Ari',
      contextoMacro: 'Jornal',
      diasBonus: 0,
      ativo: true,
      checklistHistorico: { [today]: true },
      ultimoDeploy: '2026-09-12T18:00:00.000Z',
      ultimoChecklistFeitoEm: '2026-09-13T10:00:00.000Z',
      deploys: [{ em: '2026-09-12T18:00:00.000Z', data: '2026-09-12' }],
      estimativa: { feita: false, nota: '' },
      video: { feito: false, nota: '' },
      contexto: 'Preciso da chave API OpenAI',
      lembreteProximoDia: '',
      env: { backendUrl: '', frontendUrl: '', gatewayPagamento: '', chavesApi: [], envRaw: '' },
      credenciais: [{ titulo: 'Admin', login: 'fanclubearidorneles@gmail.com', senha: 'brleilao2530', nota: 'convite enviado' }],
      fotos: [],
      diasUteis: 5,
      statusDeploy: 'pendente',
      avisoDeployObrigatorio: false,
      avisoVideoEEnv: false,
    },
    {
      id: 'p3',
      numero: '561',
      cliente: 'Francinaldo',
      contextoMacro: 'Reconhece Campo',
      diasBonus: 0,
      ativo: true,
      checklistHistorico: {},
      ultimoDeploy: null,
      ultimoChecklistFeitoEm: null,
      deploys: [],
      estimativa: { feita: false, nota: '' },
      video: { feito: false, nota: '' },
      contexto: 'Precisa fornecer créditos para a chave OpenAI\nAINDA NAO TROQUEI O BD',
      lembreteProximoDia: '',
      env: { backendUrl: '', frontendUrl: '', gatewayPagamento: '', chavesApi: [], envRaw: '' },
      credenciais: [{ titulo: 'Admin', login: 'francinaldosilvatst@gmail.com', senha: 'Nawdo@1986', nota: '' }],
      fotos: [],
      diasUteis: 6,
      statusDeploy: 'nunca_implantado',
      avisoDeployObrigatorio: true,
      avisoVideoEEnv: false,
    },
    {
      id: 'p4',
      numero: '563',
      cliente: 'João Paulo',
      contextoMacro: 'Floricultura',
      diasBonus: 0,
      ativo: true,
      checklistHistorico: { [today]: true },
      ultimoDeploy: '2026-09-13T15:00:00.000Z',
      ultimoChecklistFeitoEm: '2026-09-13T14:00:00.000Z',
      deploys: [{ em: '2026-09-13T15:00:00.000Z', data: '2026-09-13' }],
      estimativa: { feita: true, nota: '' },
      video: { feito: false, nota: '' },
      contexto: 'Entregas: mach1\nPLANO BLAZE',
      lembreteProximoDia: '',
      env: { backendUrl: '', frontendUrl: '', gatewayPagamento: 'mercado pago', chavesApi: [], envRaw: '' },
      credenciais: [{ titulo: 'Admin', login: 'floriculturachuvadeouro01@gmail.com', senha: '75040040Jp@', nota: 'enviado para o cliente' }],
      fotos: [],
      diasUteis: 7,
      statusDeploy: 'atualizado',
      avisoDeployObrigatorio: true,
      avisoVideoEEnv: true,
    },
    {
      id: 'p5',
      numero: '567',
      cliente: 'Heloiso',
      contextoMacro: 'Investimento',
      diasBonus: 0,
      ativo: true,
      checklistHistorico: {},
      ultimoDeploy: null,
      ultimoChecklistFeitoEm: null,
      deploys: [],
      estimativa: { feita: false, nota: '' },
      video: { feito: false, nota: '' },
      contexto: '',
      lembreteProximoDia: '',
      env: { backendUrl: '', frontendUrl: '', gatewayPagamento: '', chavesApi: [], envRaw: '' },
      credenciais: [],
      fotos: [],
      diasUteis: 3,
      statusDeploy: 'nunca_implantado',
      avisoDeployObrigatorio: false,
      avisoVideoEEnv: false,
    },
  ];

  function findProject(id) {
    return projects.find((project) => project.id === id);
  }

  function refreshDeployStatus(project) {
    if (!project.ultimoDeploy) project.statusDeploy = 'nunca_implantado';
    else if (project.ultimoChecklistFeitoEm && project.ultimoChecklistFeitoEm > project.ultimoDeploy) {
      project.statusDeploy = 'pendente';
    } else {
      project.statusDeploy = 'atualizado';
    }
  }

  return {
    getFila: async () => fila,
    previewFila: async (dataInicio) => ({
      dataInicio,
      dataFim: dataInicio,
      startIsBusinessDay: true,
      firstBusinessDay: dataInicio,
    }),
    setFila: async (payload) => {
      fila = { dataInicio: payload.dataInicio, dataFim: payload.dataFim || payload.dataInicio };
      return fila;
    },
    getAllProjects: async () => projects.map((project) => withView(project)),
    getProject: async (id) => withView(findProject(id)),
    addProject: async (payload) => {
      const project = {
        id: `p${projects.length + 1}`,
        ...payload,
        diasBonus: 0,
        ativo: true,
        checklistHistorico: {},
        ultimoDeploy: null,
        ultimoChecklistFeitoEm: null,
        deploys: [],
        estimativa: { feita: false, nota: '' },
        video: { feito: false, nota: '' },
        contexto: '',
        lembreteProximoDia: '',
        env: { backendUrl: '', frontendUrl: '', gatewayPagamento: '', chavesApi: [], envRaw: '' },
        credenciais: [],
        fotos: [],
        diasUteis: 1,
        statusDeploy: 'nunca_implantado',
        avisoDeployObrigatorio: false,
        avisoVideoEEnv: false,
      };
      projects.push(project);
      return withView(project);
    },
    updateProject: async (id, patch) => {
      const project = findProject(id);
      Object.assign(project, patch);
      return withView(project);
    },
    toggleVideoToday: async (id, done) => {
      const project = findProject(id);
      project.videoHistorico = { ...(project.videoHistorico || {}), [today]: done };
      const previous = project.video || { feito: false, nota: '' };
      project.video = {
        ...previous,
        feito: done || Object.values(project.videoHistorico).some(Boolean),
        feitoEm: done ? today : (previous.feitoEm && previous.feitoEm !== today ? previous.feitoEm : null),
      };
      return withView(project);
    },
    toggleChecklistToday: async (id, done) => {
      const project = findProject(id);
      project.checklistHistorico = { ...project.checklistHistorico, [today]: done };
      if (done) project.ultimoChecklistFeitoEm = new Date().toISOString();
      refreshDeployStatus(project);
      return withView(project);
    },
    markDeployDone: async (id) => {
      const project = findProject(id);
      const em = new Date().toISOString();
      project.ultimoDeploy = em;
      project.deploys = [...(project.deploys || []), { em, data: today }];
      refreshDeployStatus(project);
      return withView(project);
    },
    setDeployToday: async (id, done) => {
      const project = findProject(id);
      project.deploys = (project.deploys || []).filter((entry) => entry.data !== today);
      if (done) {
        const em = new Date().toISOString();
        project.deploys = [...project.deploys, { em, data: today }];
        project.ultimoDeploy = em;
      } else {
        const last = project.deploys[project.deploys.length - 1] || null;
        project.ultimoDeploy = last ? last.em : null;
      }
      refreshDeployStatus(project);
      return withView(project);
    },
    clearDeploy: async (id) => {
      const project = findProject(id);
      project.deploys = (project.deploys || []).slice(0, -1);
      const last = project.deploys[project.deploys.length - 1] || null;
      project.ultimoDeploy = last ? last.em : null;
      refreshDeployStatus(project);
      return withView(project);
    },
    addFoto: async () => {},
    addFotoBytes: async () => {},
    removeFoto: async () => {},
    getBaseDir: async () => '',
  };
}
