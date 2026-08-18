import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import { formatDate, icon, escapeHtml } from './utils.js';

const OWN_AREA = 'RRHH';
const AREAS = [['RRHH','RR. HH.'],['ADG','ADG'],['TI','TI'],['SOPORTE','Soporte']];
const MEETING_TYPES = ['Entrevista','Onboarding','Evaluación','Capacitación','Reunión interna','Reunión con otra área','Reunión con proveedor','Reunión con candidato','Otro'];
const EXTERNAL_KINDS = [['cliente','Cliente'],['postulante','Postulante'],['proveedor','Proveedor'],['consultor','Consultor'],['otro','Otro']];
const STATUS_LABEL = { scheduled:'Programada', confirmed:'Confirmada', in_progress:'En curso', completed:'Finalizada', cancelled:'Cancelada' };

let _mode = 'area';
let _filters = { area: OWN_AREA, participant: '', type: '', date_from: todayISO(), date_to: '', status: '' };
let _meetings = [];
let _formOpen = false;
let _editingId = null;
let _conflicts = [];
let _selectedParticipants = [];
let _externalParticipants = [];
let _dirResults = [];
let _dirDebounce, _filterDebounce;
let _checkToken = 0;

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fullName(p) { return [p.nombre, p.apellidos].filter(Boolean).join(' '); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('rrhh_user')); } catch { return null; }
}
function isPrivileged() { return (getUser()?.nivel_acceso || 0) >= 100; }

export function renderCalendario() {
  const container = document.getElementById('view-calendario');
  container.innerHTML = `<div class="table-wrap"><div class="empty-state"><p>Cargando calendario…</p></div></div>`;
  load();
}

async function load() {
  try {
    const params = { date_from: _filters.date_from || undefined, date_to: _filters.date_to || undefined, status: _filters.status || undefined };
    if (_mode === 'mine') {
      params.mine = 'true';
    } else {
      params.area = _filters.area;
    }
    let meetings = await Store.getMeetings(params);
    if (_filters.participant) {
      const q = _filters.participant.toLowerCase();
      meetings = meetings.filter(m => (m.participants || []).some(p =>
        (p.user_name || p.external_name || '').toLowerCase().includes(q)));
    }
    if (_filters.type) {
      meetings = meetings.filter(m => (m.meeting_type || '').toLowerCase() === _filters.type.toLowerCase());
    }
    _meetings = meetings;
    renderPage();
  } catch (err) {
    const c = document.getElementById('view-calendario');
    if (c) c.innerHTML = `<div class="table-wrap"><div class="empty-state"><p>${escapeHtml(err.message || 'Error al cargar el calendario')}</p></div></div>`;
  }
}

