import { Store } from './storage.js';
import { icon, escapeHtml, EMPLOYEE_STATUS_META } from './utils.js';

let accounts = [];

export async function renderAccounts() {
  const container = document.getElementById('view-accounts');
  container.innerHTML = `
    <div class="toolbar">
      <div></div>
      <div></div>
    </div>
    <p style="font-size:12.5px;color:var(--text-muted);margin:-6px 0 12px;">Vista de solo lectura. Las cuentas se crean al dar de alta a un empleado; restablecer la contraseña es exclusivo del panel de Soporte.</p>
    <div id="accounts-table-wrap"><div class="empty-state"><p>Cargando cuentas...</p></div></div>
  `;

  try {
    accounts = await Store.getAccounts();
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
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}
