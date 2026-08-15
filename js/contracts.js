import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import {
  formatDate, formatMoney, fullName, initials, icon, escapeHtml,
  contractStatus, CONTRACT_STATUS_META,
} from './utils.js';

let state = { search: '', estado: '', tipo: '' };

const TIPOS = ['Indefinido', 'Plazo Fijo', 'Temporal', 'Pasantía'];

function employeeOptions(selectedId) {
  return Store.getEmployees().map(e =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(fullName(e))}</option>`
  ).join('');
}

function getFiltered() {
  const term = state.search.trim().toLowerCase();
  return Store.getContracts().filter(c => {
    if (state.tipo && c.tipo !== state.tipo) return false;
    if (state.estado && contractStatus(c) !== state.estado) return false;
    if (term) {
      const emp = Store.getEmployee(c.employeeId);
      const haystack = `${emp ? fullName(emp) : ''} ${c.tipo}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function renderContracts() {
  const container = document.getElementById('view-contracts');
  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar__filters">
        <div class="search-box">
          ${icon('search')}
          <input type="text" id="contract-search" placeholder="Buscar por empleado..." value="${escapeHtml(state.search)}">
        </div>
        <select id="contract-filter-tipo">
          <option value="">Todos los tipos</option>
          ${TIPOS.map(t => `<option value="${t}" ${state.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <select id="contract-filter-estado">
          <option value="">Todos los estados</option>
          ${Object.entries(CONTRACT_STATUS_META).map(([key, m]) => `<option value="${key}" ${state.estado === key ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" id="btn-new-contract">${icon('plus')} Nuevo contrato</button>
    </div>
    <div id="contracts-table-wrap"></div>
  `;

  document.getElementById('contract-search').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
  document.getElementById('contract-filter-tipo').addEventListener('change', (e) => { state.tipo = e.target.value; renderTable(); });
  document.getElementById('contract-filter-estado').addEventListener('change', (e) => { state.estado = e.target.value; renderTable(); });
  document.getElementById('btn-new-contract').addEventListener('click', () => openContractForm());

  renderTable();
}

function renderTable() {
  const wrap = document.getElementById('contracts-table-wrap');
  const list = getFiltered().sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));

  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          ${icon('file-text')}
          <p><strong>No se encontraron contratos</strong></p>
          <p>Probá ajustar los filtros o crear un nuevo contrato.</p>
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
            <th>Empleado</th>
            <th>Tipo</th>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Salario</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(rowHtml).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn =>
    btn.addEventListener('click', () => openContractForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn =>
    btn.addEventListener('click', () => handleDelete(btn.dataset.id)));
}

function rowHtml(c) {
  const emp = Store.getEmployee(c.employeeId);
  const meta = CONTRACT_STATUS_META[contractStatus(c)];
  return `
    <tr>
      <td>
        <div class="person-cell">
          ${emp ? `<div class="avatar">${initials(emp.nombre, emp.apellido)}</div>` : ''}
          <div class="cell-main">${emp ? escapeHtml(fullName(emp)) : '<em>Empleado eliminado</em>'}</div>
        </div>
      </td>
      <td>${escapeHtml(c.tipo)}</td>
      <td>${formatDate(c.fechaInicio)}</td>
      <td>${c.fechaFin ? formatDate(c.fechaFin) : 'Indefinido'}</td>
      <td>${formatMoney(c.salario)}</td>
      <td><span class="badge ${meta.cls}">${meta.label}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${c.id}" title="Editar">${icon('edit')}</button>
          <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${c.id}" title="Eliminar">${icon('trash')}</button>
        </div>
      </td>
    </tr>
  `;
}

function openContractForm(id) {
  const editing = id ? Store.getContract(id) : null;
  const modal = openModal({
    title: editing ? 'Editar contrato' : 'Nuevo contrato',
    size: 'lg',
    bodyHtml: `
      <form id="contract-form">
        <div class="field">
          <label>Empleado *</label>
          <select name="employeeId" required>
            <option value="">Seleccionar...</option>
            ${employeeOptions(editing?.employeeId)}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Tipo de contrato *</label>
            <select name="tipo" required>
              ${TIPOS.map(t => `<option value="${t}" ${editing?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Jornada</label>
            <select name="jornada">
              <option value="Tiempo completo" ${editing?.jornada === 'Tiempo completo' || !editing ? 'selected' : ''}>Tiempo completo</option>
              <option value="Medio tiempo" ${editing?.jornada === 'Medio tiempo' ? 'selected' : ''}>Medio tiempo</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Fecha de inicio *</label>
            <input type="date" name="fechaInicio" required value="${editing?.fechaInicio || ''}">
          </div>
          <div class="field">
            <label>Fecha de fin <span style="font-weight:400;">(vacío = indefinido)</span></label>
            <input type="date" name="fechaFin" value="${editing?.fechaFin || ''}">
          </div>
        </div>
        <div class="field">
          <label>Salario (mensual, ARS) *</label>
          <input type="number" name="salario" min="0" step="any" required value="${editing?.salario ?? ''}">
        </div>
        <div class="field">
          <label>Observaciones</label>
          <textarea name="observaciones" rows="3">${escapeHtml(editing?.observaciones || '')}</textarea>
        </div>
        <div class="field" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="finalizadoManual" id="finalizado-check" style="width:auto;" ${editing?.finalizadoManual ? 'checked' : ''}>
          <label for="finalizado-check" style="margin:0;">Marcar contrato como finalizado manualmente</label>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-contract">${editing ? 'Guardar cambios' : 'Crear contrato'}</button>
    `,
  });

  modal.querySelector('#save-contract').addEventListener('click', async () => {
    const form = modal.querySelector('#contract-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      employeeId: fd.get('employeeId'),
      tipo: fd.get('tipo'),
      jornada: fd.get('jornada'),
      fechaInicio: fd.get('fechaInicio'),
      fechaFin: fd.get('fechaFin') || null,
      salario: Number(fd.get('salario')),
      observaciones: fd.get('observaciones') || '',
      finalizadoManual: fd.get('finalizadoManual') === 'on',
    };
    try {
      if (editing) {
        await Store.updateContract(editing.id, data);
        toast('Contrato actualizado correctamente.', 'success');
      } else {
        await Store.addContract(data);
        toast('Contrato creado correctamente.', 'success');
      }
      closeModal();
      renderTable();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar el contrato.', 'error');
    }
  });
}

async function handleDelete(id) {
  const confirmed = await confirmDialog('Vas a eliminar este contrato. Esta acción no se puede deshacer.');
  if (!confirmed) return;
  await Store.deleteContract(id);
  toast('Contrato eliminado.', 'success');
  renderTable();
  document.dispatchEvent(new CustomEvent('data:changed'));
}
