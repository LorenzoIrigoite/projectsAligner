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
