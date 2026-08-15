import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import { formatDate, formatBytes, fullName, initials, icon, escapeHtml } from './utils.js';

let state = { search: '', categoria: '', employeeId: '' };

const CATEGORIAS = ['DNI', 'CV', 'Título', 'Certificado', 'Contrato Firmado', 'Otro'];

function employeeOptions(selectedId) {
  return Store.getEmployees().map(e =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(fullName(e))}</option>`
  ).join('');
}

function getFiltered() {
  const term = state.search.trim().toLowerCase();
  return Store.getDocuments().filter(d => {
    if (state.categoria && d.categoria !== state.categoria) return false;
    if (state.employeeId && d.employeeId !== state.employeeId) return false;
    if (term) {
      const emp = Store.getEmployee(d.employeeId);
      const haystack = `${emp ? fullName(emp) : ''} ${d.nombreArchivo} ${d.categoria}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function renderDocuments() {
  const container = document.getElementById('view-documents');
  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar__filters">
        <div class="search-box">
          ${icon('search')}
          <input type="text" id="doc-search" placeholder="Buscar por empleado o archivo..." value="${escapeHtml(state.search)}">
        </div>
        <select id="doc-filter-emp">
          <option value="">Todos los empleados</option>
          ${employeeOptions(state.employeeId)}
        </select>
        <select id="doc-filter-cat">
          <option value="">Todas las categorías</option>
          ${CATEGORIAS.map(c => `<option value="${c}" ${state.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" id="btn-new-doc">${icon('upload')} Subir documento</button>
    </div>
    <div id="documents-table-wrap"></div>
  `;

  document.getElementById('doc-search').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
  document.getElementById('doc-filter-emp').addEventListener('change', (e) => { state.employeeId = e.target.value; renderTable(); });
  document.getElementById('doc-filter-cat').addEventListener('change', (e) => { state.categoria = e.target.value; renderTable(); });
  document.getElementById('btn-new-doc').addEventListener('click', () => openDocumentForm());

  renderTable();
}

function renderTable() {
  const wrap = document.getElementById('documents-table-wrap');
  const list = getFiltered().sort((a, b) => new Date(b.fechaSubida) - new Date(a.fechaSubida));

  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          ${icon('folder')}
          <p><strong>No hay documentos cargados</strong></p>
          <p>Probá ajustar los filtros o subir un nuevo documento.</p>
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
            <th>Archivo</th>
            <th>Empleado</th>
            <th>Categoría</th>
            <th>Tamaño</th>
            <th>Fecha</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(rowHtml).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="delete"]').forEach(btn =>
    btn.addEventListener('click', () => handleDelete(btn.dataset.id)));
}

function rowHtml(d) {
  const emp = Store.getEmployee(d.employeeId);
  return `
    <tr>
      <td>
        <div class="person-cell">
          ${icon('file-text')}
          <div>
            <div class="cell-main">${escapeHtml(d.nombreArchivo)}</div>
            ${d.notas ? `<div class="cell-sub">${escapeHtml(d.notas)}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${emp ? `<div class="person-cell"><div class="avatar">${initials(emp.nombre, emp.apellido)}</div><span>${escapeHtml(fullName(emp))}</span></div>` : '<em>Empleado eliminado</em>'}</td>
      <td><span class="tag">${escapeHtml(d.categoria)}</span></td>
      <td>${formatBytes(d.tamano)}</td>
      <td>${formatDate(d.fechaSubida)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${d.id}" title="Eliminar">${icon('trash')}</button>
        </div>
      </td>
    </tr>
  `;
}

function openDocumentForm() {
  const modal = openModal({
    title: 'Subir documento',
    bodyHtml: `
      <form id="document-form">
        <div class="field">
          <label>Empleado *</label>
          <select name="employeeId" required>
            <option value="">Seleccionar...</option>
            ${employeeOptions(state.employeeId)}
          </select>
        </div>
        <div class="field">
          <label>Categoría *</label>
          <select name="categoria" required>
            ${CATEGORIAS.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Archivo *</label>
          <input type="file" name="archivo" required>
          <div class="cell-sub" style="margin-top:6px;">Se guarda el nombre y tamaño del archivo (sin backend de almacenamiento configurado).</div>
        </div>
        <div class="field">
          <label>Notas</label>
          <textarea name="notas" rows="2"></textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-document">Subir documento</button>
    `,
  });

  modal.querySelector('#save-document').addEventListener('click', async () => {
    const form = modal.querySelector('#document-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const file = fd.get('archivo');
    if (!file || !file.name) { toast('Seleccioná un archivo.', 'error'); return; }
    try {
      await Store.addDocument({
        employeeId: fd.get('employeeId'),
        categoria: fd.get('categoria'),
        nombreArchivo: file.name,
        tamano: file.size,
        fechaSubida: new Date().toISOString().slice(0, 10),
        notas: fd.get('notas') || '',
      });
      toast('Documento subido correctamente.', 'success');
      closeModal();
      renderTable();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo subir el documento.', 'error');
    }
  });
}

async function handleDelete(id) {
  const confirmed = await confirmDialog('Vas a eliminar este documento. Esta acción no se puede deshacer.');
  if (!confirmed) return;
  await Store.deleteDocument(id);
  toast('Documento eliminado.', 'success');
  renderTable();
  document.dispatchEvent(new CustomEvent('data:changed'));
}
