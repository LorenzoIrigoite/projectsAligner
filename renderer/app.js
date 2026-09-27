const state = { projects: [], fila: null, filaAtual: null, agenda: [] };
const stateHistory = { queueList: [] };

if (typeof window.api === 'undefined') {
  window.api = createBrowserPreviewApi();
}

async function loadProjects() {
  state.filaAtual = await window.api.getFila();
  if (!state.fila) state.fila = state.filaAtual;
  state.projects = await window.api.getAllProjects(state.fila);
  state.agenda = window.api.getAgendaMeetings ? await window.api.getAgendaMeetings() : [];
  renderBoard();
}

async function loadSavedQueues() {
  stateHistory.queueList = window.api.getSavedQueues ? await window.api.getSavedQueues() : [];
  renderHistoryGrid();
}

function showCurrentQueueView() {
  state.fila = state.filaAtual;
  document.getElementById('view-history').classList.add('hidden');
  document.getElementById('view-macro').classList.remove('hidden');
  document.getElementById('btn-back-to-current-queue').classList.add('hidden');
}

function showHistoryView() {
  document.getElementById('view-macro').classList.add('hidden');
  document.getElementById('view-history').classList.remove('hidden');
  document.getElementById('btn-back-to-current-queue').classList.remove('hidden');
}

function isProjectInCurrentQueue(project, fila) {
  if (project.semFila) return false;
  if (!fila) return !!project.ativo;
  if (!project.ativo) return false;
  if (!project.dataEntradaFila) return true;
  return project.dataEntradaFila >= fila.dataInicio && project.dataEntradaFila <= fila.dataFim;
}

function sortQueueProjects(projects) {
  return [...projects].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a.ordemFila)) ? Number(a.ordemFila) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b.ordemFila)) ? Number(b.ordemFila) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aNum = Number(String(a.numero).trim()) || Number.MAX_SAFE_INTEGER;
    const bNum = Number(String(b.numero).trim()) || Number.MAX_SAFE_INTEGER;
    if (aNum !== bNum) return aNum - bNum;
    return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR', { sensitivity: 'base' });
  });
}

function renderBoard() {
  const hasFila = Boolean(state.filaAtual);
  const viewingCurrent = state.fila && state.filaAtual && state.fila.dataInicio === state.filaAtual.dataInicio;
  document.getElementById('fila-setup').classList.toggle('hidden', hasFila);
  const historyVisible = !document.getElementById('view-history').classList.contains('hidden');
  document.getElementById('view-macro').classList.toggle('hidden', !hasFila || historyVisible);
  document.getElementById('view-history').classList.toggle('hidden', !historyVisible);
  document.getElementById('btn-add-project').classList.toggle('hidden', !hasFila || !viewingCurrent);
  document.getElementById('btn-edit-fila').classList.toggle('hidden', !hasFila || !viewingCurrent);
  document.getElementById('btn-history-queues').classList.toggle('hidden', !hasFila);
  document.getElementById('btn-new-meeting').classList.toggle('hidden', !hasFila);
  document.getElementById('btn-back-to-current-queue').classList.toggle('hidden', viewingCurrent);

  if (!hasFila) {
    document.getElementById('fila-title').textContent = 'Abrir a fila';
    document.getElementById('fila-period').textContent = 'O período é da fila, não de cada projeto.';
    document.getElementById('week-track').classList.add('hidden');
    renderSidebar();
    updateScrollFadeState();
    return;
  }

  const active = sortQueueProjects(state.projects.filter((project) => isProjectInCurrentQueue(project, state.fila)));
  document.getElementById('fila-title').textContent = viewingCurrent ? 'Fila da semana' : 'Fila salva';
  document.getElementById('fila-period').textContent =
    `${formatDay(state.fila.dataInicio)} – ${formatDay(state.fila.dataFim)} · ${active.length} de 8`;
  renderWeekTrack(active);
  renderAgendaPanel();
  renderMacroGrid();
  renderHistoryGrid();
  renderSidebar();
  updateScrollFadeState();
}

