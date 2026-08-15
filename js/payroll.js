import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import {
  formatDate, formatMoney, fullName, initials, icon, escapeHtml, daysBetween,
  PAYROLL_STATUS_META, VACATION_STATUS_META,
} from './utils.js';

const VACATION_TYPES = ['Vacaciones', 'Licencia médica', 'Licencia especial', 'Otro'];

let activeTab = 'liquidaciones';

function employeeOptions(selectedId) {
  return Store.getEmployees().map(e =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(fullName(e))}</option>`
  ).join('');
}

export function renderPayroll() {
  const container = document.getElementById('view-payroll');
  container.innerHTML = `
    <div class="subtabs">
      <button class="subtab" data-tab="liquidaciones">${icon('dollar-sign')} Liquidaciones</button>
      <button class="subtab" data-tab="vacaciones">${icon('calendar')} Vacaciones y Licencias</button>
    </div>
    <div class="subview" id="sub-liquidaciones"></div>
    <div class="subview" id="sub-vacaciones"></div>
  `;
  container.querySelectorAll('.subtab').forEach(tab =>
    tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  switchTab(activeTab);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#view-payroll .subtab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('#view-payroll .subview').forEach(v => v.classList.remove('active'));
  document.getElementById(`sub-${tab}`).classList.add('active');
  if (tab === 'liquidaciones') renderPayrollTable();
  else renderVacationsTable();
}

// ===================== Liquidaciones =====================
function renderPayrollTable() {
  const wrap = document.getElementById('sub-liquidaciones');
  const records = Store.getPayrollRecords().sort((a, b) => b.periodo.localeCompare(a.periodo));

  wrap.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-payroll">${icon('plus')} Nueva liquidación</button>
    </div>
    <div class="table-wrap">
      ${records.length === 0 ? `
        <div class="empty-state">${icon('dollar-sign')}<p><strong>No hay liquidaciones registradas</strong></p></div>
      ` : `
        <table>
          <thead>
            <tr><th>Empleado</th><th>Período</th><th>Salario base</th><th>Bonos</th><th>Descuentos</th><th>Total</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${records.map(p => {
              const emp = Store.getEmployee(p.employeeId);
              const meta = PAYROLL_STATUS_META[p.estado] || PAYROLL_STATUS_META['Pendiente'];
              const total = (p.salarioBase || 0) + (p.bonos || 0) - (p.descuentos || 0);
              return `
                <tr>
                  <td>${emp ? `<div class="person-cell"><div class="avatar">${initials(emp.nombre, emp.apellido)}</div><span class="cell-main">${escapeHtml(fullName(emp))}</span></div>` : '<em>Empleado eliminado</em>'}</td>
                  <td>${escapeHtml(p.periodo)}</td>
                  <td>${formatMoney(p.salarioBase)}</td>
                  <td>${formatMoney(p.bonos)}</td>
                  <td>${formatMoney(p.descuentos)}</td>
                  <td class="cell-main">${formatMoney(total)}</td>
                  <td><span class="badge ${meta.cls}">${meta.label}</span></td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm" data-action="edit-payroll" data-id="${p.id}" title="Editar">${icon('edit')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="delete-payroll" data-id="${p.id}" title="Eliminar">${icon('trash')}</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  wrap.querySelector('#btn-new-payroll').addEventListener('click', () => openPayrollForm());
  wrap.querySelectorAll('[data-action="edit-payroll"]').forEach(btn =>
    btn.addEventListener('click', () => openPayrollForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete-payroll"]').forEach(btn =>
    btn.addEventListener('click', () => handleDeletePayroll(btn.dataset.id)));
}

function openPayrollForm(id) {
  const editing = id ? Store.getPayrollRecord(id) : null;
  const modal = openModal({
    title: editing ? 'Editar liquidación' : 'Nueva liquidación',
    bodyHtml: `
      <form id="payroll-form">
        <div class="field">
          <label>Empleado *</label>
          <select name="employeeId" required>
            <option value="">Seleccionar...</option>
            ${employeeOptions(editing?.employeeId)}
          </select>
        </div>
        <div class="field">
          <label>Período (AAAA-MM) *</label>
          <input type="month" name="periodo" required value="${editing?.periodo || new Date().toISOString().slice(0, 7)}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Salario base *</label>
            <input type="number" name="salarioBase" min="0" step="1000" required value="${editing?.salarioBase ?? ''}">
          </div>
          <div class="field">
            <label>Bonos</label>
            <input type="number" name="bonos" min="0" step="1000" value="${editing?.bonos ?? 0}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Descuentos</label>
            <input type="number" name="descuentos" min="0" step="1000" value="${editing?.descuentos ?? 0}">
          </div>
          <div class="field">
            <label>Estado</label>
            <select name="estado">
              ${Object.keys(PAYROLL_STATUS_META).map(s => `<option value="${s}" ${editing?.estado === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Fecha de pago</label>
          <input type="date" name="fechaPago" value="${editing?.fechaPago || ''}">
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-payroll">${editing ? 'Guardar cambios' : 'Crear liquidación'}</button>
    `,
  });

  modal.querySelector('#save-payroll').addEventListener('click', async () => {
    const form = modal.querySelector('#payroll-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      employeeId: fd.get('employeeId'),
      periodo: fd.get('periodo'),
      salarioBase: Number(fd.get('salarioBase')),
      bonos: Number(fd.get('bonos') || 0),
      descuentos: Number(fd.get('descuentos') || 0),
      estado: fd.get('estado'),
      fechaPago: fd.get('fechaPago') || null,
    };
    try {
      if (editing) {
        await Store.updatePayrollRecord(editing.id, data);
        toast('Liquidación actualizada correctamente.', 'success');
      } else {
        await Store.addPayrollRecord(data);
        toast('Liquidación creada correctamente.', 'success');
      }
      closeModal();
      renderPayrollTable();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar la liquidación.', 'error');
    }
  });
}

async function handleDeletePayroll(id) {
  const confirmed = await confirmDialog('Vas a eliminar esta liquidación. Esta acción no se puede deshacer.');
  if (!confirmed) return;
  await Store.deletePayrollRecord(id);
  toast('Liquidación eliminada.', 'success');
  renderPayrollTable();
  document.dispatchEvent(new CustomEvent('data:changed'));
}

// ===================== Vacaciones y Licencias =====================
function renderVacationsTable() {
  const wrap = document.getElementById('sub-vacaciones');
  const vacations = Store.getVacations().sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));

  wrap.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-vacation">${icon('plus')} Nueva solicitud</button>
    </div>
    <div class="table-wrap">
      ${vacations.length === 0 ? `
        <div class="empty-state">${icon('calendar')}<p><strong>No hay solicitudes registradas</strong></p></div>
      ` : `
        <table>
          <thead>
            <tr><th>Empleado</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${vacations.map(v => {
              const emp = Store.getEmployee(v.employeeId);
              const meta = VACATION_STATUS_META[v.estado] || VACATION_STATUS_META['Pendiente'];
              const dias = daysBetween(v.fechaInicio, v.fechaFin) + 1;
              return `
                <tr>
                  <td>${emp ? `<div class="person-cell"><div class="avatar">${initials(emp.nombre, emp.apellido)}</div><span class="cell-main">${escapeHtml(fullName(emp))}</span></div>` : '<em>Empleado eliminado</em>'}</td>
                  <td>${escapeHtml(v.tipo)}</td>
                  <td>${formatDate(v.fechaInicio)}</td>
                  <td>${formatDate(v.fechaFin)}</td>
                  <td>${dias}</td>
                  <td><span class="badge ${meta.cls}">${meta.label}</span></td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm" data-action="edit-vacation" data-id="${v.id}" title="Editar">${icon('edit')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="delete-vacation" data-id="${v.id}" title="Eliminar">${icon('trash')}</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  wrap.querySelector('#btn-new-vacation').addEventListener('click', () => openVacationForm());
  wrap.querySelectorAll('[data-action="edit-vacation"]').forEach(btn =>
    btn.addEventListener('click', () => openVacationForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete-vacation"]').forEach(btn =>
    btn.addEventListener('click', () => handleDeleteVacation(btn.dataset.id)));
}

function openVacationForm(id) {
  const editing = id ? Store.getVacation(id) : null;
  const modal = openModal({
    title: editing ? 'Editar solicitud' : 'Nueva solicitud de vacaciones/licencia',
    bodyHtml: `
      <form id="vacation-form">
        <div class="field">
          <label>Empleado *</label>
          <select name="employeeId" required>
            <option value="">Seleccionar...</option>
            ${employeeOptions(editing?.employeeId)}
          </select>
        </div>
        <div class="field">
          <label>Tipo *</label>
          <select name="tipo" required>
            ${VACATION_TYPES.map(t => `<option value="${t}" ${editing?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Fecha de inicio *</label>
            <input type="date" name="fechaInicio" required value="${editing?.fechaInicio || ''}">
          </div>
          <div class="field">
            <label>Fecha de fin *</label>
            <input type="date" name="fechaFin" required value="${editing?.fechaFin || ''}">
          </div>
        </div>
        <div class="field">
          <label>Estado</label>
          <select name="estado">
            ${Object.keys(VACATION_STATUS_META).map(s => `<option value="${s}" ${editing?.estado === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Notas</label>
          <textarea name="notas" rows="2">${escapeHtml(editing?.notas || '')}</textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-vacation">${editing ? 'Guardar cambios' : 'Crear solicitud'}</button>
    `,
  });

  modal.querySelector('#save-vacation').addEventListener('click', async () => {
    const form = modal.querySelector('#vacation-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    if (fd.get('fechaFin') < fd.get('fechaInicio')) {
      toast('La fecha de fin no puede ser anterior a la de inicio.', 'error');
      return;
    }
    const data = {
      employeeId: fd.get('employeeId'),
      tipo: fd.get('tipo'),
      fechaInicio: fd.get('fechaInicio'),
      fechaFin: fd.get('fechaFin'),
      estado: fd.get('estado'),
      notas: fd.get('notas') || '',
    };
    try {
      if (editing) {
        await Store.updateVacation(editing.id, data);
        toast('Solicitud actualizada correctamente.', 'success');
      } else {
        await Store.addVacation(data);
        toast('Solicitud creada correctamente.', 'success');
      }
      closeModal();
      renderVacationsTable();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar la solicitud.', 'error');
    }
  });
}

async function handleDeleteVacation(id) {
  const confirmed = await confirmDialog('Vas a eliminar esta solicitud. Esta acción no se puede deshacer.');
  if (!confirmed) return;
  await Store.deleteVacation(id);
  toast('Solicitud eliminada.', 'success');
  renderVacationsTable();
  document.dispatchEvent(new CustomEvent('data:changed'));
}
