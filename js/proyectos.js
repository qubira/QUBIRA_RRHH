// Proyecto — RR. HH. solicita proyectos de mejora de herramientas a ADG.
// Reutiliza el mismo backend que ya usan TI y ADG (API/src/routes/ti.js,
// schema ti.projects) a través de Store.getProjects/createProject/etc.
// (js/storage.js), que llaman directo a /api/ti/* con el mismo patrón ya
// usado acá para calendario/auditoría. No hay router propio en este panel:
// la navegación entre lista y detalle se maneja con estado de módulo.

import { Store } from './storage.js';
import { openModal, closeModal, toast } from './ui.js';
import { formatDate, formatDateTime, icon, escapeHtml as esc } from './utils.js';

const MY_AREA = 'RRHH';

let _view = 'list';
let _detailId = null;
let _tab = 'overview';

let _projects = [], _families = [], _users = [], _docTypes = [];
let _filter = { status: '', search: '', family: '' };
let _groupByFamily = false;

let _reqs = [], _reqProjectId = null;
let _editingReqId = null;

let _project, _contracts = [], _documents = [], _messages = [], _emails = [],
    _activities = [], _requirements = [], _scrumRoles = [], _scrumUsers = [],
    _technologies = [], _techCatalog = { language: [], tool: [] };
let _pendingTechImage = { language: null, tool: null };
let _pendingCatalogMatch = { language: null, tool: null };

let _meetings = [], _meetingPool = [], _meetingFormOpen = false, _editingMeetingId = null;
let _meetingConflicts = [], _meetingSelectedParticipants = [], _meetingCheckToken = 0;
let _meetingParticipantInfo = new Map();
let _meetingExternalParticipants = [];
let _meetingDirResults = [], _meetingDirDebounce;

const SCRUM_ROLES = [['product_owner', 'Product Owner'], ['scrum_master', 'Scrum Master'], ['developer', 'Equipo de Desarrollo']];
const MEETING_ROLE_LABEL = { ...Object.fromEntries(SCRUM_ROLES), responsible: 'Responsable' };
const MEETING_TYPES = ['Coordinación administrativa', 'Reunión con cliente', 'Reunión con proveedor', 'Planificación', 'Revisión', 'Otro'];
const EXTERNAL_KINDS = [['cliente', 'Cliente'], ['postulante', 'Postulante'], ['proveedor', 'Proveedor'], ['consultor', 'Consultor'], ['otro', 'Otro']];

const STATUS_META = {
  pending_approval: { label: 'Por aprobar', cls: 'badge-amber' },
  observed: { label: 'Observado', cls: 'badge-red' },
  pending: { label: 'Pendiente (sin reclamar)', cls: 'badge-gray' },
  active: { label: 'Activo', cls: 'badge-green' },
  paused: { label: 'Pausado', cls: 'badge-amber' },
  finished_by_ti: { label: 'Finalizado (por revisar)', cls: 'badge-amber' },
  completed: { label: 'Completado', cls: 'badge-green' },
  cancelled: { label: 'Cancelado', cls: 'badge-gray' },
  archived: { label: 'Archivado', cls: 'badge-gray' },
};
const PRIORITY_META = {
  low: { label: 'Baja', cls: 'badge-gray' },
  medium: { label: 'Media', cls: 'badge-amber' },
  high: { label: 'Alta', cls: 'badge-red' },
  urgent: { label: 'Urgente', cls: 'badge-red' },
};
const DOC_TYPE_LABEL = { dni: 'DNI', ce: 'CE', pasaporte: 'Pasaporte', ruc: 'RUC' };
const PROJECT_TYPE_LABEL = { web: 'Web', mobile: 'Aplicativo Móvil', desktop: 'Aplicativo de Escritorio' };
const DOC_TYPES = [['dni', 'DNI'], ['ce', 'CE'], ['pasaporte', 'Pasaporte'], ['ruc', 'RUC']];
const CURRENCIES = [['USD', 'USD - Dólares'], ['EUR', 'EUR - Euros'], ['JPY', 'JPY - Yenes'], ['PEN', 'PEN - Soles']];
const PROJECT_TYPES = [['web', 'Web'], ['mobile', 'Aplicativo Móvil'], ['desktop', 'Aplicativo de Escritorio']];

/* Un solo listener delegado (no uno por render) para cerrar los
   desplegables propios (familia / tecnología) al hacer clic fuera. */
document.addEventListener('click', e => {
  document.querySelectorAll('.pj-combo-dropdown:not(.hidden)').forEach(dd => {
    if (!dd.closest('[data-combo-wrap]')?.contains(e.target)) dd.classList.add('hidden');
  });
});

export function renderProyectos() {
  _view = 'list';
  _detailId = null;
  renderRoot();
}

function renderRoot() {
  const container = document.getElementById('view-proyectos');
  if (!container) return;
  if (_view === 'detail' && _detailId) {
    container.innerHTML = spinner();
    loadDetail();
  } else {
    container.innerHTML = spinner();
    loadList();
  }
}

function spinner() {
  return '<div style="display:flex;justify-content:center;padding:60px 0"><div style="width:28px;height:28px;border:3px solid var(--primary-light);border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
}

/* ============================================================
   Lista
   ============================================================ */
function loadList() {
  Promise.all([
    Store.getProjects(_filter),
    Store.getProjectFamilies().catch(() => []),
  ]).then(([projects, families]) => {
    _projects = projects;
    _families = families;
    renderListPage();
  }).catch(() => {
    const c = document.getElementById('view-proyectos');
    if (c) c.innerHTML = '<div class="empty-state">' + icon('alert-triangle') + '<p><strong>No se pudo cargar la lista de proyectos.</strong></p></div>';
  });
}