function meetingMotivoLabel(value) {
  if (value === 'primeiro_meet') return 'Primeiro meet';
  if (value === 'recompra') return 'Recompra';
  return 'Alinhamento';
}

function renderAgendaPanel() {
  const panel = document.getElementById('agenda-panel');
  if (!panel) return;
  const agenda = state.agenda || [];
  const today = localDateStr();
  panel.innerHTML = `
    <div class="agenda-head">
      <div>
        <p class="panel-title">Meetings de hoje</p>
        <p class="panel-sub">${agenda.length ? `${agenda.length} compromisso(s)` : 'Nenhum meeting agendado para hoje'}</p>
      </div>
    </div>
    <div class="agenda-list">
      ${agenda.length ? agenda.map((meeting) => `
        <div class="agenda-item${meeting.feito ? ' is-done' : ''}" data-project-id="${escapeHtml(meeting.projectId || '')}">
          <time datetime="${escapeHtml(`${today}T${meeting.hora || '00:00'}`)}">${escapeHtml(meeting.hora || '--:--')}</time>
          <span class="agenda-copy">
            <strong>${escapeHtml(meeting.numero)} · ${escapeHtml(meeting.cliente)}</strong>
            <span>${escapeHtml(meetingMotivoLabel(meeting.motivo))}${meeting.contexto ? ` · ${escapeHtml(meeting.contexto)}` : ''}</span>
          </span>
          <span class="agenda-actions">
            <button type="button" data-meeting-done="${escapeHtml(meeting.id)}">${meeting.feito ? 'Reabrir' : 'Feito'}</button>
            <button type="button" data-meeting-remove="${escapeHtml(meeting.id)}">Remover</button>
          </span>
        </div>
      `).join('') : '<p class="agenda-empty">Use + Meeting no projeto para montar sua agenda.</p>'}
    </div>
  `;
  panel.querySelectorAll('.agenda-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      if (item.dataset.projectId) openDetail(item.dataset.projectId);
    });
  });
  panel.querySelectorAll('[data-meeting-done]').forEach((button) => {
    button.addEventListener('click', async () => {
      const meeting = state.agenda.find((item) => item.id === button.dataset.meetingDone);
      await window.api.setMeetingDone(button.dataset.meetingDone, !meeting?.feito);
      await loadProjects();
    });
  });
  panel.querySelectorAll('[data-meeting-remove]').forEach((button) => {
    button.addEventListener('click', async () => {
      await window.api.removeMeeting(button.dataset.meetingRemove);
      await loadProjects();
    });
  });
}

function updateScrollFadeState() {
  const sidebar = document.querySelector('.sidebar-body');
  sidebar?.classList.toggle('has-overflow', sidebar.scrollHeight > sidebar.clientHeight + 8);

  const detailModal = document.querySelector('.detail-modal');
  if (detailModal) {
    detailModal.classList.toggle('has-overflow', detailModal.scrollHeight > detailModal.clientHeight + 8);
  }
}

window.addEventListener('resize', updateScrollFadeState);

async function loadHistoryQueues() {
  stateHistory.queueList = window.api.getSavedQueues ? await window.api.getSavedQueues() : [];
  renderHistoryGrid();
}

