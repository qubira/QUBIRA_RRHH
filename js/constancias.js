import { Store } from './storage.js';
import { openModal, closeModal, toast } from './ui.js';
import { formatDate, fullName, initials, icon, escapeHtml } from './utils.js';

const TRATAMIENTOS = ['el Sr.', 'la Sra.', 'la Srta.'];

let list = [];
let loaded = false;
let firmaUrl = null;

function employeeOptions() {
  return Store.getEmployees().map(e =>
    `<option value="${e.id}">${escapeHtml(fullName(e))}</option>`
  ).join('');
}

export async function renderConstancias() {
  const container = document.getElementById('view-constancias');
  container.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-constancia">${icon('plus')} Emitir Constancia</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;">
          <strong>Tu firma personal</strong>
          <p style="color:var(--text-muted);font-size:13px;margin-top:4px;">
            Es tuya, no de todo el sistema: se incrusta en las constancias que TÚ emitas a partir de ahora.
            Cada quien sube la suya; no afecta a otros usuarios ni a lo ya emitido.
          </p>
        </div>
        <img id="firma-preview" src="" alt="Firma" style="height:50px;display:none;border:1px solid var(--border,#e5e7eb);border-radius:6px;padding:4px;background:#fff;">
        <label class="btn btn-secondary" style="cursor:pointer;">
          ${icon('upload')} Subir / reemplazar
          <input type="file" id="firma-input" accept="image/*" style="display:none;">
        </label>
      </div>
    </div>
    <div id="constancias-table-wrap"></div>
  `;

  document.getElementById('btn-new-constancia').addEventListener('click', () => openConstanciaForm());
  document.getElementById('firma-input').addEventListener('change', handleFirmaUpload);

  await loadFirmaConfig();
  await loadList();
}

async function loadFirmaConfig() {
  try {
    const cfg = await Store.getConstanciaConfig();
    firmaUrl = cfg?.firmaUrl || null;
    const img = document.getElementById('firma-preview');
    if (img) {
      if (firmaUrl) { img.src = firmaUrl; img.style.display = ''; }
      else { img.style.display = 'none'; }
    }
  } catch (err) {
    if (err.message !== 'SESSION_EXPIRED') toast('No se pudo cargar la configuración de firma.', 'error');
  }
}

async function handleFirmaUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = await Store.uploadConstanciaFirma(file);
    firmaUrl = data.firmaUrl;
    const img = document.getElementById('firma-preview');
    img.src = firmaUrl;
    img.style.display = '';
    toast('Firma actualizada.', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo subir la imagen.', 'error');
  } finally {
    e.target.value = '';
  }
}

async function loadList() {
  const wrap = document.getElementById('constancias-table-wrap');
  wrap.innerHTML = `<div class="table-wrap"><div class="empty-state"><p>Cargando…</p></div></div>`;
  try {
    list = await Store.listConstancias();
    loaded = true;
  } catch (err) {
    if (err.message !== 'SESSION_EXPIRED') toast('No se pudo cargar el historial de constancias.', 'error');
    list = [];
  }
  renderTable();
}

function renderTable() {
  const wrap = document.getElementById('constancias-table-wrap');
  if (!loaded) return;

  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          ${icon('award')}
          <p><strong>Todavía no emitiste ninguna constancia</strong></p>
          <p>Usa "Emitir Constancia" para generar la primera.</p>
        </div>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>N.° Constancia</th>
            <th>Trabajador</th>
            <th>Cargo</th>
            <th>Emitida</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(rowHtml).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="download"]').forEach(btn =>
    btn.addEventListener('click', () => handleDownload(btn.dataset.id, btn.dataset.numero)));
  wrap.querySelectorAll('[data-action="edit"]').forEach(btn =>
    btn.addEventListener('click', () => openEditForm(list.find(c => c.id === btn.dataset.id))));
}

function rowHtml(c) {
  return `
    <tr>
      <td><span class="tag">${escapeHtml(c.numero)}</span></td>
      <td>
        <div class="person-cell">
          <div class="avatar">${initials(...String(c.nombreCompleto || '?').split(' '))}</div>
          <span>${escapeHtml(c.nombreCompleto)}</span>
        </div>
      </td>
      <td>${escapeHtml(c.cargo || '—')}</td>
      <td>${formatDate(c.fechaEmision)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${c.id}" title="Editar">${icon('edit')}</button>
          <button class="btn btn-ghost btn-sm" data-action="download" data-id="${c.id}" data-numero="${escapeHtml(c.numero)}" title="Descargar PDF">${icon('file-text')} PDF</button>
        </div>
      </td>
    </tr>
  `;
}

async function handleDownload(id, numero) {
  try {
    const url = await Store.downloadConstanciaPdfUrl(id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${numero}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    toast(err.message || 'No se pudo generar el PDF.', 'error');
  }
}

function openConstanciaForm() {
  const employees = Store.getEmployees();
  if (!employees.length) {
    toast('Primero registra al menos un empleado.', 'error');
    return;
  }

  const modal = openModal({
    title: 'Emitir Constancia de Trabajo',
    bodyHtml: `
      <form id="constancia-form">
        <div class="field">
          <label>Empleado *</label>
          <select name="employeeId" id="constancia-employee" required>
            <option value="">Seleccionar...</option>
            ${employeeOptions()}
          </select>
        </div>
        <div class="field">
          <label>Tratamiento</label>
          <select name="tratamiento">
            ${TRATAMIENTOS.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Fecha de inicio</label>
            <input type="date" name="fechaInicio" id="constancia-fecha-inicio">
          </div>
          <div class="field">
            <label>Fecha de fin</label>
            <input type="date" name="fechaFin" id="constancia-fecha-fin">
            <p style="color:var(--text-muted);font-size:11px;margin-top:2px;">Déjalo vacío si sigue activo — se mostrará como "Actualidad".</p>
          </div>
        </div>
        <div class="field">
          <label>Función principal *</label>
          <textarea name="funcionPrincipal" rows="3" placeholder="Breve descripción de las funciones desempeñadas..." required></textarea>
        </div>
        <div class="field">
          <label>Lugar de emisión</label>
          <input type="text" name="lugar" value="Lima, Perú">
        </div>
        ${!firmaUrl ? `<p style="color:var(--text-muted);font-size:12px;">No subiste tu firma todavía — la constancia se generará solo con tu nombre y cargo.</p>` : ''}
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-constancia">Emitir y descargar</button>
    `,
  });

  modal.querySelector('#constancia-employee').addEventListener('change', (e) => {
    const emp = Store.getEmployee(e.target.value);
    const fi = modal.querySelector('#constancia-fecha-inicio');
    const ff = modal.querySelector('#constancia-fecha-fin');
    if (emp) {
      fi.value = emp.fechaIngreso || '';
      ff.value = '';
    }
  });

  modal.querySelector('#save-constancia').addEventListener('click', async () => {
    const form = modal.querySelector('#constancia-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const payload = {
      employeeId: fd.get('employeeId'),
      tratamiento: fd.get('tratamiento'),
      fechaInicio: fd.get('fechaInicio'),
      fechaFin: fd.get('fechaFin'),
      funcionPrincipal: fd.get('funcionPrincipal'),
      lugar: fd.get('lugar'),
    };
    try {
      const data = await Store.createConstancia(payload);
      toast(`Constancia ${data.numero} emitida.`, 'success');
      closeModal();
      await handleDownload(data.id, data.numero);
      await loadList();
    } catch (err) {
      toast(err.message || 'No se pudo emitir la constancia.', 'error');
    }
  });
}

function openEditForm(c) {
  if (!c) return;

  const modal = openModal({
    title: `Editar Constancia ${c.numero}`,
    bodyHtml: `
      <form id="edit-constancia-form">
        <div class="field">
          <label>Nombre completo</label>
          <input type="text" name="nombreCompleto" value="${escapeHtml(c.nombreCompleto || '')}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Tratamiento</label>
            <select name="tratamiento">
              ${TRATAMIENTOS.map(t => `<option value="${t}" ${c.tratamiento === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Tipo y número de documento</label>
            <input type="text" name="tipoDocumento" value="${escapeHtml(c.tipoDocumento || '')}" style="margin-bottom:6px;" placeholder="Tipo (ej. DNI)">
            <input type="text" name="numeroDocumento" value="${escapeHtml(c.numeroDocumento || '')}" placeholder="Número">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Área</label>
            <input type="text" name="area" value="${escapeHtml(c.area || '')}">
          </div>
          <div class="field">
            <label>Cargo</label>
            <input type="text" name="cargo" value="${escapeHtml(c.cargo || '')}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Fecha de inicio</label>
            <input type="date" name="fechaInicio" value="${/^\d{4}-\d{2}-\d{2}/.test(c.fechaInicio) ? c.fechaInicio : ''}">
          </div>
          <div class="field">
            <label>Fecha de fin</label>
            <input type="date" name="fechaFin" value="${/^\d{4}-\d{2}-\d{2}/.test(c.fechaFin) ? c.fechaFin : ''}">
            <p style="color:var(--text-muted);font-size:11px;margin-top:2px;">Déjalo vacío si sigue activo — se mostrará como "Actualidad".</p>
          </div>
        </div>
        <div class="field">
          <label>Función principal</label>
          <textarea name="funcionPrincipal" rows="3">${escapeHtml(c.funcionPrincipal || '')}</textarea>
        </div>
        <div class="field">
          <label>Lugar de emisión</label>
          <input type="text" name="lugar" value="${escapeHtml(c.lugar || '')}">
        </div>
        <p style="color:var(--text-muted);font-size:12px;">El N.° de constancia y el código de verificación no cambian al editar.</p>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-edit-constancia">Guardar cambios</button>
    `,
  });

  modal.querySelector('#save-edit-constancia').addEventListener('click', async () => {
    const form = modal.querySelector('#edit-constancia-form');
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    try {
      await Store.updateConstancia(c.id, payload);
      toast('Constancia actualizada.', 'success');
      closeModal();
      await loadList();
    } catch (err) {
      toast(err.message || 'No se pudo actualizar la constancia.', 'error');
    }
  });
}
