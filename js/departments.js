import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import { fullName, icon, escapeHtml } from './utils.js';

function employeeOptions(selectedId) {
  return Store.getEmployees().map(e =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(fullName(e))}</option>`
  ).join('');
}

export function renderDepartments() {
  const container = document.getElementById('view-departments');
  container.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-dep">${icon('plus')} Nuevo departamento</button>
    </div>
    <div id="departments-table-wrap"></div>
  `;
  document.getElementById('btn-new-dep').addEventListener('click', () => openDepartmentForm());
  renderTable();
}

function renderTable() {
  const wrap = document.getElementById('departments-table-wrap');
  const departments = Store.getDepartments();
  const employees = Store.getEmployees();

  if (departments.length === 0) {
    wrap.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          ${icon('building')}
          <p><strong>No hay departamentos cargados</strong></p>
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
            <th>Departamento</th>
            <th>Descripción</th>
            <th>Encargado</th>
            <th>Empleados</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${departments.map(dep => {
            const encargado = employees.find(e => e.id === dep.encargadoId);
            const count = employees.filter(e => e.departmentId === dep.id).length;
            return `
              <tr>
                <td class="cell-main">${escapeHtml(dep.nombre)}</td>
                <td>${escapeHtml(dep.descripcion || '—')}</td>
                <td>${encargado ? escapeHtml(fullName(encargado)) : '—'}</td>
                <td><span class="tag">${count}</span></td>
                <td>
                  <div class="table-actions">
                    <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${dep.id}" title="Editar">${icon('edit')}</button>
                    <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${dep.id}" title="Eliminar">${icon('trash')}</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn =>
    btn.addEventListener('click', () => openDepartmentForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn =>
    btn.addEventListener('click', () => handleDelete(btn.dataset.id)));
}

function openDepartmentForm(id) {
  const editing = id ? Store.getDepartment(id) : null;
  const modal = openModal({
    title: editing ? 'Editar departamento' : 'Nuevo departamento',
    bodyHtml: `
      <form id="department-form">
        <div class="field">
          <label>Nombre *</label>
          <input type="text" name="nombre" required value="${escapeHtml(editing?.nombre || '')}">
        </div>
        <div class="field">
          <label>Descripción</label>
          <textarea name="descripcion" rows="3">${escapeHtml(editing?.descripcion || '')}</textarea>
        </div>
        <div class="field">
          <label>Encargado</label>
          <select name="encargadoId">
            <option value="">Sin asignar</option>
            ${employeeOptions(editing?.encargadoId)}
          </select>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-dep">${editing ? 'Guardar cambios' : 'Crear departamento'}</button>
    `,
  });

  modal.querySelector('#save-dep').addEventListener('click', async () => {
    const form = modal.querySelector('#department-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      nombre: fd.get('nombre'),
      descripcion: fd.get('descripcion') || '',
      encargadoId: fd.get('encargadoId') || null,
    };
    try {
      if (editing) {
        await Store.updateDepartment(editing.id, data);
        toast('Departamento actualizado correctamente.', 'success');
      } else {
        await Store.addDepartment(data);
        toast('Departamento creado correctamente.', 'success');
      }
      closeModal();
      renderTable();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar el departamento.', 'error');
    }
  });
}

async function handleDelete(id) {
  const employeesInDep = Store.getEmployees().filter(e => e.departmentId === id).length;
  if (employeesInDep > 0) {
    const confirmed = await confirmDialog(
      `Este departamento tiene <strong>${employeesInDep}</strong> empleado(s) asignado(s). Si lo eliminás, esos empleados quedarán sin departamento. ¿Continuar?`
    );
    if (!confirmed) return;
  } else {
    const confirmed = await confirmDialog('Vas a eliminar este departamento. Esta acción no se puede deshacer.');
    if (!confirmed) return;
  }
  await Store.deleteDepartment(id);
  toast('Departamento eliminado.', 'success');
  renderTable();
  document.dispatchEvent(new CustomEvent('data:changed'));
}