function renderListPage() {
  const c = document.getElementById('view-proyectos');
  if (!c) return;

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar__filters">
        <div class="search-box">
          ${icon('search')}
          <input type="text" id="pj-search" placeholder="Buscar por nombre, cliente o código..." value="${esc(_filter.search)}">
        </div>
        <select id="pj-status-filter">
          <option value="">Todos los estados</option>
          <option value="pending_approval" ${_filter.status === 'pending_approval' ? 'selected' : ''}>Por aprobar</option>
          <option value="observed" ${_filter.status === 'observed' ? 'selected' : ''}>Observados</option>
          <option value="pending" ${_filter.status === 'pending' ? 'selected' : ''}>Pendientes (sin reclamar)</option>
          <option value="active" ${_filter.status === 'active' ? 'selected' : ''}>Activos</option>
          <option value="paused" ${_filter.status === 'paused' ? 'selected' : ''}>Pausados</option>
          <option value="finished_by_ti" ${_filter.status === 'finished_by_ti' ? 'selected' : ''}>Finalizados (por revisar)</option>
          <option value="completed" ${_filter.status === 'completed' ? 'selected' : ''}>Completados</option>
          <option value="cancelled" ${_filter.status === 'cancelled' ? 'selected' : ''}>Cancelados</option>
        </select>
        <select id="pj-family-filter">
          <option value="">Todas las familias</option>
          ${_families.map(f => `<option value="${esc(f.family)}" ${_filter.family === f.family ? 'selected' : ''}>${esc(f.family)} (${f.count})</option>`).join('')}
        </select>
        <button class="btn btn-secondary" id="pj-group-family-btn" style="${_groupByFamily ? 'background:var(--primary-light);color:var(--primary-dark)' : ''}">
          ${icon('layers')} Agrupar por familia
        </button>
        <button class="btn btn-secondary" id="pj-archived-btn" style="${_filter.status === 'archived' ? 'background:var(--gray-bg)' : ''}">
          ${icon('archive')} Archivados
        </button>
      </div>
      <button class="btn btn-primary" id="pj-new-btn">${icon('plus')} Nuevo Proyecto</button>
    </div>
    <div id="pj-list-wrap">${renderProjectsSection()}</div>
  `;

  document.getElementById('pj-new-btn').addEventListener('click', () => openProjectModal());
  document.getElementById('pj-search').addEventListener('input', e => { _filter.search = e.target.value; loadList(); });
  document.getElementById('pj-status-filter').addEventListener('change', e => { _filter.status = e.target.value; loadList(); });
  document.getElementById('pj-family-filter').addEventListener('change', e => { _filter.family = e.target.value; loadList(); });
  document.getElementById('pj-group-family-btn').addEventListener('click', () => { _groupByFamily = !_groupByFamily; renderListPage(); });
  document.getElementById('pj-archived-btn').addEventListener('click', () => {
    _filter.status = _filter.status === 'archived' ? '' : 'archived';
    loadList();
  });

  c.querySelectorAll('.pj-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.pj-edit-btn')) return;
      openDetail(card.dataset.id);
    });
  });
  c.querySelectorAll('.pj-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const p = _projects.find(x => String(x.id) === btn.dataset.id);
      if (p) openProjectModal(p);
    });
  });
  document.getElementById('pj-empty-new')?.addEventListener('click', () => openProjectModal());
}

function renderProjectsSection() {
  if (_projects.length === 0) {
    return `<div class="empty-state">
      ${icon('layers')}
      <p><strong>No hay proyectos todavía</strong></p>
      <p>Creá una solicitud de proyecto para que ADG la revise.</p>
      <button class="btn btn-primary" id="pj-empty-new" style="margin-top:10px">${icon('plus')} Crear solicitud</button>
    </div>`;
  }
  if (!_groupByFamily) return `<div class="pj-grid">${_projects.map(projectCard).join('')}</div>`;

  const groups = new Map(); const noFamily = [];
  for (const p of _projects) {
    if (p.family) { if (!groups.has(p.family)) groups.set(p.family, []); groups.get(p.family).push(p); }
    else noFamily.push(p);
  }
  let html = '';
  for (const fam of [...groups.keys()].sort()) {
    html += `<div style="margin-bottom:22px">
      <h3 style="font-size:12.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:10px;display:flex;align-items:center;gap:6px">
        ${icon('layers')} ${esc(fam)} <span style="font-weight:400;text-transform:none">(${groups.get(fam).length})</span>
      </h3>
      <div class="pj-grid">${groups.get(fam).map(projectCard).join('')}</div>
    </div>`;
  }
  if (noFamily.length) {
    html += `<div><h3 style="font-size:12.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">Sin familia (${noFamily.length})</h3>
      <div class="pj-grid">${noFamily.map(projectCard).join('')}</div></div>`;
  }
  return html;
}

function isOverdue(p) {
  if (!p.end_date || ['completed', 'cancelled', 'archived'].includes(p.status)) return false;
  return p.end_date < new Date().toISOString().slice(0, 10);
}

function observationDaysLeft(p) {
  if (p.status !== 'observed' || !p.observation_deadline) return null;
  return Math.ceil((new Date(p.observation_deadline) - new Date()) / 86400000);
}

function statusBadge(status) {
  const m = STATUS_META[status] || { label: status, cls: 'badge-gray' };
  return `<span class="badge ${m.cls}">${esc(m.label)}</span>`;
}
function priorityBadge(priority) {
  const m = PRIORITY_META[priority] || { label: priority, cls: 'badge-gray' };
  return `<span class="badge ${m.cls}">${esc(m.label)}</span>`;
}

function projectCard(p) {
  const overdue = isOverdue(p);
  const daysLeft = observationDaysLeft(p);
  const canEdit = p.origin_area === MY_AREA && ['pending_approval'].includes(p.status);
  return `
  <div class="pj-card" data-id="${p.id}" style="cursor:pointer;${overdue ? 'border-left:4px solid var(--danger)' : ''}">
    <div class="pj-card__top">
      <div style="display:flex;gap:10px;flex:1;min-width:0">
        <div class="pj-card__logo">
          ${p.company_logo ? `<img src="${esc(p.company_logo)}">` : icon('building')}
        </div>
        <div style="min-width:0">
          <div class="pj-card__code">${esc(p.code)}</div>
          <div class="pj-card__name">${esc(p.name)}</div>
          <div class="pj-card__client">${esc(p.client)}</div>
        </div>
      </div>
      ${canEdit ? `<button class="btn btn-ghost btn-sm pj-edit-btn" data-id="${p.id}" title="Editar">${icon('edit')}</button>` : ''}
    </div>
    <div class="pj-card__badges">
      ${statusBadge(p.status)}
      ${priorityBadge(p.priority)}
      ${overdue ? '<span class="badge badge-red">Vencido</span>' : ''}
      ${daysLeft !== null ? `<span class="pj-icon-badge ${daysLeft <= 3 ? 'badge-red' : 'badge-amber'}">${icon('clock')} ${daysLeft > 0 ? `${daysLeft} día${daysLeft === 1 ? '' : 's'}` : 'Vencido'}</span>` : ''}
    </div>
    ${p.family ? `<div style="margin-bottom:8px"><span class="tag">${icon('layers')} ${esc(p.family)}</span></div>` : ''}
    <div class="pj-card__progress-row"><span>Avance</span><span>${p.progress}%</span></div>
    <div class="pj-progress-track"><div class="pj-progress-fill" style="width:${p.progress}%"></div></div>
    <div class="pj-card__footer">
      <span>${esc(p.responsible_name || 'Sin responsable')}</span>
      <span>${formatDate(p.created_at?.slice(0, 10))}</span>
    </div>
  </div>`;
}

/* ============================================================
   Crear / editar solicitud
   ============================================================ */
function buildDocOpts(current) {
  const fixed = DOC_TYPES.map(([v]) => v);
  const custom = _docTypes.map(d => d.label);
  const opts = DOC_TYPES.concat(_docTypes.map(d => [d.label, d.label]));
  if (current && !fixed.includes(current) && !custom.includes(current)) opts.push([current, current]);
  return opts.map(([v, l]) => `<option value="${esc(v)}" ${current === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

function openProjectModal(editing = null) {
  const title = editing ? 'Editar Solicitud de Proyecto' : 'Nueva Solicitud de Proyecto';
  const f = editing || {
    name: '', client: '', description: '', budget: '', currency: 'USD',
    start_date: '', end_date: '', responsible_id: '', priority: 'medium',
    company_name: '', company_logo: '', id_document_type: 'dni', id_document_number: '',
    project_type: 'web', github_url: '', website_url: '', family: '',
  };

  const userOpts = _users.map(u => `<option value="${u.id}" ${String(f.responsible_id) === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  const docOpts = buildDocOpts(f.id_document_type);
  const currencyOpts = CURRENCIES.map(([v, l]) => `<option value="${v}" ${f.currency === v ? 'selected' : ''}>${l}</option>`).join('');
  const typeOpts = PROJECT_TYPES.map(([v, l]) => `<option value="${v}" ${(f.project_type || 'web') === v ? 'selected' : ''}>${l}</option>`).join('');

  const modal = openModal({
    title,
    size: 'xl',
    bodyHtml: `
    <form id="pj-form">
      <div class="pj-form-cols">
        <div>
          <p class="pj-section-title">Imagen</p>
          <div id="pj-dropzone" class="pj-dropzone">
            <img id="pj-logo-preview" src="${esc(f.company_logo || '')}" class="${f.company_logo ? '' : 'hidden'}">
            <div id="pj-logo-placeholder" class="pj-dropzone__placeholder ${f.company_logo ? 'hidden' : ''}">
              ${icon('image')}
              <span>Click o arrastra una imagen</span>
            </div>
            <input type="file" name="logo_file" id="pj-logo-file" accept="image/*" class="hidden" style="display:none">
          </div>
          <div class="field" style="margin-top:10px">
            <input type="text" id="pj-logo-url" placeholder="o pega una URL de imagen" value="${esc(f.company_logo || '')}">
          </div>
          <div class="field">
            <label>Nombre de la Empresa</label>
            <input name="company_name" value="${esc(f.company_name || '')}" placeholder="Razón social">
          </div>
        </div>

        <div>
          <p class="pj-section-title">Información Básica</p>
          <div class="field">
            <label>Nombre del Proyecto *</label>
            <input name="name" required value="${esc(f.name)}" placeholder="Ej: Mejora del portal de RR. HH.">
          </div>
          <div class="field">
            <label>Cliente *</label>
            <input name="client" required value="${esc(f.client)}" placeholder="Interno - RR. HH.">
          </div>
          <div class="field-row">
            <div class="field">
              <label>Tipo de Documento</label>
              <select name="id_document_type" id="pj-doc-type-select">${docOpts}</select>
            </div>
            <div class="field">
              <label>Número de Documento</label>
              <input name="id_document_number" value="${esc(f.id_document_number || '')}">
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Tipo de Proyecto</label>
              <select name="project_type">${typeOpts}</select>
            </div>
            <div class="field">
              <label>Prioridad</label>
              <select name="priority">
                <option value="low" ${f.priority === 'low' ? 'selected' : ''}>Baja</option>
                <option value="medium" ${f.priority === 'medium' ? 'selected' : ''}>Media</option>
                <option value="high" ${f.priority === 'high' ? 'selected' : ''}>Alta</option>
                <option value="urgent" ${f.priority === 'urgent' ? 'selected' : ''}>Urgente</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Familia de Proyecto</label>
            <div class="pj-combo" data-combo-wrap="family">
              <input id="pj-family-input" autocomplete="off" value="${esc(f.family || '')}" placeholder="Ej: PORTAL-RRHH">
              <div id="pj-family-dropdown" class="pj-combo-dropdown hidden"></div>
            </div>
          </div>

          <p class="pj-section-title" style="margin-top:18px">Enlaces</p>
          <div class="field-row">
            <div class="field"><label>Link de GitHub</label><input type="url" name="github_url" value="${esc(f.github_url || '')}" placeholder="https://github.com/..."></div>
            <div class="field"><label>Link de la Página</label><input type="url" name="website_url" value="${esc(f.website_url || '')}" placeholder="https://..."></div>
          </div>

          <p class="pj-section-title" style="margin-top:18px">Presupuesto y Fechas</p>
          <div class="field-row">
            <div class="field"><label>Presupuesto</label><input type="number" name="budget" min="0" step="0.01" value="${f.budget || ''}"></div>
            <div class="field"><label>Moneda</label><select name="currency">${currencyOpts}</select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Fecha de Inicio</label><input type="date" name="start_date" value="${f.start_date || ''}"></div>
            <div class="field"><label>Fecha de Entrega</label><input type="date" name="end_date" value="${f.end_date || ''}"></div>
          </div>
          <div class="field">
            <label>Responsable sugerido</label>
            <select name="responsible_id"><option value="">Sin asignar</option>${userOpts}</select>
          </div>

          <p class="pj-section-title" style="margin-top:18px">Información Adicional</p>
          <div class="field">
            <label>Descripción</label>
            <textarea name="description" rows="3" placeholder="Para qué se necesita este proyecto...">${esc(f.description)}</textarea>
          </div>
        </div>

        <div>
          <p class="pj-section-title">Requerimientos</p>
          <p style="font-size:11.5px;font-weight:700;color:var(--text-muted);margin-bottom:6px">Funcionales</p>
          <div id="pj-req-list-functional" class="pj-req-list"></div>
          <div class="field">
            <textarea id="pj-req-desc-functional" rows="2" placeholder="Nuevo requerimiento..."></textarea>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
            <button type="button" class="btn btn-secondary btn-sm" id="pj-req-add-functional">${icon('plus')} Agregar</button>
          </div>
          <p style="font-size:11.5px;font-weight:700;color:var(--text-muted);margin-bottom:6px">No Funcionales</p>
          <div id="pj-req-list-nonfunctional" class="pj-req-list"></div>
          <div class="field">
            <textarea id="pj-req-desc-nonfunctional" rows="2" placeholder="Nuevo requerimiento..."></textarea>
          </div>
          <div style="display:flex;justify-content:flex-end">
            <button type="button" class="btn btn-secondary btn-sm" id="pj-req-add-nonfunctional">${icon('plus')} Agregar</button>
          </div>
        </div>
      </div>
    </form>`,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="pj-form-submit">${editing ? 'Guardar Cambios' : 'Enviar Solicitud'}</button>
    `,
  });

  wireDropzone(modal);
  wireFamilyCombo(modal);

  if (editing) { loadModalRequirements(editing.id); } else { _reqProjectId = null; _reqs = []; renderModalRequirements(); }
  document.getElementById('pj-req-add-functional').addEventListener('click', () => addModalRequirement('functional'));
  document.getElementById('pj-req-add-nonfunctional').addEventListener('click', () => addModalRequirement('non_functional'));

  modal.querySelector('#pj-form-submit').addEventListener('click', async () => {
    const form = modal.querySelector('#pj-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    try {
      if (editing) {
        await Store.updateProject(editing.id, fd);
        toast('Solicitud actualizada', 'success');
      } else {
        const created = await Store.createProject(fd);
        for (const r of _reqs) {
          await Store.addProjectRequirement({ project_id: created.id, type: r.type, description: r.description });
        }
        toast('Solicitud enviada a ADG', 'success');
      }
      closeModal();
      loadList();
    } catch (err) { toast(err.message || 'Error', 'error'); }
  });
}

function wireDropzone(modal) {
  const dz = modal.querySelector('#pj-dropzone');
  const fileInput = modal.querySelector('#pj-logo-file');
  const preview = modal.querySelector('#pj-logo-preview');
  const placeholder = modal.querySelector('#pj-logo-placeholder');
  const urlInput = modal.querySelector('#pj-logo-url');

  dz.addEventListener('click', () => fileInput.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer(); dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change'));
  });
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { preview.src = ev.target.result; preview.classList.remove('hidden'); placeholder.classList.add('hidden'); };
    reader.readAsDataURL(file);
  });
  urlInput.addEventListener('input', e => {
    const url = e.target.value.trim();
    if (url) { preview.src = url; preview.classList.remove('hidden'); placeholder.classList.add('hidden'); }
    else { preview.classList.add('hidden'); placeholder.classList.remove('hidden'); }
  });
}

