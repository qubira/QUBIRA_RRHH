import { Store } from './storage.js';
import { icon, escapeHtml, formatDateTime } from './utils.js';

const AREAS = [['RRHH','RR. HH.'],['ADG','ADG'],['TI','TI'],['SOPORTE','Soporte']];
const ACTION_LABEL = { view: 'Consultó', create: 'Creó', update: 'Actualizó', delete: 'Eliminó', login: 'Inició sesión', logout: 'Cerró sesión' };

let _rows = [];
let _total = 0;
let _offset = 0;
const PAGE_SIZE = 50;
let _filters = { area: '', action_type: '', date_from: daysAgoISO(2), date_to: '', q: '' };

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function getUser() {
  try { return JSON.parse(localStorage.getItem('rrhh_user')); } catch { return null; }
}
function isPrivileged() { return (getUser()?.nivel_acceso || 0) >= 100; }

export function renderAuditoria() {
  const container = document.getElementById('view-auditoria');
  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar__filters">
        ${isPrivileged() ? `
        <select id="aud-f-area">
          <option value="">Mi área (RR. HH.)</option>
          ${AREAS.map(([k,l]) => `<option value="${k}" ${_filters.area===k?'selected':''}>${l}</option>`).join('')}
          <option value="ALL" ${_filters.area==='ALL'?'selected':''}>Todas las áreas</option>
        </select>` : ''}
        <select id="aud-f-action">
          <option value="">Todas las acciones</option>
          ${Object.entries(ACTION_LABEL).map(([k,l]) => `<option value="${k}" ${_filters.action_type===k?'selected':''}>${l}</option>`).join('')}
        </select>
        <input type="date" id="aud-f-date-from" value="${_filters.date_from}">
        <input type="date" id="aud-f-date-to" value="${_filters.date_to}">
        <div class="search-box">
          ${icon('search')}
          <input type="text" id="aud-f-q" placeholder="Buscar en la ruta..." value="${escapeHtml(_filters.q)}">
        </div>
      </div>
    </div>
    <div id="audit-table-wrap"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:12.5px;color:var(--text-muted)">
      <span id="audit-count"></span>
      <button class="btn btn-secondary" id="audit-load-more" style="display:none">Cargar más</button>
    </div>
  `;

  document.getElementById('aud-f-area')?.addEventListener('change', e => { _filters.area = e.target.value; _offset = 0; load(); });
  document.getElementById('aud-f-action').addEventListener('change', e => { _filters.action_type = e.target.value; _offset = 0; load(); });
  document.getElementById('aud-f-date-from').addEventListener('change', e => { _filters.date_from = e.target.value; _offset = 0; load(); });
  document.getElementById('aud-f-date-to').addEventListener('change', e => { _filters.date_to = e.target.value; _offset = 0; load(); });
  let qDebounce;
  document.getElementById('aud-f-q').addEventListener('input', e => {
    clearTimeout(qDebounce);
    qDebounce = setTimeout(() => { _filters.q = e.target.value; _offset = 0; load(); }, 350);
  });
  document.getElementById('audit-load-more').addEventListener('click', () => { _offset += PAGE_SIZE; load(true); });

  _offset = 0;
  load();
}

async function load(append = false) {
  const wrap = document.getElementById('audit-table-wrap');
  try {
    const params = {
      action_type: _filters.action_type || undefined,
      date_from: _filters.date_from || undefined,
      date_to: _filters.date_to || undefined,
      q: _filters.q || undefined,
      limit: PAGE_SIZE, offset: _offset,
    };
    if (isPrivileged()) params.area = _filters.area || undefined;
    const data = await Store.getAuditLogs(params);
    _rows = append ? [..._rows, ...data.rows] : data.rows;
    _total = data.total;
    renderTable();
  } catch (err) {
    if (wrap) wrap.innerHTML = `<div class="table-wrap"><div class="empty-state"><p>${escapeHtml(err.message || 'Error al cargar la auditoría')}</p></div></div>`;
  }
}

function renderTable() {
  const wrap = document.getElementById('audit-table-wrap');
  if (!wrap) return;

  document.getElementById('audit-count').textContent = `${_rows.length} de ${_total}`;
  document.getElementById('audit-load-more').style.display = _rows.length < _total ? 'inline-flex' : 'none';

  if (_rows.length === 0) {
    wrap.innerHTML = `<div class="table-wrap"><div class="empty-state">${icon('eye')}<p><strong>Sin movimientos en este rango</strong></p></div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Fecha</th><th>Usuario</th><th>Área</th><th>Acción</th><th>Detalle</th></tr>
        </thead>
        <tbody>
          ${_rows.map(rowHtml).join('')}
        </tbody>
      </table>
    </div>`;
}

function rowHtml(r) {
  return `
  <tr>
    <td class="cell-sub">${formatDateTime(r.created_at)}</td>
    <td class="cell-main">${escapeHtml(r.user_name || r.username || '—')}</td>
    <td class="cell-sub">${escapeHtml(r.area || '—')}</td>
    <td><span class="tag">${escapeHtml(ACTION_LABEL[r.action_type] || r.action_type)}</span></td>
    <td class="cell-sub" title="${escapeHtml(r.path)}">${escapeHtml(r.description)} · ${escapeHtml(r.method)} ${escapeHtml(r.path)}</td>
  </tr>`;
}