async function renderHistoryGrid() {
  const historyGrid = document.getElementById('history-grid');
  const queues = stateHistory.queueList || [];
  historyGrid.innerHTML = '';

  if (queues.length === 0) {
    historyGrid.innerHTML = '<p class="empty-state">Ainda não há filas salvas.</p>';
    return;
  }

  for (const queue of queues) {
    const queueProjects = window.api.getAllProjects ? await window.api.getAllProjects(queue) : state.projects;
    const pending = queueProjects.filter((project) => {
      const inQueue = project.ativo && project.dataEntradaFila && project.dataEntradaFila >= queue.dataInicio && project.dataEntradaFila <= queue.dataFim;
      if (!inQueue) return false;
      const today = localDateStr();
      const day = (project.semana || []).find((item) => item.date === today);
      return !!day && day.status === 'current';
    });

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-card-head">
        <strong>${formatDay(queue.dataInicio)} – ${formatDay(queue.dataFim)}</strong>
        ${pending.length ? `<span class="history-pending">${escapeHtml(pending.map((project) => `${project.numero} ${project.cliente}`).join(' · '))}</span>` : '<span class="history-clear">Sem pendência</span>'}
      </div>
      <span class="history-meta">${pending.length ? `${pending.length} pendência(s)` : 'Fila em dia'}</span>
    `;
    card.addEventListener('click', async () => {
      const nextFila = { dataInicio: queue.dataInicio, dataFim: queue.dataFim, dias: queue.dias || [] };
      state.fila = nextFila;
      document.getElementById('view-history').classList.add('hidden');
      document.getElementById('view-macro').classList.remove('hidden');
      await loadProjects();
    });
    historyGrid.appendChild(card);
  }
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

function plataformaLabel(value) {
  if (value === 'app') return 'APP';
  if (value === 'app_web') return 'APP/WEB';
  return 'WEB';
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
      <div class="id-col">
        <span class="id-label">Plataforma</span>
        <span class="id-value id-platform">${escapeHtml(plataformaLabel(project.plataforma))}</span>
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
  const dayNumber = (state.fila?.dias || []).indexOf(dateStr) + 1;
  title.textContent = `Dia ${dayNumber} · ${formatDay(dateStr)}`;
  renderDayReview(dateStr, active);
  dialog.showModal();
}

function renderDayReview(dateStr, active) {
  const body = document.getElementById('day-review-body');
  const dialog = document.getElementById('dialog-day-review');
  const dayNumber = (state.fila?.dias || []).indexOf(dateStr) + 1;
  const closed = dateStr < localDateStr();

  const rows = (active || []).map((project) => {
    const day = (project.semana || []).find((item) => item.date === dateStr);
    const faltas = day?.faltas || [];
    return { project, faltas, status: day?.status || 'future' };
  }).filter((row) => row.faltas.length > 0);

  if (rows.length === 0) {
    body.innerHTML = `<p class="hint">${closed ? 'Esse dia fechou sem pendência.' : 'Nada obrigatório em aberto hoje.'}</p>`;
  } else {
    body.innerHTML = `
      <p class="hint">${closed ? 'Ficou pendente quando o dia virou.' : 'Marque o que foi resolvido neste projeto.'}</p>
      <ul class="day-review-list">
        ${rows.map((row) => `
          <li>
            <strong>${escapeHtml(row.project.numero)} ${escapeHtml(row.project.cliente)}</strong>
            <div class="day-review-tasks">
              ${row.faltas.map((item) => `
                <label class="day-review-task">
                  <input type="checkbox" data-project-id="${escapeHtml(row.project.id)}" data-task="${escapeHtml(item)}" />
                  <span>${escapeHtml(item)}</span>
                </label>
              `).join('')}
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  body.querySelectorAll('.day-review-task input').forEach((input) => {
    input.addEventListener('change', async () => {
      input.disabled = true;
      await window.api.setTaskOnDate(input.dataset.projectId, dateStr, input.dataset.task, input.checked);
      await loadProjects();
      const nextActive = sortQueueProjects(state.projects.filter((project) => isProjectInCurrentQueue(project, state.fila)));
      renderDayReview(dateStr, nextActive);
    });
  });
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
  if (project.env?.gatewayPagamento) lines.push(`GATEWAY: ${project.env.gatewayPagamento}`);
  const contexto = String(project.contexto || '').trim();
  if (contexto) contexto.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => lines.push(line));
  return lines.slice(0, 2);
}

function requiredLabels(project, today) {
  const day = (project.semana || []).find((item) => item.date === today);
  if (!day || day.status === 'future') return [];
  if (day.dayNumber === 7) return ['Checklist', 'Deploy', 'Vídeo'];
  if (day.dayNumber === 6) return ['Checklist', 'Estimativa', 'Deploy'];
  return ['Checklist'];
}

function hasDeployToday(project, today) {
  return (project.deploys || []).some((entry) => entry.data === today);
}

function hasVideoToday(project, today) {
  if (project.videoHistorico && Object.prototype.hasOwnProperty.call(project.videoHistorico, today)) return !!project.videoHistorico[today];
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
  const videoDone = hasVideoToday(project, today);
  const estimativaDone = !!project.estimativa?.feita;
  const dayDone = (project.semana || []).some((day) => day.date === today && day.status === 'done');
  {
  // Pendente = card aberto. Concluído no dia = card menor.
  const visibleMarks = dayDone
    ? [checklistDone ? 'Checklist' : null, estimativaDone ? 'Estimativa' : null, deployToday ? 'Deploy' : null, videoDone ? 'Vídeo' : null].filter(Boolean)
    : ['Checklist', 'Estimativa', 'Deploy', 'Vídeo'];
  }
  const visibleMarks = [...required];
  const markup = {
    Checklist: `<label class="${markClass('Checklist')}"><input type="checkbox" class="chk-checklist" ${checklistDone ? 'checked' : ''} /><span class="mark-box" aria-hidden="true"></span>Checklist</label>`,
    Estimativa: `<label class="mark"><input type="checkbox" class="chk-estimativa" ${estimativaDone ? 'checked' : ''} /><span class="mark-box" aria-hidden="true"></span>Estimativa</label>`,
    Deploy: `<label class="${markClass('Deploy')}"><input type="checkbox" class="chk-deploy" ${deployToday ? 'checked' : ''} /><span class="mark-box" aria-hidden="true"></span>Deploy</label>`,
    Vídeo: `<label class="${markClass('Vídeo')}"><input type="checkbox" class="chk-video" ${videoDone ? 'checked' : ''} /><span class="mark-box" aria-hidden="true"></span>Vídeo</label>`,
  };
  const caption = !dayDone && required.size
    ? `<p class="card-required">Hoje: ${escapeHtml([...required].join(', '))}</p>`
    : '';
  return `<div class="card-marks">${visibleMarks.map((name, index) => `${index ? '<span class="mark-sep" aria-hidden="true">|</span>' : ''}${markup[name]}`).join('')}</div>${caption}`;
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
  const active = sortQueueProjects(state.projects.filter((project) => isProjectInCurrentQueue(project, state.fila)));

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
    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.setAttribute('aria-label', `Abrir ${project.numero} ${project.cliente}`);

    const dragHandle = '<button type="button" class="drag-handle" aria-label="Mover projeto" draggable="false">⋮⋮</button>';

    const login = todayDone ? '' : loginMarkup(project);
    const notes = todayDone ? [] : noteLines(project);

    card.innerHTML = `
      <div class="project-card-header">
        ${dragHandle}
      </div>
      <div class="card-main">
        ${identityMarkup(project)}
        ${marksMarkup(project, today)}
        ${doneLabel}
        ${login}
        ${notes.length ? `<div class="card-notes">${notes.map((line) => `<p class="card-note">${escapeHtml(line)}</p>`).join('')}</div>` : ''}
      </div>
    `;

    const open = () => openDetail(project.id);
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', project.id);
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      card.classList.add('is-drop-target');
    });
    card.addEventListener('dragleave', () => card.classList.remove('is-drop-target'));
    card.addEventListener('drop', async (event) => {
      event.preventDefault();
      card.classList.remove('is-drop-target');
      const draggedId = event.dataTransfer.getData('text/plain');
      const currentIds = active.map((item) => item.id);
      const fromIndex = currentIds.indexOf(draggedId);
      const toIndex = currentIds.indexOf(project.id);
      if (draggedId && fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
        const reordered = [...currentIds];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        await window.api.reorderQueueProjects(reordered, state.fila);
        await loadProjects();
      }
    });
    card.addEventListener('click', (event) => {
      if (event.target.closest('.card-marks, input, label, button, a, .drag-handle')) return;
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

    card.querySelector('.chk-checklist')?.addEventListener('change', (event) => {
      saveMark(() => window.api.toggleChecklistToday(project.id, event.target.checked));
    });

    card.querySelector('.chk-estimativa')?.addEventListener('change', (event) => {
      const work = event.target.checked
        ? window.api.markEstimativaDone(project.id)
        : window.api.clearEstimativa(project.id);
      saveMark(() => work);
    });

    card.querySelector('.chk-video')?.addEventListener('change', (event) => {
      const work = event.target.checked
        ? (window.api.markVideoDone ? window.api.markVideoDone(project.id) : window.api.toggleVideoToday(project.id, true))
        : (window.api.clearVideo ? window.api.clearVideo(project.id) : window.api.toggleVideoToday(project.id, false));
      saveMark(() => work);
    });

    card.querySelector('.chk-deploy')?.addEventListener('change', (event) => {
      saveMark(() => window.api.setDeployToday(project.id, event.target.checked));
    });

    grid.appendChild(card);
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
  const groupOrder = { current: 0, scheduled: 1, unassigned: 2, inactive: 3 };
  const queueGroup = (project) => {
    if (isProjectInCurrentQueue(project, state.fila)) return 'current';
    if (project.semFila) return 'unassigned';
    if (!project.ativo) return 'inactive';
    return 'scheduled';
  };
  const projects = [...state.projects].sort((a, b) => {
    const aGroup = queueGroup(a);
    const bGroup = queueGroup(b);
    if (groupOrder[aGroup] !== groupOrder[bGroup]) return groupOrder[aGroup] - groupOrder[bGroup];
    const aNum = Number(String(a.numero).trim()) || Number.MAX_SAFE_INTEGER;
    const bNum = Number(String(b.numero).trim()) || Number.MAX_SAFE_INTEGER;
    if (aNum !== bNum) return aNum - bNum;
    return `${a.cliente} ${a.numero}`.localeCompare(`${b.cliente} ${b.numero}`, 'pt-BR', { sensitivity: 'base' });
  });
  const visible = projects.filter((project) => matchesSearch(project, query));
  list.innerHTML = '';

  if (visible.length === 0) {
    list.innerHTML = '<p class="sidebar-empty">Nenhum projeto</p>';
    return;
  }

  let previousGroup = null;
  visible.forEach((project) => {
    const group = queueGroup(project);
    if (group !== previousGroup) {
      const heading = document.createElement('p');
      heading.className = 'sidebar-group-label';
      heading.textContent = {
        current: 'Fila atual',
        scheduled: 'Outras filas',
        unassigned: 'Sem fila',
        inactive: 'Concluídos',
      }[group];
      list.appendChild(heading);
      previousGroup = group;
    }
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

function renderAddProjectDestinations() {
  const select = document.getElementById('add-project-destination');
  const currentValue = select.value;
  select.querySelectorAll('[data-saved-queue]').forEach((option) => option.remove());
  (stateHistory.queueList || [])
    .filter((queue) => queue.dataInicio !== state.filaAtual?.dataInicio)
    .forEach((queue) => {
      const option = document.createElement('option');
      option.value = `queue:${queue.dataInicio}`;
      option.dataset.savedQueue = 'true';
      option.textContent = `Fila de ${formatDay(queue.dataInicio)} a ${formatDay(queue.dataFim)}`;
      select.insertBefore(option, select.querySelector('option[value="new"]'));
    });
  select.value = select.querySelector(`option[value="${CSS.escape(currentValue)}"]`) ? currentValue : 'current';
  updateAddProjectDestinationUi();
}

function updateAddProjectDestinationUi() {
  const select = document.getElementById('add-project-destination');
  const dateField = document.getElementById('new-queue-date-field');
  const hint = document.getElementById('add-project-destination-hint');
  const isNew = select.value === 'new';
  dateField.classList.toggle('hidden', !isNew);
  dateField.querySelector('input').required = isNew;
  hint.textContent = select.value === 'none'
    ? 'O projeto ficará salvo somente na sidebar até você escolher uma fila.'
    : isNew
      ? 'A nova fila será criada sem trocar a fila atual.'
      : select.value.startsWith('queue:')
        ? 'O projeto será associado à fila salva escolhida.'
        : 'A data da fila atual será usada automaticamente.';
}

document.getElementById('add-project-destination').addEventListener('change', updateAddProjectDestinationUi);

document.getElementById('btn-add-project').addEventListener('click', async () => {
  await loadSavedQueues();
  renderAddProjectDestinations();
  document.getElementById('dialog-add-project').showModal();
});

document.getElementById('btn-history-queues').addEventListener('click', async () => {
  await loadHistoryQueues();
  showHistoryView();
});

document.getElementById('btn-new-meeting').addEventListener('click', () => {
  currentProjectId = null;
  openMeetingDialog(null);
});

document.getElementById('btn-back-to-current-queue').addEventListener('click', async () => {
  state.fila = state.filaAtual;
  showCurrentQueueView();
  await loadProjects();
});

document.getElementById('btn-open-current-queue').addEventListener('click', async () => {
  state.fila = state.filaAtual;
  showCurrentQueueView();
  await loadProjects();
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
    const destinoFila = formData.get('destinoFila');
    let dataEntradaFila;
    let semFila = false;
    if (destinoFila === 'none') {
      semFila = true;
    } else if (destinoFila === 'new') {
      const created = await window.api.createFila({ dataInicio: formData.get('novaFilaDataInicio') });
      dataEntradaFila = created.dataInicio;
    } else if (String(destinoFila).startsWith('queue:')) {
      dataEntradaFila = String(destinoFila).slice('queue:'.length);
    }
    await window.api.addProject({
      numero: formData.get('numero'),
      cliente: formData.get('cliente'),
      contextoMacro: formData.get('contextoMacro'),
      plataforma: formData.get('plataforma'),
      dataEntradaFila,
      semFila,
      ativo: true,
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
  loadHistoryQueues();
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
  state.fila = null;
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
  form.dataInicio.value = state.filaAtual.dataInicio;
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
    getSavedQueues: async () => [],
    createFila: async ({ dataInicio }) => {
      const created = { dataInicio, dataFim: dataInicio };
      return created;
    },
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
        semFila: Boolean(payload.semFila),
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
    reorderQueueProjects: async (orderIds) => {
      const positions = new Map(orderIds.map((id, index) => [id, index]));
      projects.sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      return projects.map(withView);
    },
    getAgendaMeetings: async () => projects.flatMap((project) => (project.meetings || []).map((meeting) => ({
      ...meeting,
      numero: project.numero,
      cliente: project.cliente,
      contextoMacro: project.contextoMacro,
    }))).filter((meeting) => meeting.data === today).sort((a, b) => String(a.hora).localeCompare(String(b.hora))),
    scheduleMeeting: async (id, payload) => {
      const project = findProject(id);
      const meeting = { id: `m${Date.now()}`, projectId: id, ...payload, feito: false };
      if (project) project.meetings = [...(project.meetings || []), meeting];
      return meeting;
    },
    setMeetingDone: async (meetingId, done) => {
      projects.forEach((project) => {
        project.meetings = (project.meetings || []).map((meeting) => (
          meeting.id === meetingId ? { ...meeting, feito: done } : meeting
        ));
      });
    },
    removeMeeting: async (meetingId) => {
      projects.forEach((project) => {
        project.meetings = (project.meetings || []).filter((meeting) => meeting.id !== meetingId);
      });
    },
    removeProject: async (id) => {
      projects = projects.filter((project) => project.id !== id);
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