function wireFamilyCombo(modal) {
  const input = modal.querySelector('#pj-family-input');
  const dropdown = modal.querySelector('#pj-family-dropdown');
  if (!input || !dropdown) return;
  const closeDd = () => dropdown.classList.add('hidden');
  const openDd = () => {
    const q = input.value.trim().toLowerCase();
    const options = _families.filter(fm => !q || fm.family.toLowerCase().includes(q)).slice(0, 8);
    if (!options.length) { closeDd(); return; }
    dropdown.innerHTML = options.map(fm => `
      <button type="button" class="pj-combo-option" data-name="${esc(fm.family)}">
        <span>${esc(fm.family)}</span><span class="count">${fm.count}</span>
      </button>`).join('');
    dropdown.querySelectorAll('.pj-combo-option').forEach(opt => {
      opt.addEventListener('click', () => { input.value = opt.dataset.name; closeDd(); });
    });
    dropdown.classList.remove('hidden');
  };
  input.addEventListener('input', openDd);
  input.addEventListener('focus', openDd);
  input.addEventListener('keydown', e => { if (e.key === 'Escape') closeDd(); });
}

async function loadModalRequirements(projectId) {
  _reqProjectId = projectId;
  try { _reqs = await Store.getProjectRequirements(projectId); } catch (_) { _reqs = []; }
  renderModalRequirements();
}

function renderModalRequirements() {
  const cf = document.getElementById('pj-req-list-functional');
  const cn = document.getElementById('pj-req-list-nonfunctional');
  if (!cf || !cn) return;
  const functional = _reqs.filter(r => r.type !== 'non_functional');
  const nonFunctional = _reqs.filter(r => r.type === 'non_functional');
  cf.innerHTML = functional.length ? functional.map(reqRowHtml).join('') : '<p class="pj-req-empty">Sin requerimientos</p>';
  cn.innerHTML = nonFunctional.length ? nonFunctional.map(reqRowHtml).join('') : '<p class="pj-req-empty">Sin requerimientos</p>';
  document.querySelectorAll('.pj-req-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.id;
      if (_reqProjectId) {
        try { await Store.deleteProjectRequirement(key); } catch (err) { toast(err.message || 'Error', 'error'); return; }
      }
      _reqs = _reqs.filter(x => String(x.id ?? x._localId) !== key);
      renderModalRequirements();
    });
  });
}

function reqRowHtml(r) {
  return `<div class="pj-req-row">
    <div class="pj-req-row__text">${esc(r.description || '')}</div>
    <button type="button" class="btn btn-ghost pj-req-del" data-id="${r.id ?? r._localId}">${icon('trash')}</button>
  </div>`;
}

let _localReqSeq = 0;
async function addModalRequirement(type) {
  const input = document.getElementById(type === 'non_functional' ? 'pj-req-desc-nonfunctional' : 'pj-req-desc-functional');
  const description = input.value.trim();
  if (!description) return;
  if (_reqProjectId) {
    try {
      const r = await Store.addProjectRequirement({ project_id: _reqProjectId, type, description });
      _reqs.push({ id: r.id, project_id: _reqProjectId, type, description });
    } catch (err) { toast(err.message || 'Error', 'error'); return; }
  } else {
    _reqs.push({ _localId: `local-${++_localReqSeq}`, type, description });
  }
  input.value = '';
  renderModalRequirements();
}

/* ============================================================
   Detalle del proyecto
   ============================================================ */
function openDetail(id) {
  _view = 'detail';
  _detailId = id;
  _tab = 'overview';
  _editingReqId = null;
  renderRoot();
}

function backToList() {
  _view = 'list';
  _detailId = null;
  renderRoot();
}

function loadDetail() {
  Promise.all([
    Store.getProject(_detailId),
    Store.getProjectContracts(_detailId).catch(() => []),
    Store.getProjectDocuments(_detailId).catch(() => []),
    Store.getProjectWhatsapp(_detailId).catch(() => []),
    Store.getProjectEmails(_detailId).catch(() => []),
    Store.getProjectActivities(_detailId).catch(() => []),
    Store.getProjectRequirements(_detailId).catch(() => []),
  ]).then(([proj, contr, docs, msgs, mails, acts, reqs]) => {
    _project = proj; _contracts = contr; _documents = docs; _messages = msgs;
    _emails = mails; _activities = acts; _requirements = reqs;
    renderDetailPage();
  }).catch(() => { backToList(); });
}

function canEditProject() {
  return _project.origin_area === MY_AREA && ['pending_approval'].includes(_project.status);
}
function canManageRequirements() {
  return _project.origin_area === MY_AREA && ['pending_approval', 'observed'].includes(_project.status);
}

function renderDetailPage() {
  const c = document.getElementById('view-proyectos');
  if (!c) return;
  const p = _project;
  const daysLeft = observationDaysLeft(p);

  c.innerHTML = `
  <div class="pd-header">
    <button class="btn btn-ghost" id="pd-back-btn" style="padding:8px">${icon('arrow-left')}</button>
    <div class="pd-header__logo">${p.company_logo ? `<img src="${esc(p.company_logo)}">` : icon('building')}</div>
    <div class="pd-header__info">
      <div class="pd-header__title-row">
        <h1>${esc(p.name)}</h1>
        ${statusBadge(p.status)}
        ${priorityBadge(p.priority)}
        ${isOverdue(p) ? '<span class="badge badge-red">Vencido</span>' : ''}
        ${daysLeft !== null ? `<span class="pj-icon-badge ${daysLeft <= 3 ? 'badge-red' : 'badge-amber'}">${icon('clock')} ${daysLeft > 0 ? `${daysLeft} día${daysLeft === 1 ? '' : 's'} para subsanar` : 'Plazo vencido'}</span>` : ''}
      </div>
      <p class="pd-header__meta">${esc(p.code)} · ${esc(p.client)}</p>
      ${p.origin_area && p.origin_area !== 'ADG' ? `<p class="pd-header__origin">${icon('corner-up-right')} Enviado por <strong>${esc(p.origin_area)}</strong> · ${esc(p.created_by_name || 'usuario eliminado')}</p>` : ''}
    </div>
    <div class="pd-header__actions">
      <button class="btn btn-secondary" id="pd-export-btn">${icon('external-link')} Exportar PDF</button>
      ${p.website_url ? `<a href="${esc(p.website_url)}" target="_blank" rel="noopener" class="btn btn-secondary">${icon('external-link')} Ver página</a>` : ''}
      ${canEditProject() ? `<button class="btn btn-primary" id="pd-edit-btn">${icon('edit')} Editar</button>` : ''}
    </div>
  </div>

  <div class="card pd-progress-card">
    <div class="pd-progress-row"><span>Avance del proyecto</span><strong>${p.progress}%</strong></div>
    <div class="pd-progress-track"><div class="pd-progress-fill" style="width:${p.progress}%"></div></div>
  </div>

  <div class="pd-tabs" id="pd-tabs">${tabButtonsHtml()}</div>
  <div id="pd-tab-content"></div>`;

  document.getElementById('pd-back-btn').addEventListener('click', backToList);
  document.getElementById('pd-export-btn').addEventListener('click', exportToPDF);
  document.getElementById('pd-edit-btn')?.addEventListener('click', () => openProjectModal(_project));
  wireTabs();
  renderTabContent();
}

