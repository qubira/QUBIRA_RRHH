import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import { icon, escapeHtml, EMPLOYEE_STATUS_META } from './utils.js';

let accounts = [];
let roles = [];

function currentUser() {
  try { return JSON.parse(localStorage.getItem('rrhh_user') || '{}'); }
  catch (_) { return {}; }
}

export async function renderAccounts() {
  const container = document.getElementById('view-accounts');
  container.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-account">${icon('plus')} Nueva cuenta</button>
    </div>
    <div id="accounts-table-wrap"><div class="empty-state"><p>Cargando cuentas...</p></div></div>
  `;
  document.getElementById('btn-new-account').addEventListener('click', () => openAccountForm());

  try {
    [accounts, roles] = await Promise.all([Store.getAccounts(), Store.getAccountRoles()]);
    renderTable();
  } catch (err) {
    document.getElementById('accounts-table-wrap').innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          ${icon('alert-triangle')}
          <p><strong>No se pudieron cargar las cuentas</strong></p>
          <p>${escapeHtml(err.message || '')}</p>
        </div>
      </div>
    `;
  }
}

function renderTable() {
  const wrap = document.getElementById('accounts-table-wrap');
  const me = currentUser();

  if (accounts.length === 0) {
    wrap.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          ${icon('users')}
          <p><strong>No hay cuentas registradas</strong></p>
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
            <th>Nombre</th>
            <th>Usuario</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${accounts.map(a => {
            const statusMeta = EMPLOYEE_STATUS_META[a.estado] || EMPLOYEE_STATUS_META.activo;
            return `
            <tr>
              <td class="cell-main">${escapeHtml(`${a.nombre} ${a.apellidos || ''}`.trim())}</td>
              <td>${escapeHtml(a.username)}</td>
              <td>${escapeHtml(a.correo)}</td>
              <td><span class="tag">${escapeHtml(a.rol)}</span></td>
              <td><span class="badge ${statusMeta.cls}">${statusMeta.label}</span></td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${a.id}" title="Editar">${icon('edit')}</button>
                  <button class="btn btn-ghost btn-sm" data-action="toggle" data-id="${a.id}" title="${a.estado === 'activo' ? 'Desactivar' : 'Activar'}" ${a.id === me.id ? 'disabled' : ''}>${icon('user-check')}</button>
                  <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${a.id}" title="Eliminar" ${a.id === me.id ? 'disabled' : ''}>${icon('trash')}</button>
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
    btn.addEventListener('click', () => openAccountForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="toggle"]:not([disabled])').forEach(btn =>
    btn.addEventListener('click', () => handleToggleEstado(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete"]:not([disabled])').forEach(btn =>
    btn.addEventListener('click', () => handleDelete(btn.dataset.id)));
}

function roleOptions(selected) {
  return roles.map(r =>
    `<option value="${escapeHtml(r.nombre)}" ${r.nombre === selected ? 'selected' : ''}>${escapeHtml(r.nombre)} — ${escapeHtml(r.descripcion || '')}</option>`
  ).join('');
}

function openAccountForm(id) {
  const editing = id ? accounts.find(a => String(a.id) === String(id)) : null;

  const modal = openModal({
    title: editing ? 'Editar cuenta' : 'Nueva cuenta',
    bodyHtml: `
      <form id="account-form" class="form-compact">
        <div class="field-row">
          <div class="field">
            <label>Nombre *</label>
            <input type="text" name="nombre" required value="${escapeHtml(editing?.nombre || '')}">
          </div>
          <div class="field">
            <label>Apellidos *</label>
            <input type="text" name="apellidos" required value="${escapeHtml(editing?.apellidos || '')}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Usuario *</label>
            <input type="text" name="username" required value="${escapeHtml(editing?.username || '')}">
          </div>
          <div class="field">
            <label>Correo *</label>
            <input type="email" name="correo" required value="${escapeHtml(editing?.correo || '')}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>DNI</label>
            <input type="text" name="dni" value="${escapeHtml(editing?.dni && editing.dni !== 'undefined' ? editing.dni : '')}">
          </div>
          <div class="field">
            <label>Celular</label>
            <input type="text" name="celular" value="${escapeHtml(editing?.celular || '')}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Rol *</label>
            <select name="rol" required>${roleOptions(editing?.rol)}</select>
          </div>
          <div class="field">
            <label>Estado</label>
            <select name="estado">
              <option value="activo" ${editing?.estado !== 'inactivo' ? 'selected' : ''}>Activo</option>
              <option value="inactivo" ${editing?.estado === 'inactivo' ? 'selected' : ''}>Inactivo</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>${editing ? 'Nueva contraseña (dejar en blanco para no cambiarla)' : 'Contraseña *'}</label>
          <input type="password" name="password" ${editing ? '' : 'required'} minlength="8" placeholder="Mínimo 8 caracteres">
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-account">${editing ? 'Guardar cambios' : 'Crear cuenta'}</button>
    `,
  });

  modal.querySelector('#save-account').addEventListener('click', async () => {
    const form = modal.querySelector('#account-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    if (!data.password) delete data.password;

    try {
      if (editing) {
        const updated = await Store.updateAccount(editing.id, data);
        const i = accounts.findIndex(a => a.id === editing.id);
        if (i >= 0) accounts[i] = { ...accounts[i], ...updated };
        toast('Cuenta actualizada correctamente.', 'success');
      } else {
        const created = await Store.addAccount(data);
        accounts.push({ ...created, rol: data.rol });
        toast('Cuenta creada correctamente.', 'success');
      }
      closeModal();
      renderTable();
    } catch (err) {
      toast(err.message || 'No se pudo guardar la cuenta.', 'error');
    }
  });
}

async function handleToggleEstado(id) {
  const account = accounts.find(a => String(a.id) === String(id));
  if (!account) return;
  const confirmed = await confirmDialog(
    `¿${account.estado === 'activo' ? 'Desactivar' : 'Activar'} la cuenta de <strong>${escapeHtml(account.nombre)}</strong>?`,
    { confirmLabel: account.estado === 'activo' ? 'Desactivar' : 'Activar', danger: account.estado === 'activo' }
  );
  if (!confirmed) return;
  try {
    const res = await Store.toggleAccountEstado(id);
    account.estado = res.estado;
    toast('Estado actualizado.', 'success');
    renderTable();
  } catch (err) {
    toast(err.message || 'No se pudo cambiar el estado.', 'error');
  }
}

async function handleDelete(id) {
  const account = accounts.find(a => String(a.id) === String(id));
  if (!account) return;
  const confirmed = await confirmDialog(
    `Vas a eliminar la cuenta de <strong>${escapeHtml(account.nombre)}</strong>. Esta acción no se puede deshacer.`
  );
  if (!confirmed) return;
  try {
    await Store.deleteAccount(id);
    accounts = accounts.filter(a => String(a.id) !== String(id));
    toast('Cuenta eliminada.', 'success');
    renderTable();
  } catch (err) {
    toast(err.message || 'No se pudo eliminar la cuenta.', 'error');
  }
}