function renderPage() {
  const c = document.getElementById('view-calendario');
  if (!c) return;

  c.innerHTML = `
    <div class="toolbar">
      <div class="cal-tabs">
        <button type="button" class="cal-tab ${_mode==='area' ? 'active' : ''}" data-mode="area">Calendario — RR.HH.</button>
        <button type="button" class="cal-tab ${_mode==='mine' ? 'active' : ''}" data-mode="mine">Mi agenda</button>
      </div>
      <button class="btn btn-primary" id="cal-add-btn">${icon('plus')} Agregar reunión</button>
    </div>
    <div class="toolbar" style="margin-top:10px;">
      <div class="toolbar__filters" style="flex-wrap:wrap;">
        ${_mode === 'area' ? `
        <select id="f-area">
          ${AREAS.map(([k,l]) => `<option value="${k}" ${_filters.area===k?'selected':''}>${l}</option>`).join('')}
          ${isPrivileged() ? `<option value="ALL" ${_filters.area==='ALL'?'selected':''}>Todas las áreas</option>` : ''}
        </select>` : ''}
        <div class="search-box">
          ${icon('search')}
          <input id="f-participant" placeholder="Buscar participante..." value="${escapeHtml(_filters.participant)}">
        </div>
        <select id="f-type">
          <option value="">Todos los tipos</option>
          ${MEETING_TYPES.map(t => `<option value="${t}" ${_filters.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
        <input type="date" id="f-date-from" value="${_filters.date_from}">
        <input type="date" id="f-date-to" value="${_filters.date_to}">
        <select id="f-status">
          <option value="">Todos los estados</option>
          ${Object.entries(STATUS_LABEL).map(([k,l]) => `<option value="${k}" ${_filters.status===k?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="cal-list" style="margin-top:16px;">${listHtml()}</div>
  `;
  wirePage();
}

function listHtml() {
  if (!_meetings.length) return `<div class="table-wrap"><div class="empty-state">${icon('calendar')}<p><strong>No hay reuniones en este rango</strong></p></div></div>`;
  const groups = {};
  _meetings.forEach(m => { (groups[m.meeting_date] ||= []).push(m); });
  return Object.entries(groups).map(([date, items]) => `
    <div style="margin-bottom:20px;">
      <h4 style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">${formatDate(date)}</h4>
      <div style="display:flex;flex-direction:column;gap:8px;">${items.map(meetingCard).join('')}</div>
    </div>`).join('');
}

function meetingCard(m) {
  const isBusy = m.visibility === 'busy_only';
  const participantsHtml = (m.participants || []).map(p => p.participant_type === 'external'
    ? `${escapeHtml(p.external_name)} (${EXTERNAL_KINDS.find(k=>k[0]===p.external_kind)?.[1] || p.external_kind})`
    : `${escapeHtml(p.user_name || '—')}${p.user_area ? ' — ' + escapeHtml(p.user_area) : ''}${p.user_cargo ? ' — ' + escapeHtml(p.user_cargo) : ''}`)
    .join('<br>');
  const statusTag = m.status === 'cancelled' ? 'Cancelada' : m.status === 'completed' ? 'Finalizada' : 'Programada';

  return `
  <div class="card" style="padding:14px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong>${escapeHtml(m.title)}</strong>
          <span class="tag">${escapeHtml(m.area)}</span>
          <span class="tag">${statusTag}</span>
          ${isBusy ? `<span class="tag">${icon('lock')} Privada</span>` : ''}
        </div>
        <p class="cell-sub" style="margin-top:4px;">${m.start_time.slice(0,5)} — ${m.end_time.slice(0,5)}${m.meeting_type ? ' · ' + escapeHtml(m.meeting_type) : ''}</p>
        ${!isBusy && m.motivo ? `<p style="font-size:13.5px;margin-top:6px;">${escapeHtml(m.motivo)}</p>` : ''}
        ${!isBusy && participantsHtml ? `<div class="cell-sub" style="margin-top:6px;">${participantsHtml}</div>` : ''}
        ${isBusy ? '<p class="cell-sub" style="margin-top:6px;">Sin acceso al detalle de esta reunión</p>' : ''}
      </div>
      ${!isBusy ? `
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button type="button" class="btn btn-ghost btn-sm cal-view-btn" data-id="${m.id}" title="Ver detalle">${icon('eye')}</button>
        <button type="button" class="btn btn-ghost btn-sm cal-edit-btn" data-id="${m.id}" title="Editar">${icon('edit')}</button>
        <button type="button" class="btn btn-ghost btn-sm cal-cancel-btn" data-id="${m.id}" title="Cancelar">${icon('alert-triangle')}</button>
        <button type="button" class="btn btn-ghost btn-sm cal-del-btn" data-id="${m.id}" title="Eliminar">${icon('trash')}</button>
      </div>` : ''}
    </div>
  </div>`;
}

function wirePage() {
  document.querySelectorAll('.cal-tab').forEach(btn => btn.addEventListener('click', () => { _mode = btn.dataset.mode; load(); }));

  const areaSel = document.getElementById('f-area');
  if (areaSel) areaSel.addEventListener('change', e => { _filters.area = e.target.value; load(); });
  const partInput = document.getElementById('f-participant');
  if (partInput) partInput.addEventListener('input', e => {
    clearTimeout(_filterDebounce);
    _filterDebounce = setTimeout(() => { _filters.participant = e.target.value; load(); }, 300);
  });
  const typeSel = document.getElementById('f-type');
  if (typeSel) typeSel.addEventListener('change', e => { _filters.type = e.target.value; load(); });
  const dateFrom = document.getElementById('f-date-from');
  if (dateFrom) dateFrom.addEventListener('change', e => { _filters.date_from = e.target.value; load(); });
  const dateTo = document.getElementById('f-date-to');
  if (dateTo) dateTo.addEventListener('change', e => { _filters.date_to = e.target.value; load(); });
  const statusSel = document.getElementById('f-status');
  if (statusSel) statusSel.addEventListener('change', e => { _filters.status = e.target.value; load(); });

  const addBtn = document.getElementById('cal-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => openForm());

  document.querySelectorAll('.cal-view-btn').forEach(btn => btn.addEventListener('click', () => viewMeeting(btn.dataset.id)));
  document.querySelectorAll('.cal-edit-btn').forEach(btn => btn.addEventListener('click', () => openForm(btn.dataset.id)));
  document.querySelectorAll('.cal-cancel-btn').forEach(btn => btn.addEventListener('click', () => cancelMeeting(btn.dataset.id)));
  document.querySelectorAll('.cal-del-btn').forEach(btn => btn.addEventListener('click', () => deleteMeeting(btn.dataset.id)));
}

function openForm(editId) {
  const editing = editId ? _meetings.find(m => m.id === editId) : null;
  if (editId && (!editing || editing.visibility === 'busy_only')) return;
  _editingId = editId || null;
  _conflicts = [];
  if (editing) {
    _selectedParticipants = (editing.participants || []).filter(p => p.participant_type === 'internal')
      .map(p => ({ user_id: p.user_id, nombre: p.user_name, area: p.user_area }));
    _externalParticipants = (editing.participants || []).filter(p => p.participant_type === 'external')
      .map(p => ({ name: p.external_name, kind: p.external_kind }));
  } else {
    _selectedParticipants = [];
    _externalParticipants = [];
  }

  const modal = openModal({
    title: editing ? 'Editar reunión' : 'Nueva reunión',
    size: 'lg',
    bodyHtml: `
      <form id="meeting-form">
        <div class="field">
          <label>Nombre de la reunión *</label>
          <input name="title" required value="${escapeHtml(editing?.title || '')}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div class="field"><label>Fecha *</label><input type="date" name="date" required value="${editing?.meeting_date || ''}"></div>
          <div class="field"><label>Inicio *</label><input type="time" name="start_time" required value="${editing ? editing.start_time.slice(0,5) : ''}"></div>
          <div class="field"><label>Fin *</label><input type="time" name="end_time" required value="${editing ? editing.end_time.slice(0,5) : ''}"></div>
        </div>
        <div class="field">
          <label>Tipo de reunión</label>
          <select name="meeting_type">
            <option value="">— Seleccionar —</option>
            ${MEETING_TYPES.map(t => `<option value="${t}" ${editing?.meeting_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Motivo</label><input name="motivo" value="${escapeHtml(editing?.motivo || '')}"></div>
        <div class="field"><label>Descripción</label><textarea name="description" rows="2">${escapeHtml(editing?.description || '')}</textarea></div>
        <div class="field">
          <label>Participantes internos</label>
          <div style="position:relative;">
            <input id="cal-participant-search" placeholder="Buscar por nombre, cargo o área...">
            <div id="cal-dir-results" style="display:none;position:absolute;z-index:10;left:0;right:0;background:var(--card-bg,#fff);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);margin-top:4px;max-height:180px;overflow-y:auto;"></div>
          </div>
          <div id="cal-selected-participants" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${selectedParticipantsHtml()}</div>
        </div>
        <div class="field">
          <label>Participante externo (cliente, postulante, proveedor...)</label>
          <div style="display:flex;gap:8px;">
            <input id="cal-ext-name" placeholder="Nombre" style="flex:1;">
            <select id="cal-ext-kind" style="width:auto;">${EXTERNAL_KINDS.map(([k,l]) => `<option value="${k}">${l}</option>`).join('')}</select>
            <button type="button" class="btn btn-secondary" id="cal-ext-add">${icon('plus')}</button>
          </div>
          <div id="cal-selected-externals" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${selectedExternalsHtml()}</div>
        </div>
        <div id="cal-conflict-banner"></div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="cal-save-btn" ${_conflicts.length ? 'disabled' : ''}>${editing ? 'Guardar cambios' : 'Guardar reunión'}</button>
    `,
  });

  wireFormExtras(modal);
  const form = modal.querySelector('#meeting-form');
  ['date', 'start_time', 'end_time'].forEach(name => {
    const el = form.elements[name];
    if (el) el.addEventListener('change', () => liveCheck(modal));
  });
  modal.querySelector('#cal-save-btn').addEventListener('click', () => submitForm(modal));
}

function selectedParticipantsHtml() {
  if (!_selectedParticipants.length) return '<p class="cell-sub">Sin participantes internos</p>';
  return _selectedParticipants.map(p => `
    <span class="tag" style="display:inline-flex;align-items:center;gap:4px;">
      ${escapeHtml(fullName(p))}${p.area ? ' — ' + escapeHtml(p.area) : ''}
      <button type="button" class="cal-remove-participant" data-id="${p.user_id}" style="border:0;background:none;cursor:pointer;color:inherit;">${icon('close')}</button>
    </span>`).join('');
}
function selectedExternalsHtml() {
  if (!_externalParticipants.length) return '';
  return _externalParticipants.map((p, i) => `
    <span class="tag" style="display:inline-flex;align-items:center;gap:4px;">
      ${escapeHtml(p.name)} (${EXTERNAL_KINDS.find(k=>k[0]===p.kind)?.[1] || p.kind})
      <button type="button" class="cal-remove-external" data-i="${i}" style="border:0;background:none;cursor:pointer;color:inherit;">${icon('close')}</button>
    </span>`).join('');
}
function conflictBannerHtml() {
  if (!_conflicts.length) return '';
  return `
  <div style="border-radius:8px;background:#fef2f2;border:1px solid #fecaca;padding:12px;font-size:13px;color:#b91c1c;margin-top:8px;">
    <p style="font-weight:600;display:flex;align-items:center;gap:6px;">${icon('alert-triangle')} ${_conflicts.length > 1 ? 'Se encontraron ' + _conflicts.length + ' conflictos:' : 'Conflicto de horario'}</p>
    <ul style="margin:6px 0 0 18px;padding:0;">
      ${_conflicts.map(c => `<li>${escapeHtml(c.user_name || 'Alguien')} (${escapeHtml(c.area || '—')}) ya tiene "${escapeHtml(c.meeting_name)}" de ${c.start_time.slice(0,5)} a ${c.end_time.slice(0,5)} (${formatDate(c.date)}).</li>`).join('')}
    </ul>
  </div>`;
}

function wireFormExtras(modal) {
  const search = modal.querySelector('#cal-participant-search');
  const results = modal.querySelector('#cal-dir-results');
  search.addEventListener('input', () => {
    clearTimeout(_dirDebounce);
    const q = search.value.trim();
    if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
    _dirDebounce = setTimeout(async () => {
      try {
        _dirResults = await Store.searchDirectory({ q });
        results.innerHTML = _dirResults.length
          ? _dirResults.map(p => `
              <button type="button" class="cal-dir-pick" data-id="${p.user_id}" style="display:flex;justify-content:space-between;width:100%;text-align:left;padding:8px 12px;border:0;background:none;cursor:pointer;font-size:13.5px;">
                <span>${escapeHtml(fullName(p))}</span>
                <span class="cell-sub">${escapeHtml(p.area || '—')}${p.cargo ? ' · ' + escapeHtml(p.cargo) : ''}</span>
              </button>`).join('')
          : '<p class="cell-sub" style="padding:8px 12px;">Sin resultados</p>';
        results.style.display = 'block';
        results.querySelectorAll('.cal-dir-pick').forEach(btn => btn.addEventListener('click', () => {
          const person = _dirResults.find(p => String(p.user_id) === btn.dataset.id);
          if (person && !_selectedParticipants.some(p => p.user_id === person.user_id)) {
            _selectedParticipants.push(person);
            modal.querySelector('#cal-selected-participants').innerHTML = selectedParticipantsHtml();
            wireRemoveParticipants(modal);
            liveCheck(modal);
          }
          search.value = ''; results.style.display = 'none'; results.innerHTML = '';
        }));
      } catch { /* silencioso */ }
    }, 250);
  });
  wireRemoveParticipants(modal);

  modal.querySelector('#cal-ext-add').addEventListener('click', () => {
    const nameEl = modal.querySelector('#cal-ext-name');
    const kindEl = modal.querySelector('#cal-ext-kind');
    const name = nameEl.value.trim();
    if (!name) return;
    _externalParticipants.push({ name, kind: kindEl.value });
    nameEl.value = '';
    modal.querySelector('#cal-selected-externals').innerHTML = selectedExternalsHtml();
    wireRemoveExternals(modal);
  });
  wireRemoveExternals(modal);
}

function wireRemoveParticipants(modal) {
  modal.querySelectorAll('.cal-remove-participant').forEach(btn => btn.addEventListener('click', () => {
    _selectedParticipants = _selectedParticipants.filter(p => String(p.user_id) !== btn.dataset.id);
    modal.querySelector('#cal-selected-participants').innerHTML = selectedParticipantsHtml();
    wireRemoveParticipants(modal);
    liveCheck(modal);
  }));
}
function wireRemoveExternals(modal) {
  modal.querySelectorAll('.cal-remove-external').forEach(btn => btn.addEventListener('click', () => {
    _externalParticipants.splice(Number(btn.dataset.i), 1);
    modal.querySelector('#cal-selected-externals').innerHTML = selectedExternalsHtml();
    wireRemoveExternals(modal);
  }));
}

async function liveCheck(modal) {
  const form = modal.querySelector('#meeting-form');
  if (!form) return;
  const date = form.elements.date.value;
  const start = form.elements.start_time.value;
  const end = form.elements.end_time.value;
  const saveBtn = modal.querySelector('#cal-save-btn');
  const ids = _selectedParticipants.map(p => p.user_id);

  if (!date || !start || !end || !ids.length || end <= start) {
    _conflicts = [];
    modal.querySelector('#cal-conflict-banner').innerHTML = '';
    if (saveBtn) saveBtn.disabled = false;
    return;
  }

  const token = ++_checkToken;
  let conflicts = [];
  try {
    const res = await Store.checkAvailability({ date, start_time: start, end_time: end, participant_ids: ids, exclude_meeting_id: _editingId || undefined });
    conflicts = res.conflicts || [];
  } catch { conflicts = []; }
  if (token !== _checkToken) return;
  _conflicts = conflicts;
  modal.querySelector('#cal-conflict-banner').innerHTML = conflictBannerHtml();
  if (saveBtn) saveBtn.disabled = _conflicts.length > 0;
}

async function submitForm(modal) {
  const form = modal.querySelector('#meeting-form');
  if (!form.reportValidity()) return;
  const title = form.elements.title.value.trim();
  const date = form.elements.date.value;
  const start_time = form.elements.start_time.value;
  const end_time = form.elements.end_time.value;
  const meeting_type = form.elements.meeting_type.value;
  const motivo = form.elements.motivo.value.trim();
  const description = form.elements.description.value.trim();

  if (!title) return toast('El nombre de la reunión es requerido', 'error');
  if (end_time <= start_time) return toast('La hora de fin debe ser posterior a la de inicio', 'error');
  if (!_selectedParticipants.length && !_externalParticipants.length) return toast('Selecciona al menos un participante', 'error');

  const payload = {
    title, date, start_time, end_time, meeting_type, motivo, description,
    participants: _selectedParticipants.map(p => ({ user_id: p.user_id })),
    external_participants: _externalParticipants,
  };

  try {
    if (_editingId) { await Store.updateMeeting(_editingId, payload); toast('Reunión actualizada', 'success'); }
    else { await Store.addMeeting(payload); toast('Reunión programada', 'success'); }
    closeModal();
    await load();
  } catch (err) {
    if (err.message === 'Existen conflictos de horario') {
      toast(err.message, 'error');
    } else {
      toast(err.message || 'Error', 'error');
    }
  }
}

async function cancelMeeting(id) {
  const m = _meetings.find(x => x.id === id);
  if (!m) return;
  const ok = await confirmDialog(`¿Deseas cancelar la reunión "${m.title}"? Se liberará el horario de los participantes.`, { confirmLabel: 'Cancelar reunión' });
  if (!ok) return;
  try { await Store.cancelMeeting(id); toast('Reunión cancelada', 'success'); await load(); }
  catch (err) { toast(err.message || 'Error', 'error'); }
}

async function deleteMeeting(id) {
  const m = _meetings.find(x => x.id === id);
  if (!m) return;
  const ok = await confirmDialog(`¿Deseas eliminar la reunión "${m.title}"? Esta acción no se puede deshacer.`);
  if (!ok) return;
  try { await Store.deleteMeeting(id); toast('Reunión eliminada', 'success'); await load(); }
  catch (err) { toast(err.message || 'Error', 'error'); }
}

function viewMeeting(id) {
  const m = _meetings.find(x => x.id === id);
  if (!m || m.visibility === 'busy_only') return;
  const participantsHtml = (m.participants || []).map(p => p.participant_type === 'external'
    ? `<li>${escapeHtml(p.external_name)} — ${EXTERNAL_KINDS.find(k=>k[0]===p.external_kind)?.[1] || p.external_kind} (externo)</li>`
    : `<li>${escapeHtml(p.user_name || '—')}${p.user_area ? ' — ' + escapeHtml(p.user_area) : ''}${p.user_cargo ? ' — ' + escapeHtml(p.user_cargo) : ''}</li>`).join('');
  openModal({
    title: m.title,
    bodyHtml: `
      <div style="font-size:13.5px;display:flex;flex-direction:column;gap:8px;">
        <p><strong>Área:</strong> ${escapeHtml(m.area)}</p>
        <p><strong>Fecha:</strong> ${formatDate(m.meeting_date)}</p>
        <p><strong>Horario:</strong> ${m.start_time.slice(0,5)} — ${m.end_time.slice(0,5)}</p>
        ${m.meeting_type ? `<p><strong>Tipo:</strong> ${escapeHtml(m.meeting_type)}</p>` : ''}
        ${m.motivo ? `<p><strong>Motivo:</strong> ${escapeHtml(m.motivo)}</p>` : ''}
        ${m.description ? `<p><strong>Descripción:</strong> ${escapeHtml(m.description)}</p>` : ''}
        <div><strong>Participantes:</strong><ul style="margin:4px 0 0 18px;padding:0;">${participantsHtml || '<li>Sin participantes</li>'}</ul></div>
        <p class="cell-sub">Programada por ${escapeHtml(m.created_by_name || '—')}</p>
      </div>
    `,
    footerHtml: `<button class="btn btn-secondary" data-close>Cerrar</button>`,
  });
}