function tabDefs() {
  const tabs = [
    ['overview', 'Resumen'], ['github', 'GitHub'], ['scrum', 'Scrum'], ['schedule', 'Cronograma'],
    ['technologies', 'Tecnologías'], ['requirements', `Requisitos (${_requirements.length})`],
    ['contracts', `Contratos (${_contracts.length})`], ['documents', `Documentos (${_documents.length})`],
    ['whatsapp', `WhatsApp (${_messages.length})`], ['emails', `Correos (${_emails.length})`], ['activity', 'Actividad'],
  ];
  if (_project.status === 'observed') tabs.push(['observations', 'Observaciones']);
  return tabs;
}

function tabButtonsHtml() {
  return tabDefs().map(([key, label]) => `
    <button class="pd-tab ${key === 'observations' ? 'observations' : ''} ${_tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>
  `).join('');
}

function wireTabs() {
  document.querySelectorAll('.pd-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _tab = btn.dataset.tab;
      _editingReqId = null;
      document.getElementById('pd-tabs').innerHTML = tabButtonsHtml();
      wireTabs();
      renderTabContent();
    });
  });
}

function switchTab(key) {
  _tab = key;
  document.getElementById('pd-tabs').innerHTML = tabButtonsHtml();
  wireTabs();
  renderTabContent();
}

function infoRow(label, value) {
  if (!value) return '';
  return `<div class="detail-item"><dt>${label}</dt><dd>${esc(value)}</dd></div>`;
}

function fmtMoney(value, currency) {
  if (value == null || isNaN(value) || Number(value) === 0) return '—';
  return `${currency || ''} ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function renderTabContent() {
  const c = document.getElementById('pd-tab-content');
  if (!c) return;
  const p = _project;

  if (_tab === 'overview') {
    c.innerHTML = `
    <div class="pd-grid3">
      <div class="card" style="padding:18px">
        <h3 style="margin:0 0 14px">Empresa</h3>
        <div style="width:100%;aspect-ratio:1/1;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--gray-bg);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:14px">
          ${p.company_logo ? `<img src="${esc(p.company_logo)}" style="width:100%;height:100%;object-fit:contain">` : icon('building')}
        </div>
        <dl class="detail-grid">
          ${infoRow('Nombre Empresa', p.company_name)}
          ${infoRow('Tipo Documento', DOC_TYPE_LABEL[p.id_document_type] || p.id_document_type)}
          ${infoRow('Número Documento', p.id_document_number)}
          ${infoRow('Tipo de Proyecto', PROJECT_TYPE_LABEL[p.project_type] || p.project_type)}
        </dl>
      </div>
      <div class="card" style="padding:18px">
        <h3 style="margin:0 0 14px">Información General</h3>
        <dl class="detail-grid">
          ${infoRow('Cliente', p.client)}
          ${infoRow('Responsable', p.responsible_name)}
          ${infoRow('Presupuesto', fmtMoney(p.budget, p.currency))}
          ${infoRow('Inicio', p.start_date ? formatDate(p.start_date) : '')}
          ${infoRow('Entrega', p.end_date ? formatDate(p.end_date) : '')}
        </dl>
        ${(p.github_url || p.website_url) ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px">
          ${p.github_url ? `<a href="${esc(p.github_url)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--primary)">${icon('code')} GitHub</a>` : ''}
          ${p.website_url ? `<a href="${esc(p.website_url)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--primary)">${icon('external-link')} Ver página</a>` : ''}
        </div>` : ''}
        ${p.description ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <dt style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Descripción</dt>
          <p style="font-size:13px;white-space:pre-wrap;margin:0;max-height:130px;overflow-y:auto">${esc(p.description)}</p>
        </div>` : ''}
      </div>
      <div class="card" style="padding:18px">
        <h3 style="margin:0 0 14px">Resumen de Contenido</h3>
        ${summaryBtn('check-circle', 'Requisitos', _requirements.length, 'requirements')}
        ${summaryBtn('file-text', 'Contratos y Proformas', _contracts.length, 'contracts')}
        ${summaryBtn('folder', 'Documentos', _documents.length, 'documents')}
        ${summaryBtn('message-circle', 'Mensajes WhatsApp', _messages.length, 'whatsapp')}
        ${summaryBtn('mail', 'Correos Electrónicos', _emails.length, 'emails')}
      </div>
    </div>
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">Historial</h3>
        <button class="pd-tab-switch" data-tab="activity" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:13px">Ver todo</button>
      </div>
      ${historyTimeline(_activities.slice(0, 8))}
    </div>`;
    c.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  if (_tab === 'github') {
    if (!p.github_url) {
      c.innerHTML = `<div class="card pd-gh-fallback">${icon('code')}<p>Todavía no se registró un repositorio de GitHub</p></div>`;
    } else {
      c.innerHTML = `<div class="card" style="padding:18px;margin-bottom:14px" id="pd-gh-preview">${spinner()}</div><div id="pd-gh-browser"></div>`;
      loadGithubPreview(p.github_url);
    }
  }

  if (_tab === 'scrum') { c.innerHTML = `<div id="pd-scrum-container">${spinner()}</div>`; loadScrum(); }
  if (_tab === 'schedule') { c.innerHTML = `<div id="pd-schedule-container">${spinner()}</div>`; loadSchedule(); }
  if (_tab === 'technologies') { c.innerHTML = `<div id="pd-tech-container">${spinner()}</div>`; loadTechnologies(); }

  if (_tab === 'requirements') {
    const functional = _requirements.filter(r => r.type !== 'non_functional');
    const nonFunctional = _requirements.filter(r => r.type === 'non_functional');
    c.innerHTML = `<div class="pd-grid2">
      ${requirementsColumn('Funcionales', functional, 'functional')}
      ${requirementsColumn('No Funcionales', nonFunctional, 'non_functional')}
    </div>`;
    wireRequirementsTab();
  }

  if (_tab === 'contracts') {
    c.innerHTML = _contracts.length === 0
      ? `<div class="empty-state">${icon('file-text')}<p>No hay contratos en este proyecto</p></div>`
      : `<div style="display:flex;flex-direction:column;gap:10px">${_contracts.map(ct => `
        <div class="card" style="padding:14px;display:flex;align-items:center;gap:14px">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon('file-text')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px">${esc(ct.title)}</div>
            <div style="font-size:12px;color:var(--text-muted)">${esc(ct.type)}${ct.amount > 0 ? ' · $' + Number(ct.amount).toLocaleString() : ''}</div>
          </div>
        </div>`).join('')}</div>`;
  }

  if (_tab === 'documents') {
    c.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
      <p style="font-size:11.5px;color:var(--text-muted)">La documentación técnica la carga y administra TI.</p>
      ${_documents.length === 0 ? `<div class="empty-state">${icon('folder')}<p>No hay documentos en este proyecto</p></div>` : _documents.map(d => `
        <div class="card" style="padding:14px;display:flex;align-items:center;gap:14px">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--success-bg);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon('file-text')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px">${esc(d.title)}</div>
            <div style="font-size:12px;color:var(--text-muted)">${esc(d.category)} · ${esc(d.file_name || 'Sin archivo')}</div>
          </div>
          ${d.file_path ? `<button class="btn btn-secondary btn-sm pd-doc-view" data-id="${d.id}" data-name="${esc(d.file_name || d.title)}">${icon('eye')} Ver</button>` : ''}
        </div>`).join('')}
    </div>`;
    c.querySelectorAll('.pd-doc-view').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { const { url } = await Store.getProjectDocumentFileUrl(btn.dataset.id); window.open(url, '_blank', 'noopener'); }
        catch (err) { toast(err.message || 'No se pudo abrir el archivo', 'error'); }
      });
    });
  }

  if (_tab === 'whatsapp') {
    c.innerHTML = `<div>
      <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">Los mensajes de WhatsApp los administra TI.</p>
      ${_messages.length === 0 ? `<div class="empty-state">${icon('message-circle')}<p>No hay mensajes de WhatsApp en este proyecto</p></div>` : `
      <div class="card" style="padding:16px;max-height:500px;overflow-y:auto">
        ${_messages.map(m => `
          <div class="pd-chat-msg ${m.direction}">
            <div class="pd-chat-bubble">
              ${m.direction === 'received' ? `<span class="who">${esc(m.contact_name)}</span>` : ''}
              <div style="white-space:pre-wrap">${esc(m.content)}</div>
              <span class="date">${formatDateTime(m.msg_date)}</span>
            </div>
          </div>`).join('')}
      </div>`}
    </div>`;
  }

  if (_tab === 'emails') {
    c.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
      <p style="font-size:11.5px;color:var(--text-muted)">Los correos los administra TI.</p>
      ${_emails.length === 0 ? `<div class="empty-state">${icon('mail')}<p>No hay correos en este proyecto</p></div>` : _emails.map(e => `
        <div class="card" style="padding:14px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <div style="width:8px;height:8px;border-radius:50%;background:${e.direction === 'sent' ? 'var(--primary)' : '#a855f7'}"></div>
            <div style="font-weight:600;font-size:13px;flex:1">${esc(e.subject)}</div>
            <span style="font-size:11.5px;color:var(--text-muted)">${formatDate((e.email_date || '').slice(0, 10))}</span>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin:0">${e.direction === 'received' ? 'De: ' + esc(e.from_name || e.from_email) : 'Para: ' + esc(e.to_email)}</p>
        </div>`).join('')}
    </div>`;
  }

  if (_tab === 'activity') { c.innerHTML = `<div class="card" style="padding:18px">${historyTimeline(_activities)}</div>`; }

  if (_tab === 'observations') {
    const deadline = p.observation_deadline ? new Date(p.observation_deadline) : null;
    const daysLeft = deadline ? Math.ceil((deadline - new Date()) / 86400000) : null;
    const canResubmit = p.origin_area === MY_AREA;
    c.innerHTML = `
    <div class="pd-obs-panel">
      <div class="pd-obs-panel__title">${icon('flag')} Observación de ADG</div>
      <p class="pd-obs-panel__reason">${esc(p.observation_reason || 'Sin motivo registrado')}</p>
      <div class="pd-obs-panel__meta">
        <span>Observado el ${formatDateTime(p.observed_at)}</span>
        ${deadline ? `<strong>${daysLeft > 0 ? `${daysLeft} día${daysLeft === 1 ? '' : 's'} restantes para reenviar` : 'Plazo vencido — se archivará automáticamente'}</strong>` : ''}
      </div>
      <p style="font-size:12.5px;color:#7f1d1d;margin-bottom:14px">Corregí lo que haga falta desde el botón "Editar" (visible mientras esté observado) y después reenviá la solicitud.</p>
      ${canResubmit ? `<button class="btn btn-primary" id="pd-resubmit-btn">${icon('send')} Reenviar solicitud</button>` : ''}
    </div>`;
    document.getElementById('pd-resubmit-btn')?.addEventListener('click', async () => {
      if (!confirm('¿Reenviar la solicitud a ADG para que la revise de nuevo?')) return;
      try { await Store.resubmitProject(_detailId); toast('Solicitud reenviada', 'success'); loadDetail(); }
      catch (err) { toast(err.message || 'Error', 'error'); }
    });
  }
}

function summaryBtn(iconName, label, count, tabKey) {
  return `<button class="pd-summary-btn" data-tab="${tabKey}">
    ${icon(iconName)}<span style="flex:1">${label}</span><span class="count">${count}</span>
  </button>`;
}

function historyTimeline(items) {
  if (!items.length) return '<p style="text-align:center;color:var(--text-muted);font-size:13px;padding:16px 0">Sin actividad registrada</p>';
  return `<div class="pd-timeline">
    ${items.map((a, i) => `
      <div class="pd-timeline__item">
        <div class="pd-timeline__dot-col">
          <div class="pd-timeline__dot"></div>
          ${i < items.length - 1 ? '<div class="pd-timeline__line"></div>' : ''}
        </div>
        <div class="pd-timeline__body">
          <p class="pd-timeline__desc">${esc(a.description)}</p>
          <p class="pd-timeline__date">${formatDateTime(a.created_at)}${a.user_name ? ' · ' + esc(a.user_name) : ''}</p>
        </div>
      </div>`).join('')}
  </div>`;
}

/* ---------- Requisitos (detalle) ---------- */
function requirementsColumn(label, items, type) {
  const canManage = canManageRequirements();
  return `<div class="card" style="padding:18px">
    <h3 style="margin:0 0 14px">${label}</h3>
    <div class="pj-req-list" style="max-height:320px">
      ${items.length === 0 ? '<p class="pj-req-empty">Sin requerimientos registrados</p>' : items.map(r => requirementRowHtml(r, canManage)).join('')}
    </div>
    ${canManage ? `
    <div class="field" style="margin-top:10px">
      <textarea id="pd-req-new-${type}" rows="2" placeholder="Nuevo requerimiento..."></textarea>
    </div>
    <div style="display:flex;justify-content:flex-end">
      <button type="button" class="btn btn-secondary btn-sm pd-req-add" data-type="${type}">${icon('plus')} Agregar</button>
    </div>` : ''}
  </div>`;
}

function requirementRowHtml(r, canManage) {
  if (r.id === _editingReqId) {
    return `<div class="pj-req-row" style="border-color:var(--primary);background:var(--primary-light)">
      <textarea id="pd-req-edit-${r.id}" rows="2" style="flex:1">${esc(r.description || '')}</textarea>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button type="button" class="btn btn-secondary btn-sm pd-req-edit-cancel" data-id="${r.id}">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm pd-req-edit-save" data-id="${r.id}">Guardar</button>
      </div>
    </div>`;
  }
  return `<div class="pj-req-row">
    <div class="pj-req-row__text">${esc(r.description || '')}</div>
    <span style="font-size:11.5px;color:var(--text-muted);flex-shrink:0">${r.progress ?? 0}%</span>
    ${canManage ? `
    <button class="btn btn-ghost pd-req-edit" data-id="${r.id}">${icon('edit')}</button>
    <button class="btn btn-ghost pd-req-del" data-id="${r.id}">${icon('trash')}</button>` : ''}
  </div>`;
}

function wireRequirementsTab() {
  document.querySelectorAll('.pd-req-add').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const input = document.getElementById(`pd-req-new-${type}`);
      const description = input.value.trim();
      if (!description) return;
      try {
        await Store.addProjectRequirement({ project_id: _detailId, type, description });
        _requirements = await Store.getProjectRequirements(_detailId);
        renderTabContent();
        document.getElementById('pd-tabs').innerHTML = tabButtonsHtml();
        wireTabs();
      } catch (err) { toast(err.message || 'Error', 'error'); }
    });
  });
  document.querySelectorAll('.pd-req-edit').forEach(btn => {
    btn.addEventListener('click', () => { _editingReqId = btn.dataset.id; renderTabContent(); });
  });
  document.querySelectorAll('.pd-req-edit-cancel').forEach(btn => {
    btn.addEventListener('click', () => { _editingReqId = null; renderTabContent(); });
  });
  document.querySelectorAll('.pd-req-edit-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const el = document.getElementById(`pd-req-edit-${btn.dataset.id}`);
      const description = el.value.trim();
      if (!description) return;
      try {
        await Store.updateProjectRequirement(btn.dataset.id, { description });
        const r = _requirements.find(x => String(x.id) === btn.dataset.id);
        if (r) r.description = description;
        _editingReqId = null;
        renderTabContent();
      } catch (err) { toast(err.message || 'Error', 'error'); }
    });
  });
  document.querySelectorAll('.pd-req-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await Store.deleteProjectRequirement(btn.dataset.id);
        _requirements = _requirements.filter(x => String(x.id) !== btn.dataset.id);
        renderTabContent();
        document.getElementById('pd-tabs').innerHTML = tabButtonsHtml();
        wireTabs();
      } catch (err) { toast(err.message || 'Error', 'error'); }
    });
  });
}

/* ---------- Scrum ---------- */
async function loadScrum() {
  try {
    const [roles, users] = await Promise.all([
      Store.getProjectScrumRoles(_detailId),
      _scrumUsers.length ? Promise.resolve(_scrumUsers) : Store.getProjectUsers(),
    ]);
    _scrumRoles = roles; _scrumUsers = users;
    renderScrum();
  } catch { const c = document.getElementById('pd-scrum-container'); if (c) c.innerHTML = '<p style="text-align:center;color:var(--danger);font-size:13px;padding:20px 0">Error al cargar los roles Scrum</p>'; }
}

function scrumRoleHint(key) {
  if (key === 'product_owner') return 'Define qué se construye y prioriza el backlog';
  if (key === 'scrum_master') return 'Facilita el proceso y quita obstáculos al equipo';
  return 'Construye el incremento del producto';
}

function renderScrum() {
  const c = document.getElementById('pd-scrum-container');
  if (!c) return;
  c.innerHTML = `<div class="pd-grid3">${SCRUM_ROLES.map(([key, label]) => {
    const items = _scrumRoles.filter(r => r.role === key);
    return `<div class="card" style="padding:16px">
      <h3 style="margin:0 0 3px;font-size:14px">${label}</h3>
      <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 12px">${scrumRoleHint(key)}</p>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${items.length === 0 ? '<p class="pj-req-empty">Sin asignar</p>' : items.map(it => `
          <div class="person-cell" style="padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm)">
            <div class="avatar" style="width:24px;height:24px;font-size:10px">${esc((it.user_name || '?')[0]?.toUpperCase() || '?')}</div>
            <span style="font-size:12.5px;flex:1">${esc(it.user_name || 'Usuario')}</span>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('')}</div>
  <p style="font-size:11.5px;color:var(--text-muted);margin-top:12px">El equipo Scrum lo arma el responsable del proyecto (TI), una vez aprobado y reclamado.</p>`;
}

/* ---------- Tecnologías ---------- */
async function loadTechnologies() {
  try {
    const [techs, langCat, toolCat] = await Promise.all([
      Store.getProjectTechnologies(_detailId),
      Store.getTechnologyCatalog('language'),
      Store.getTechnologyCatalog('tool'),
    ]);
    _technologies = techs; _techCatalog = { language: langCat, tool: toolCat };
    renderTechnologies();
  } catch { const c = document.getElementById('pd-tech-container'); if (c) c.innerHTML = '<p style="text-align:center;color:var(--danger);font-size:13px;padding:20px 0">Error al cargar las tecnologías</p>'; }
}

function renderTechnologies() {
  const c = document.getElementById('pd-tech-container');
  if (!c) return;
  c.innerHTML = `<div class="pd-grid2">${techColumn('Lenguajes', 'language')}${techColumn('Herramientas', 'tool')}</div>`;
  wireTechnologies();
}

function techColumn(label, category) {
  const items = _technologies.filter(t => t.category === category);
  return `<div class="card" style="padding:16px">
    <h3 style="margin:0 0 12px;font-size:14px">${label}</h3>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px" id="pd-tech-list-${category}">
      ${items.length === 0 ? '<p class="pj-req-empty">Sin registrar</p>' : items.map(techChip).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div class="pj-combo" style="flex:1" data-combo-wrap="tech-${category}">
        <input id="pd-tech-new-${category}" autocomplete="off" placeholder="${category === 'tool' ? 'Figma, Docker...' : 'JavaScript, Python...'}">
        <div id="pd-tech-dropdown-${category}" class="pj-combo-dropdown hidden"></div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm pd-tech-add" data-category="${category}">${icon('plus')}</button>
    </div>
  </div>`;
}

function techAvatarHtml(name) {
  return `<span class="avatar-dot">${esc((name || '?').charAt(0).toUpperCase())}</span>`;
}
function techChip(t) {
  const avatar = t.image_url ? `<img src="${t.image_url}">` : techAvatarHtml(t.name);
  return `<span class="pd-tech-chip">${avatar}<span>${esc(t.name)}</span><button type="button" class="pd-tech-del" data-id="${t.id}">${icon('close')}</button></span>`;
}

function wireTechnologies() {
  ['language', 'tool'].forEach(category => {
    const input = document.getElementById(`pd-tech-new-${category}`);
    const dropdown = document.getElementById(`pd-tech-dropdown-${category}`);
    if (!input) return;
    const closeDd = () => dropdown.classList.add('hidden');
    const openDd = () => {
      const q = input.value.trim().toLowerCase();
      const options = (_techCatalog[category] || []).filter(c => !q || c.name.toLowerCase().includes(q)).slice(0, 8);
      if (!options.length) { closeDd(); return; }
      dropdown.innerHTML = options.map(c => `<button type="button" class="pj-combo-option" data-id="${c.id}" data-name="${esc(c.name)}"><span>${esc(c.name)}</span></button>`).join('');
      dropdown.querySelectorAll('.pj-combo-option').forEach(opt => {
        opt.addEventListener('click', () => {
          input.value = opt.dataset.name;
          _pendingCatalogMatch[category] = { id: opt.dataset.id, name: opt.dataset.name };
          closeDd();
        });
      });
      dropdown.classList.remove('hidden');
    };
    input.addEventListener('input', () => { _pendingCatalogMatch[category] = null; openDd(); });
    input.addEventListener('focus', openDd);
    input.addEventListener('keydown', async e => {
      if (e.key === 'Enter') { e.preventDefault(); await submitTechnology(category, input, closeDd); }
      if (e.key === 'Escape') closeDd();
    });
  });

  document.querySelectorAll('.pd-tech-add').forEach(btn => {
    btn.addEventListener('click', async () => {
      const category = btn.dataset.category;
      const input = document.getElementById(`pd-tech-new-${category}`);
      await submitTechnology(category, input, () => document.getElementById(`pd-tech-dropdown-${category}`)?.classList.add('hidden'));
    });
  });

  document.querySelectorAll('.pd-tech-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await Store.deleteProjectTechnology(btn.dataset.id);
        _technologies = _technologies.filter(t => t.id !== btn.dataset.id);
        renderTechnologies();
      } catch (err) { toast(err.message || 'Error', 'error'); }
    });
  });
}

async function submitTechnology(category, input, closeDd) {
  const name = input.value.trim();
  if (!name) return;
  try {
    const picked = _pendingCatalogMatch[category] && _pendingCatalogMatch[category].name.toLowerCase() === name.toLowerCase() ? _pendingCatalogMatch[category] : null;
    const match = picked || (_techCatalog[category] || []).find(c => c.name.toLowerCase() === name.toLowerCase());
    if (match) {
      await Store.addProjectTechnology({ project_id: _detailId, category, name, catalog_id: match.id });
    } else {
      const fd = new FormData();
      fd.append('project_id', _detailId);
      fd.append('category', category);
      fd.append('name', name);
      await Store.addProjectTechnology(fd);
    }
    _pendingCatalogMatch[category] = null;
    closeDd();
    await loadTechnologies();
  } catch (err) { toast(err.message || 'Error', 'error'); }
}

/* ---------- GitHub ---------- */
function parseGithubUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.replace(/^\/|\/$/g, '').split('/');
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
  } catch { return null; }
}

function fmtRelative(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

async function loadGithubPreview(url) {
  const parsed = parseGithubUrl(url);
  if (!parsed) { const c = document.getElementById('pd-gh-preview'); if (c) c.innerHTML = githubFallback(url); return; }
  try {
    const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    if (!res.ok) throw new Error('not ok');
    const repo = await res.json();
    const c = document.getElementById('pd-gh-preview');
    if (!c) return;
    c.innerHTML = `<div style="display:flex;align-items:flex-start;gap:14px">
      <img src="${esc(repo.owner?.avatar_url || '')}" style="width:52px;height:52px;border-radius:10px;border:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <a href="${esc(repo.html_url)}" target="_blank" rel="noopener" style="font-weight:700;color:var(--text)">${esc(repo.full_name)}</a>
        ${repo.description ? `<p style="font-size:13px;color:var(--text-muted);margin:4px 0 0">${esc(repo.description)}</p>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-size:12px;color:var(--text-muted)">
          ${repo.language ? `<span>${icon('code')} ${esc(repo.language)}</span>` : ''}
          <span>★ ${repo.stargazers_count}</span>
          <span>Actualizado ${fmtRelative(repo.pushed_at)}</span>
        </div>
      </div>
      <a href="${esc(repo.html_url)}" target="_blank" rel="noopener" class="btn btn-primary">${icon('external-link')} Abrir</a>
    </div>`;
    initGithubBrowser(parsed.owner, parsed.repo, repo.default_branch);
  } catch { const c = document.getElementById('pd-gh-preview'); if (c) c.innerHTML = githubFallback(url); }
}

function githubFallback(url) {
  return `<div class="pd-gh-fallback">${icon('code')}<p style="word-break:break-all">${esc(url)}</p><p style="font-size:12px">No se pudo cargar la vista previa</p>
    <a href="${esc(url)}" target="_blank" rel="noopener" class="btn btn-primary" style="margin-top:8px">${icon('external-link')} Abrir repositorio</a></div>`;
}

let _ghOwner = null, _ghRepo = null, _ghBranch = 'main', _ghPath = '';
function initGithubBrowser(owner, repo, branch) {
  _ghOwner = owner; _ghRepo = repo; _ghBranch = branch || 'main'; _ghPath = '';
  loadGithubFiles();
}

async function loadGithubFiles() {
  const container = document.getElementById('pd-gh-browser');
  if (!container) return;
  container.innerHTML = `<div class="card" style="overflow:hidden">
    <div class="pd-gh-breadcrumb" id="pd-gh-breadcrumb"></div>
    <div id="pd-gh-file-table">${spinner()}</div>
  </div>`;
  renderGhBreadcrumb();
  const myPath = _ghPath;
  try {
    const res = await fetch(`https://api.github.com/repos/${_ghOwner}/${_ghRepo}/contents/${myPath}?ref=${_ghBranch}`);
    if (myPath !== _ghPath) return;
    if (!res.ok) throw new Error('not ok');
    let items = await res.json();
    if (!Array.isArray(items)) items = [items];
    items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    const t = document.getElementById('pd-gh-file-table');
    if (!t) return;
    t.innerHTML = items.length === 0 ? '<p style="text-align:center;color:var(--text-muted);padding:20px 0;font-size:13px">Carpeta vacía</p>'
      : items.map(it => `<div class="pd-gh-item" data-type="${it.type}" data-path="${esc(it.path)}" data-url="${esc(it.html_url)}">${icon(it.type === 'dir' ? 'folder' : 'file-text')}<span>${esc(it.name)}</span></div>`).join('');
    t.querySelectorAll('.pd-gh-item').forEach(row => {
      row.addEventListener('click', () => {
        if (row.dataset.type === 'dir') { _ghPath = row.dataset.path; loadGithubFiles(); }
        else window.open(row.dataset.url, '_blank', 'noopener');
      });
    });
  } catch {
    if (myPath !== _ghPath) return;
    const t = document.getElementById('pd-gh-file-table');
    if (t) t.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;font-size:13px">No se pudo cargar el contenido del repositorio</p>';
  }
}

function renderGhBreadcrumb() {
  const bc = document.getElementById('pd-gh-breadcrumb');
  if (!bc) return;
  const parts = _ghPath ? _ghPath.split('/') : [];
  let accum = '';
  const crumbs = [`<button class="pd-gh-crumb" data-path="">${esc(_ghRepo)}</button>`];
  parts.forEach(seg => {
    accum = accum ? `${accum}/${seg}` : seg;
    crumbs.push(`<span class="sep">/</span><button class="pd-gh-crumb" data-path="${esc(accum)}">${esc(seg)}</button>`);
  });
  bc.innerHTML = crumbs.join(' ');
  bc.querySelectorAll('.pd-gh-crumb').forEach(btn => btn.addEventListener('click', () => { _ghPath = btn.dataset.path; loadGithubFiles(); }));
}

/* ---------- Cronograma (reuniones) ---------- */
function fmtMeetingDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

async function loadSchedule() {
  try {
    const [meetings, scrumRoles] = await Promise.all([
      Store.getMeetings({ project_id: _detailId }),
      Store.getProjectScrumRoles(_detailId),
    ]);
    _meetings = meetings;
    const pool = new Map();
    scrumRoles.forEach(s => pool.set(s.user_id, { user_id: s.user_id, name: s.user_name, role: s.role }));
    if (_project?.responsible_id && !pool.has(_project.responsible_id)) {
      pool.set(_project.responsible_id, { user_id: _project.responsible_id, name: _project.responsible_name, role: 'responsible' });
    }
    _meetingPool = Array.from(pool.values());
    _meetingParticipantInfo = new Map(pool);
    renderSchedule();
  } catch { const c = document.getElementById('pd-schedule-container'); if (c) c.innerHTML = '<p style="text-align:center;color:var(--danger);font-size:13px;padding:20px 0">Error al cargar el cronograma</p>'; }
}

function renderSchedule() {
  const c = document.getElementById('pd-schedule-container');
  if (!c) return;
  c.innerHTML = `<div style="display:grid;grid-template-columns:${_meetingFormOpen ? '1fr 360px' : '1fr'};gap:16px;align-items:start">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">Reuniones programadas</h3>
        <button type="button" class="btn btn-primary btn-sm" id="pd-schedule-add-btn">${icon('plus')} Agregar reunión</button>
      </div>
      <div id="pd-schedule-list">${scheduleListHtml()}</div>
    </div>
    ${_meetingFormOpen ? `<div id="pd-schedule-form-panel">${meetingFormHtml()}</div>` : ''}
  </div>`;
  wireSchedule();
}

function scheduleListHtml() {
  if (!_meetings.length) return `<div class="empty-state">${icon('calendar')}<p>No hay reuniones programadas</p></div>`;
  const groups = {};
  _meetings.forEach(m => { (groups[m.meeting_date] ||= []).push(m); });
  return Object.entries(groups).map(([date, items]) => `
    <div style="margin-bottom:16px">
      <h4 style="font-size:12.5px;font-weight:700;color:var(--text-muted);margin-bottom:8px">${fmtMeetingDate(date)}</h4>
      <div style="display:flex;flex-direction:column;gap:8px">${items.map(meetingCard).join('')}</div>
    </div>`).join('');
}

function meetingCard(m) {
  const isBusy = m.visibility === 'busy_only';
  const participantsHtml = (m.participants || []).map(p => p.participant_type === 'external'
    ? `${esc(p.external_name)} (${EXTERNAL_KINDS.find(k => k[0] === p.external_kind)?.[1] || p.external_kind})`
    : `${esc(p.user_name || '—')} — ${esc(MEETING_ROLE_LABEL[p.role] || p.user_area || p.role || '—')}`).join('<br>');
  const statusBadgeHtml = m.status === 'cancelled' ? '<span class="badge badge-red">Cancelada</span>'
    : m.status === 'completed' ? '<span class="badge badge-gray">Realizada</span>' : '<span class="badge badge-green">Programada</span>';
  return `<div class="card" style="padding:14px">
    <div style="display:flex;justify-content:space-between;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <strong style="font-size:13.5px">${esc(m.title)}</strong>${statusBadgeHtml}
          ${isBusy ? `<span class="badge badge-gray">${icon('lock')} Privada</span>` : ''}
        </div>
        <p style="font-size:11.5px;color:var(--text-muted);margin:5px 0 0">${m.start_time.slice(0, 5)} — ${m.end_time.slice(0, 5)}${m.meeting_type ? ' · ' + esc(m.meeting_type) : ''}</p>
        ${!isBusy && m.motivo ? `<p style="font-size:13px;margin:8px 0 0">${esc(m.motivo)}</p>` : ''}
        ${!isBusy && participantsHtml ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:8px">${participantsHtml}</div>` : ''}
      </div>
      ${!isBusy ? `<div style="display:flex;gap:4px;flex-shrink:0">
        <button type="button" class="btn btn-ghost btn-sm pd-meeting-edit" data-id="${m.id}">${icon('edit')}</button>
        <button type="button" class="btn btn-ghost btn-sm pd-meeting-del" data-id="${m.id}">${icon('trash')}</button>
      </div>` : ''}
    </div>
  </div>`;
}

function externalsHtml() {
  if (!_meetingExternalParticipants.length) return '';
  return _meetingExternalParticipants.map((p, i) => `
    <span class="tag" style="display:inline-flex;align-items:center;gap:6px">
      ${esc(p.name)} (${EXTERNAL_KINDS.find(k => k[0] === p.kind)?.[1] || p.kind})
      <button type="button" class="pd-meeting-remove-external" data-i="${i}" style="background:none;border:none;cursor:pointer;color:inherit;display:flex">${icon('close')}</button>
    </span>`).join('');
}

function meetingFormHtml() {
  const editing = _meetings.find(m => m.id === _editingMeetingId);
  const selected = new Set(_meetingSelectedParticipants);
  return `<div class="card" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:14px">${editing ? 'Editar reunión' : 'Nueva reunión'}</h3>
      <button type="button" id="pd-schedule-form-close" class="btn btn-ghost btn-sm">${icon('close')}</button>
    </div>
    <form id="pd-meeting-form" style="display:flex;flex-direction:column;gap:10px">
      <div class="field" style="margin:0"><label>Nombre de la reunión *</label><input name="title" required value="${esc(editing?.title || '')}"></div>
      <div class="field-row" style="grid-template-columns:1fr 1fr 1fr">
        <div class="field" style="margin:0"><label>Fecha *</label><input type="date" name="date" required value="${editing?.meeting_date || ''}"></div>
        <div class="field" style="margin:0"><label>Inicio *</label><input type="time" name="start_time" required value="${editing ? editing.start_time.slice(0, 5) : ''}"></div>
        <div class="field" style="margin:0"><label>Fin *</label><input type="time" name="end_time" required value="${editing ? editing.end_time.slice(0, 5) : ''}"></div>
      </div>
      <div class="field" style="margin:0"><label>Tipo de reunión</label>
        <select name="meeting_type"><option value="">— Seleccionar —</option>${MEETING_TYPES.map(t => `<option value="${t}" ${editing?.meeting_type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin:0"><label>Motivo</label><input name="motivo" value="${esc(editing?.motivo || '')}"></div>
      <div class="field" style="margin:0"><label>Descripción</label><textarea name="description" rows="2">${esc(editing?.description || '')}</textarea></div>
      <div class="field" style="margin:0">
        <label>Equipo del proyecto</label>
        <div style="border:1px solid var(--border);border-radius:var(--radius-sm);max-height:120px;overflow-y:auto">
          ${_meetingPool.length === 0 ? '<p class="pj-req-empty">Sin equipo asignado todavía</p>' : _meetingPool.map(p => `
            <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;font-size:12.5px;cursor:pointer">
              <input type="checkbox" class="pd-meeting-participant-cb" value="${p.user_id}" ${selected.has(p.user_id) ? 'checked' : ''}>
              <span>${esc(p.name || '—')} — ${esc(MEETING_ROLE_LABEL[p.role] || p.role)}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="field" style="margin:0">
        <label>Participante externo (cliente, proveedor...)</label>
        <div style="display:flex;gap:6px">
          <input id="pd-meeting-ext-name" placeholder="Nombre" style="flex:1">
          <select id="pd-meeting-ext-kind">${EXTERNAL_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <button type="button" id="pd-meeting-ext-add" class="btn btn-secondary btn-sm">${icon('plus')}</button>
        </div>
        <div id="pd-meeting-selected-externals" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${externalsHtml()}</div>
      </div>
      <div id="pd-meeting-conflict-banner"></div>
      <div style="display:flex;gap:8px;padding-top:4px">
        <button type="submit" id="pd-meeting-save-btn" class="btn btn-primary" style="flex:1;justify-content:center" ${_meetingConflicts.length ? 'disabled' : ''}>${editing ? 'Guardar cambios' : 'Guardar reunión'}</button>
        <button type="button" id="pd-schedule-form-cancel" class="btn btn-secondary">Cancelar</button>
      </div>
    </form>
  </div>`;
}

function conflictBannerHtml() {
  if (!_meetingConflicts.length) return '';
  return `<div style="background:var(--danger-bg);border:1px solid #fecaca;border-radius:var(--radius-sm);padding:10px;font-size:12.5px;color:var(--danger)">
    <p style="font-weight:700;margin:0 0 6px">${_meetingConflicts.length > 1 ? 'Se detectaron conflictos de horario:' : 'Conflicto de horario'}</p>
    <ul style="margin:0;padding-left:16px">
      ${_meetingConflicts.map(c => `<li>${esc(c.user_name || 'Alguien')} (${esc(c.area || '—')}) ya tiene "${esc(c.meeting_name)}" de ${c.start_time.slice(0, 5)} a ${c.end_time.slice(0, 5)} (${fmtMeetingDate(c.date)}).</li>`).join('')}
    </ul>
  </div>`;
}

function wireSchedule() {
  document.getElementById('pd-schedule-add-btn')?.addEventListener('click', () => {
    _editingMeetingId = null; _meetingSelectedParticipants = []; _meetingExternalParticipants = []; _meetingConflicts = [];
    _meetingFormOpen = true; renderSchedule();
  });
  document.getElementById('pd-schedule-form-close')?.addEventListener('click', () => { _meetingFormOpen = false; _editingMeetingId = null; renderSchedule(); });
  document.getElementById('pd-schedule-form-cancel')?.addEventListener('click', () => { _meetingFormOpen = false; _editingMeetingId = null; renderSchedule(); });

  document.querySelectorAll('.pd-meeting-participant-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      _meetingSelectedParticipants = Array.from(document.querySelectorAll('.pd-meeting-participant-cb:checked')).map(x => Number(x.value));
      scheduleLiveCheck();
    });
  });

  const extAdd = document.getElementById('pd-meeting-ext-add');
  if (extAdd) extAdd.addEventListener('click', () => {
    const nameEl = document.getElementById('pd-meeting-ext-name');
    const kindEl = document.getElementById('pd-meeting-ext-kind');
    const name = nameEl.value.trim();
    if (!name) return;
    _meetingExternalParticipants.push({ name, kind: kindEl.value });
    nameEl.value = '';
    document.getElementById('pd-meeting-selected-externals').innerHTML = externalsHtml();
    wireRemoveExternals();
  });
  wireRemoveExternals();

  const form = document.getElementById('pd-meeting-form');
  if (form) {
    ['date', 'start_time', 'end_time'].forEach(fieldName => {
      const el = form.elements[fieldName];
      if (el) el.addEventListener('change', scheduleLiveCheck);
    });
    form.addEventListener('submit', submitMeeting);
  }

  document.querySelectorAll('.pd-meeting-edit').forEach(btn => btn.addEventListener('click', () => editMeeting(btn.dataset.id)));
  document.querySelectorAll('.pd-meeting-del').forEach(btn => btn.addEventListener('click', () => deleteMeeting(btn.dataset.id)));
}

function wireRemoveExternals() {
  document.querySelectorAll('.pd-meeting-remove-external').forEach(btn => btn.addEventListener('click', () => {
    _meetingExternalParticipants.splice(Number(btn.dataset.i), 1);
    document.getElementById('pd-meeting-selected-externals').innerHTML = externalsHtml();
    wireRemoveExternals();
  }));
}

async function scheduleLiveCheck() {
  const form = document.getElementById('pd-meeting-form');
  if (!form) return;
  const date = form.elements.date.value, start = form.elements.start_time.value, end = form.elements.end_time.value;
  const saveBtn = document.getElementById('pd-meeting-save-btn');
  if (!date || !start || !end || !_meetingSelectedParticipants.length || end <= start) {
    _meetingConflicts = [];
    const bannerEl = document.getElementById('pd-meeting-conflict-banner');
    if (bannerEl) bannerEl.innerHTML = '';
    if (saveBtn) saveBtn.disabled = false;
    return;
  }
  const token = ++_meetingCheckToken;
  let conflicts = [];
  try {
    const res = await Store.checkAvailability({ date, start_time: start, end_time: end, participant_ids: _meetingSelectedParticipants, exclude_meeting_id: _editingMeetingId || undefined });
    conflicts = res.conflicts || [];
  } catch { conflicts = []; }
  if (token !== _meetingCheckToken) return;
  _meetingConflicts = conflicts;
  const bannerEl = document.getElementById('pd-meeting-conflict-banner');
  if (bannerEl) bannerEl.innerHTML = conflictBannerHtml();
  const saveBtnEl = document.getElementById('pd-meeting-save-btn');
  if (saveBtnEl) saveBtnEl.disabled = _meetingConflicts.length > 0;
}

async function submitMeeting(e) {
  e.preventDefault();
  const form = e.target;
  const title = form.elements.title.value.trim();
  const date = form.elements.date.value, start_time = form.elements.start_time.value, end_time = form.elements.end_time.value;
  const meeting_type = form.elements.meeting_type.value, motivo = form.elements.motivo.value.trim(), description = form.elements.description.value.trim();
  if (!title) return toast('El nombre de la reunión es requerido', 'error');
  if (!date || !start_time || !end_time) return toast('Fecha y horario son requeridos', 'error');
  if (end_time <= start_time) return toast('La hora de fin debe ser posterior a la de inicio', 'error');
  if (!_meetingSelectedParticipants.length && !_meetingExternalParticipants.length) return toast('Selecciona al menos un participante', 'error');

  const payload = {
    project_id: _detailId, title, date, start_time, end_time, meeting_type, motivo, description,
    participants: _meetingSelectedParticipants.map(user_id => ({ user_id })),
    external_participants: _meetingExternalParticipants,
  };
  try {
    if (_editingMeetingId) { await Store.updateMeeting(_editingMeetingId, payload); toast('Reunión actualizada', 'success'); }
    else { await Store.addMeeting(payload); toast('Reunión programada', 'success'); }
    _meetingFormOpen = false; _editingMeetingId = null; _meetingConflicts = [];
    await loadSchedule();
  } catch (err) {
    if (err.message) toast(err.message, 'error');
  }
}

function editMeeting(id) {
  const m = _meetings.find(x => x.id === id);
  if (!m || m.visibility === 'busy_only') return;
  _editingMeetingId = id;
  _meetingSelectedParticipants = (m.participants || []).filter(p => p.participant_type === 'internal').map(p => p.user_id);
  _meetingExternalParticipants = (m.participants || []).filter(p => p.participant_type === 'external').map(p => ({ name: p.external_name, kind: p.external_kind }));
  _meetingConflicts = []; _meetingFormOpen = true;
  renderSchedule();
}

async function deleteMeeting(id) {
  const m = _meetings.find(x => x.id === id);
  if (!m || !confirm(`¿Eliminar la reunión "${m.title}"?`)) return;
  try {
    await Store.deleteMeeting(id);
    toast('Reunión eliminada', 'success');
    if (_editingMeetingId === id) { _meetingFormOpen = false; _editingMeetingId = null; }
    await loadSchedule();
  } catch (err) { toast(err.message || 'Error', 'error'); }
}

/* ---------- Exportar PDF ---------- */
function exportToPDF() {
  const p = _project;
  const functional = _requirements.filter(r => r.type !== 'non_functional');
  const nonFunctional = _requirements.filter(r => r.type === 'non_functional');
  const reqRows = items => items.length === 0 ? '<p class="muted">Sin requerimientos registrados</p>' : items.map(r => `
    <div class="req-row"><span>${esc(r.description)}</span><span class="req-pct">${r.progress || 0}%</span></div>`).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(p.name)} — ${esc(p.code)}</title>
  <style>
    * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; padding: 40px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; }
    .header img { width: 56px; height: 56px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 8px; }
    .header h1 { font-size: 22px; margin: 0; } .header p { margin: 2px 0 0; color: #6b7280; font-size: 13px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 24px 0 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
    .field dt { font-size: 11px; color: #9ca3af; text-transform: uppercase; } .field dd { margin: 2px 0 0; font-weight: 600; font-size: 14px; }
    .desc { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
    .req-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .req-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .req-pct { font-weight: 700; color: #4f46e5; } .muted { color: #9ca3af; font-size: 13px; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  </style></head><body>
    <div class="header">
      ${p.company_logo ? `<img src="${esc(p.company_logo)}">` : ''}
      <div><h1>${esc(p.name)}</h1><p>${esc(p.code)} · ${esc(p.client)}</p></div>
    </div>
    <h2>Información General</h2>
    <dl class="grid">
      <div class="field"><dt>Cliente</dt><dd>${esc(p.client)}</dd></div>
      <div class="field"><dt>Responsable sugerido</dt><dd>${esc(p.responsible_name || '—')}</dd></div>
      <div class="field"><dt>Presupuesto</dt><dd>${fmtMoney(p.budget, p.currency)}</dd></div>
      <div class="field"><dt>Avance</dt><dd>${p.progress}%</dd></div>
      <div class="field"><dt>Fecha de Inicio</dt><dd>${p.start_date ? formatDate(p.start_date) : '—'}</dd></div>
      <div class="field"><dt>Fecha de Entrega</dt><dd>${p.end_date ? formatDate(p.end_date) : '—'}</dd></div>
    </dl>
    ${p.description ? `<h2>Descripción</h2><p class="desc">${esc(p.description)}</p>` : ''}
    <h2>Requerimientos</h2>
    <div class="req-cols">
      <div><p class="muted" style="font-weight:700;color:#374151">FUNCIONALES</p>${reqRows(functional)}</div>
      <div><p class="muted" style="font-weight:700;color:#374151">NO FUNCIONALES</p>${reqRows(nonFunctional)}</div>
    </div>
    <div class="footer">Generado el ${new Date().toLocaleDateString('es-PE')} desde Qubira RR. HH.</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => { try { win.print(); } catch (_) {} }, 300);
}

/* ============================================================
   Carga inicial de catálogos usados por el modal de creación
   ============================================================ */
(async function preload() {
  try { _users = await Store.getProjectUsers(); } catch (_) {}
  try { _docTypes = await Store.getProjectDocTypes(); } catch (_) {}
})();
