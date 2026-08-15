import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import {
  formatDate, formatDateTime, fullName, initials, icon, escapeHtml, getClientIp, HIJOS_OPTIONS,
  EMPLOYEE_STATUS_META, CONTRACT_STATUS_META, contractStatus,
} from './utils.js';

let state = { search: '', departmentId: '', estado: '' };

function departmentOptions(selectedId) {
  return Store.getDepartments().map(d =>
    `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${escapeHtml(d.nombre)}</option>`
  ).join('');
}

function catalogOptions(catalogKey, selectedId, parentId) {
  let items = Store.getCatalog(catalogKey);
  if (parentId !== undefined) items = items.filter(i => i.parentId === (parentId || '__sin_padre__'));
  return items.map(i =>
    `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${escapeHtml(i.nombre)}</option>`
  ).join('');
}

function catalogName(catalogKey, id) {
  const item = Store.getCatalogItem(catalogKey, id);
  return item ? item.nombre : '—';
}

// ---------------------------------------------------------------------------
// Datos sensibles — el backend ya devuelve estos campos como "••••••" para
// quien no sea ADG/Gerente. Estos helpers evitan que ese marcador se rompa
// al pasar por formatDate()/catalogName() (que esperan un id o ISO real).
// ---------------------------------------------------------------------------
const MASK = '••••••';
const isMasked = (v) => v === MASK;
function maskedCatalog(catalogKey, id) { return isMasked(id) ? MASK : catalogName(catalogKey, id); }
function maskedDate(iso) { return isMasked(iso) ? MASK : formatDate(iso); }
function maskedText(v, fallback = '—') { return isMasked(v) ? MASK : (v || fallback); }

const SENSITIVE_FIELD_NAMES = [
  'segundoNombre', 'segundoApellido', 'fechaNacimiento',
  'tipoDocumentoId', 'numeroDocumento', 'nacionalidadId', 'estadoCivilId',
  'telefono', 'hijos',
  'departamentoGeoId', 'provinciaId', 'distritoId', 'codigoPostal', 'direccion', 'coordenadas',
  'cuentaAntecedentes', 'tipoAntecedenteId',
  'contactoReferenciaNombre', 'contactoReferenciaTel1', 'contactoReferenciaTel2',
  'observacionesBaja',
];

function employeeEmail(emp) {
  const dom = Store.getCatalogItem('dominiosEmail', emp.emailDominioId);
  if (dom && emp.emailLocal) return `${emp.emailLocal}@${dom.nombre}`;
  return emp.email || '—';
}

function avatarHtml(emp, size = 36) {
  if (emp.foto) {
    return `<div class="avatar avatar--photo" style="width:${size}px;height:${size}px;"><img src="${emp.foto}" alt=""></div>`;
  }
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px;">${initials(emp.nombre, emp.apellido)}</div>`;
}

function resizeImageToDataUrl(file, maxSize = 240) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function jefeInmediatoOptions(selectedId, excludeId) {
  return Store.getEmployees()
    .filter(e => e.id !== excludeId)
    .map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(fullName(e))}</option>`)
    .join('');
}

function getFiltered() {
  const employees = Store.getEmployees();
  const term = state.search.trim().toLowerCase();
  return employees.filter(e => {
    if (state.departmentId && e.departmentId !== state.departmentId) return false;
    if (state.estado && e.estado !== state.estado) return false;
    if (term) {
      const cargo = catalogName('cargos', e.cargoId);
      const haystack = `${fullName(e)} ${e.numeroDocumento || ''} ${employeeEmail(e)} ${cargo}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function renderEmployees() {
  const container = document.getElementById('view-employees');
  container.innerHTML = `
    <div class="toolbar">
      <div class="toolbar__filters">
        <div class="search-box">
          ${icon('search')}
          <input type="text" id="emp-search" placeholder="Buscar por nombre, documento, email o cargo..." value="${escapeHtml(state.search)}">
        </div>
        <select id="emp-filter-dep">
          <option value="">Todos los departamentos</option>
          ${departmentOptions(state.departmentId)}
        </select>
        <select id="emp-filter-estado">
          <option value="">Todos los estados</option>
          <option value="activo" ${state.estado === 'activo' ? 'selected' : ''}>Activo</option>
          <option value="inactivo" ${state.estado === 'inactivo' ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
      <button class="btn btn-primary" id="btn-new-employee">${icon('plus')} Nuevo empleado</button>
    </div>
    <div id="employees-table-wrap"></div>
  `;

  document.getElementById('emp-search').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderTable();
  });
  document.getElementById('emp-filter-dep').addEventListener('change', (e) => {
    state.departmentId = e.target.value;
    renderTable();
  });
  document.getElementById('emp-filter-estado').addEventListener('change', (e) => {
    state.estado = e.target.value;
    renderTable();
  });
  document.getElementById('btn-new-employee').addEventListener('click', () => openEmployeeForm());

  renderTable();
}

function renderTable() {
  const wrap = document.getElementById('employees-table-wrap');
  const list = getFiltered();

  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          ${icon('users')}
          <p><strong>No se encontraron empleados</strong></p>
          <p>Probá ajustar los filtros o crear un nuevo registro.</p>
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
            <th>Cargo</th>
            <th>Departamento</th>
            <th>Ingreso</th>
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

  wrap.querySelectorAll('[data-action="view"]').forEach(btn =>
    btn.addEventListener('click', () => openEmployeeDetail(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="edit"]').forEach(btn =>
    btn.addEventListener('click', () => openEmployeeForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn =>
    btn.addEventListener('click', () => handleDelete(btn.dataset.id)));
}

function rowHtml(emp) {
  const dep = Store.getDepartment(emp.departmentId);
  const statusMeta = EMPLOYEE_STATUS_META[emp.estado] || EMPLOYEE_STATUS_META.activo;
  return `
    <tr>
      <td>
        <div class="person-cell">
          ${avatarHtml(emp, 36)}
          <div>
            <div class="cell-main">${escapeHtml(fullName(emp))}</div>
            <div class="cell-sub">${escapeHtml(employeeEmail(emp))}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(catalogName('cargos', emp.cargoId))}</td>
      <td>${dep ? `<span class="tag">${escapeHtml(dep.nombre)}</span>` : '—'}</td>
      <td>${formatDate(emp.fechaIngreso)}</td>
      <td><span class="badge ${statusMeta.cls}">${statusMeta.label}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-ghost btn-sm" data-action="view" data-id="${emp.id}" title="Ver detalle">${icon('eye')}</button>
          <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${emp.id}" title="Editar">${icon('edit')}</button>
          <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${emp.id}" title="Eliminar">${icon('trash')}</button>
        </div>
      </td>
    </tr>
  `;
}

// ---------------------------------------------------------------------------
// Formulario de alta / edición
// ---------------------------------------------------------------------------

function inlineField(label, required, controlHtml, idAttr = '') {
  return `
    <div class="field field--inline" ${idAttr}>
      <label>${label}${required ? ' *' : ''}</label>
      <div class="field-control">${controlHtml}</div>
    </div>
  `;
}

function catalogFieldHtml({ label, name, catalogKey, selectedId, required = true, addable = true, parentId }) {
  const opts = catalogOptions(catalogKey, selectedId, parentId);
  const control = `
    <div class="field-add-row">
      <select name="${name}" ${required ? 'required' : ''}>
        <option value="">Seleccionar...</option>
        ${opts}
      </select>
      ${addable ? `<button type="button" class="btn btn-secondary btn-sm btn-add-catalog" data-add-catalog="${name}" data-catalog-key="${catalogKey}" title="Agregar nuevo">${icon('plus')}</button>` : ''}
    </div>
    ${addable ? `
    <div class="catalog-add-inline" data-add-panel="${name}">
      <input type="text" data-add-input="${name}" placeholder="Nuevo valor...">
      <button type="button" class="btn btn-primary btn-sm" data-confirm-add="${name}" data-catalog-key="${catalogKey}">Agregar</button>
      <button type="button" class="btn btn-secondary btn-sm" data-cancel-add="${name}">Cancelar</button>
    </div>` : ''}
  `;
  return inlineField(label, required, control, `id="field-${name}"`);
}

function openEmployeeForm(id) {
  const editing = id ? Store.getEmployee(id) : null;
  const hayAntecedentes = editing?.cuentaAntecedentes === 'Si';
  const inactivo = editing ? editing.estado === 'inactivo' : false;

  const modal = openModal({
    title: editing ? 'Editar empleado' : 'Nuevo empleado',
    size: 'lg',
    bodyHtml: `
      <form id="employee-form" class="form-compact">
        ${editing && !Store.isPrivileged() ? `
          <div class="unlock-bar" id="unlock-bar">
            ${icon('lock')}
            <span>Los datos sensibles están protegidos. Podés editar los campos generales sin restricción.</span>
            <input type="password" id="unlock-password" placeholder="Tu contraseña">
            <button type="button" class="btn btn-primary btn-sm" id="unlock-btn">Desbloquear para editar</button>
          </div>
        ` : ''}
        <div class="subsection-title">${icon('users')} Datos personales</div>
        <div class="employee-photo-row">
          <div class="employee-photo-upload" id="photo-upload-box" title="Subir foto">
            <img id="photo-preview" src="${editing?.foto || ''}" style="${editing?.foto ? '' : 'display:none;'}">
            <div id="photo-placeholder" style="${editing?.foto ? 'display:none;' : ''}">${icon('upload')}<span>Foto</span></div>
            <input type="file" accept="image/*" id="photo-input" style="display:none;">
          </div>
          <div class="employee-photo-fields">
            ${inlineField('Primer nombre', true, `<input type="text" name="primerNombre" required value="${escapeHtml(editing?.primerNombre || '')}">`)}
            ${inlineField('Segundo nombre', false, `<input type="text" name="segundoNombre" value="${escapeHtml(editing?.segundoNombre || '')}">`)}
            ${inlineField('Primer apellido', true, `<input type="text" name="primerApellido" required value="${escapeHtml(editing?.primerApellido || '')}">`)}
            ${inlineField('Segundo apellido', true, `<input type="text" name="segundoApellido" required value="${escapeHtml(editing?.segundoApellido || '')}">`)}
            ${inlineField('Fecha de nacimiento', false, `<input type="date" name="fechaNacimiento" value="${editing?.fechaNacimiento || ''}">`)}
          </div>
        </div>
        <input type="hidden" name="foto" id="foto-hidden" value="${escapeHtml(editing?.foto || '')}">

        <div class="subsection-title">${icon('file-text')} Identificación</div>
        ${catalogFieldHtml({ label: 'Tipo de documento', name: 'tipoDocumentoId', catalogKey: 'tiposDocumento', selectedId: editing?.tipoDocumentoId })}
        ${inlineField('Número de documento', true, `<input type="text" name="numeroDocumento" required value="${escapeHtml(editing?.numeroDocumento || '')}">`)}
        ${catalogFieldHtml({ label: 'Nacionalidad', name: 'nacionalidadId', catalogKey: 'nacionalidades', selectedId: editing?.nacionalidadId })}
        ${catalogFieldHtml({ label: 'Estado civil', name: 'estadoCivilId', catalogKey: 'estadosCiviles', selectedId: editing?.estadoCivilId })}

        <div class="subsection-title">${icon('message-circle')} Contacto</div>
        ${inlineField('Correo electrónico', true, `
          <div class="field-add-row">
            <input type="text" name="emailLocal" required placeholder="usuario" value="${escapeHtml(editing?.emailLocal || '')}" style="flex:1;">
            <span style="color:var(--text-muted);">@</span>
            <select name="emailDominioId" required style="flex:1;">
              <option value="">Dominio...</option>
              ${catalogOptions('dominiosEmail', editing?.emailDominioId)}
            </select>
            <button type="button" class="btn btn-secondary btn-sm btn-add-catalog" data-add-catalog="emailDominioId" data-catalog-key="dominiosEmail" title="Agregar nuevo">${icon('plus')}</button>
          </div>
          <div class="catalog-add-inline" data-add-panel="emailDominioId">
            <input type="text" data-add-input="emailDominioId" placeholder="Nuevo dominio...">
            <button type="button" class="btn btn-primary btn-sm" data-confirm-add="emailDominioId" data-catalog-key="dominiosEmail">Agregar</button>
            <button type="button" class="btn btn-secondary btn-sm" data-cancel-add="emailDominioId">Cancelar</button>
          </div>
        `, 'id="field-emailDominioId"')}
        ${inlineField('Número de contacto', true, `<input type="text" name="telefono" required value="${escapeHtml(editing?.telefono || '')}">`)}
        ${inlineField('Cantidad de hijos', true, `
          <select name="hijos" required>
            <option value="">Seleccionar...</option>
            ${HIJOS_OPTIONS.map(h => `<option value="${h}" ${editing?.hijos === h ? 'selected' : ''}>${h}</option>`).join('')}
          </select>
        `)}

        <div class="subsection-title">${icon('building')} Domicilio</div>
        ${catalogFieldHtml({ label: 'Departamento', name: 'departamentoGeoId', catalogKey: 'departamentosGeo', selectedId: editing?.departamentoGeoId })}
        ${catalogFieldHtml({ label: 'Provincia', name: 'provinciaId', catalogKey: 'provincias', selectedId: editing?.provinciaId, parentId: editing?.departamentoGeoId || '' })}
        ${catalogFieldHtml({ label: 'Distrito', name: 'distritoId', catalogKey: 'distritos', selectedId: editing?.distritoId, parentId: editing?.provinciaId || '' })}
        ${inlineField('Código postal', true, `<input type="text" name="codigoPostal" required value="${escapeHtml(editing?.codigoPostal || '')}">`)}
        ${inlineField('Dirección', true, `<input type="text" name="direccion" required value="${escapeHtml(editing?.direccion || '')}">`)}
        ${inlineField('Coordenadas', true, `<input type="text" name="coordenadas" required placeholder="lat, long" value="${escapeHtml(editing?.coordenadas || '')}">`)}

        <div class="subsection-title">${icon('alert-triangle')} Antecedentes</div>
        ${inlineField('¿Cuenta con antecedentes?', true, `
          <select name="cuentaAntecedentes" required id="select-cuenta-antecedentes">
            <option value="">Seleccionar...</option>
            <option value="No" ${editing?.cuentaAntecedentes === 'No' ? 'selected' : ''}>No</option>
            <option value="Si" ${editing?.cuentaAntecedentes === 'Si' ? 'selected' : ''}>Sí</option>
          </select>
        `)}
        ${catalogFieldHtml({ label: 'Tipo de antecedente', name: 'tipoAntecedenteId', catalogKey: 'tiposAntecedente', selectedId: editing?.tipoAntecedenteId, required: hayAntecedentes })}

        <div class="subsection-title">${icon('briefcase')} Datos laborales</div>
        ${inlineField('Departamento (organización)', true, `
          <select name="departmentId" required>
            <option value="">Seleccionar...</option>
            ${departmentOptions(editing?.departmentId)}
          </select>
        `)}
        ${catalogFieldHtml({ label: 'Área de trabajo', name: 'areaTrabajoId', catalogKey: 'areasTrabajo', selectedId: editing?.areaTrabajoId })}
        ${catalogFieldHtml({ label: 'Cargo', name: 'cargoId', catalogKey: 'cargos', selectedId: editing?.cargoId })}
        ${inlineField('Jefe inmediato', false, `
          <select name="jefeInmediatoId">
            <option value="">Sin jefe asignado</option>
            ${jefeInmediatoOptions(editing?.jefeInmediatoId, editing?.id)}
          </select>
        `)}
        ${inlineField('Fecha de ingreso', true, `<input type="date" name="fechaIngreso" required value="${editing?.fechaIngreso || ''}">`)}

        <div class="subsection-title">${icon('user-check')} Usuario y contraseña</div>
        ${editing
          ? `<p style="font-size:12px;color:var(--text-muted);margin:2px 0 10px;">${editing.usuario
              ? `Cuenta de acceso: <strong>${escapeHtml(editing.usuario)}</strong>. La contraseña solo puede restablecerla Soporte.`
              : 'Este colaborador no tiene cuenta de acceso creada.'}</p>`
          : `
            <p style="font-size:12px;color:var(--text-muted);margin:2px 0 10px;">Opcional: si completas ambos campos, se crea una cuenta real para que el colaborador pueda loguearse en los sistemas de Qubira. Una vez creada, solo Soporte podrá cambiar la contraseña.</p>
            ${inlineField('Usuario', false, `<input type="text" name="usuario" autocomplete="off" placeholder="usuario.apellido">`)}
            ${inlineField('Contraseña', false, `<input type="password" name="contrasena" autocomplete="new-password" minlength="8" placeholder="Mínimo 8 caracteres">`)}
          `}

        <div class="subsection-title">${icon('user-check')} Contacto de referencia</div>
        ${inlineField('Nombre de contacto de referencia', true, `<input type="text" name="contactoReferenciaNombre" required value="${escapeHtml(editing?.contactoReferenciaNombre || '')}">`)}
        ${inlineField('Primer número móvil de referencia', true, `<input type="text" name="contactoReferenciaTel1" required value="${escapeHtml(editing?.contactoReferenciaTel1 || '')}">`)}
        ${inlineField('Segundo número móvil de referencia', true, `<input type="text" name="contactoReferenciaTel2" required value="${escapeHtml(editing?.contactoReferenciaTel2 || '')}">`)}

        <div class="subsection-title">${icon('check-circle')} Estado</div>
        ${inlineField('Estado', true, `
          <select name="estado" required id="select-estado">
            <option value="activo" ${editing?.estado === 'activo' || !editing ? 'selected' : ''}>Activo</option>
            <option value="inactivo" ${editing?.estado === 'inactivo' ? 'selected' : ''}>Inactivo</option>
          </select>
        `)}
        ${inlineField(`Observaciones de baja`, inactivo, `<input type="text" name="observacionesBaja" ${inactivo ? 'required' : ''} value="${escapeHtml(editing?.observacionesBaja || '')}">`, 'id="field-observacionesBaja"')}
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-employee">${editing ? 'Guardar cambios' : 'Crear empleado'}</button>
    `,
  });

  wireEmployeeForm(modal, editing);
}

function toggleConditionalField(form, { triggerSelector, fieldId, fieldName, showWhen }) {
  const trigger = form.querySelector(triggerSelector);
  const fieldWrap = form.querySelector(`#${fieldId}`);
  const input = fieldWrap.querySelector(`[name="${fieldName}"]`);
  const apply = () => {
    const show = showWhen(trigger.value);
    fieldWrap.style.display = show ? '' : 'none';
    if (show) input.setAttribute('required', 'required'); else input.removeAttribute('required');
  };
  trigger.addEventListener('change', apply);
  apply();
}

function wireEmployeeForm(modal, editing) {
  const form = modal.querySelector('#employee-form');
  form.unlockedPassword = null;

  if (editing && !Store.isPrivileged()) {
    SENSITIVE_FIELD_NAMES.forEach(name => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.disabled = true;
    });

    const unlockBtn = form.querySelector('#unlock-btn');
    const unlockInput = form.querySelector('#unlock-password');
    const doUnlock = async () => {
      const password = unlockInput.value;
      if (!password) return;
      unlockBtn.disabled = true;
      try {
        const unmasked = await Store.unlockEmployee(editing.id, password);
        SENSITIVE_FIELD_NAMES.forEach(name => {
          const el = form.querySelector(`[name="${name}"]`);
          if (!el) return;
          el.disabled = false;
          if (unmasked[name] != null) el.value = unmasked[name];
        });
        form.unlockedPassword = password;
        form.querySelector('#unlock-bar').innerHTML = `${icon('check-circle')} <span>Datos desbloqueados para editar.</span>`;
        form.querySelector('#select-cuenta-antecedentes')?.dispatchEvent(new Event('change'));
        toast('Datos desbloqueados.', 'success');
      } catch (err) {
        toast(err.message || 'No se pudo verificar la contraseña.', 'error');
        unlockBtn.disabled = false;
      }
    };
    unlockBtn.addEventListener('click', doUnlock);
    unlockInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doUnlock(); } });
  }

  const photoBox = form.querySelector('#photo-upload-box');
  const photoInput = form.querySelector('#photo-input');
  const photoPreview = form.querySelector('#photo-preview');
  const photoPlaceholder = form.querySelector('#photo-placeholder');
  const photoHidden = form.querySelector('#foto-hidden');
  photoBox.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;

    /* Vista previa instantánea local mientras se sube la imagen real */
    const dataUrl = await resizeImageToDataUrl(file);
    photoPreview.src = dataUrl;
    photoPreview.style.display = '';
    photoPlaceholder.style.display = 'none';

    photoBox.classList.add('is-uploading');
    form.pendingFotoUpload = Store.uploadFoto(file)
      .then((url) => { photoHidden.value = url; })
      .catch((err) => {
        toast(err.message || 'No se pudo subir la foto.', 'error');
        photoHidden.value = '';
      })
      .finally(() => { photoBox.classList.remove('is-uploading'); form.pendingFotoUpload = null; });
  });

  toggleConditionalField(form, {
    triggerSelector: '#select-cuenta-antecedentes',
    fieldId: 'field-tipoAntecedenteId',
    fieldName: 'tipoAntecedenteId',
    showWhen: (v) => v === 'Si',
  });
  toggleConditionalField(form, {
    triggerSelector: '#select-estado',
    fieldId: 'field-observacionesBaja',
    fieldName: 'observacionesBaja',
    showWhen: (v) => v === 'inactivo',
  });

  // Cascada de ubicación: departamento -> provincia -> distrito
  const depGeoSelect = form.querySelector('select[name="departamentoGeoId"]');
  const provSelect = form.querySelector('select[name="provinciaId"]');
  const distSelect = form.querySelector('select[name="distritoId"]');

  function repopulate(select, catalogKey, parentId, keepSelected) {
    select.innerHTML = `<option value="">Seleccionar...</option>${catalogOptions(catalogKey, keepSelected, parentId)}`;
  }

  depGeoSelect.addEventListener('change', (e) => {
    repopulate(provSelect, 'provincias', e.target.value, '');
    repopulate(distSelect, 'distritos', '', '');
  });
  provSelect.addEventListener('change', (e) => {
    repopulate(distSelect, 'distritos', e.target.value, '');
  });

  // Botones "+" de catálogos (delegado a nivel de formulario)
  form.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-add-catalog]');
    if (addBtn) {
      const panel = form.querySelector(`[data-add-panel="${addBtn.dataset.addCatalog}"]`);
      panel.classList.add('active');
      panel.querySelector('input').focus();
      return;
    }
    const cancelBtn = e.target.closest('[data-cancel-add]');
    if (cancelBtn) {
      const panel = form.querySelector(`[data-add-panel="${cancelBtn.dataset.cancelAdd}"]`);
      panel.classList.remove('active');
      panel.querySelector('input').value = '';
      return;
    }
    const confirmBtn = e.target.closest('[data-confirm-add]');
    if (confirmBtn) {
      const target = confirmBtn.dataset.confirmAdd;
      const catalogKey = confirmBtn.dataset.catalogKey;
      const panel = form.querySelector(`[data-add-panel="${target}"]`);
      const input = panel.querySelector('input');
      const value = input.value.trim();
      if (!value) return;

      let parentId = null;
      if (target === 'provinciaId') parentId = depGeoSelect.value || null;
      if (target === 'distritoId') parentId = provSelect.value || null;
      if ((target === 'provinciaId' || target === 'distritoId') && !parentId) {
        toast('Primero seleccioná el nivel superior antes de agregar.', 'error');
        return;
      }

      try {
        const item = await Store.addCatalogItem(catalogKey, value, parentId);
        const select = form.querySelector(`select[name="${target}"]`);
        select.insertAdjacentHTML('beforeend', `<option value="${item.id}">${escapeHtml(value)}</option>`);
        select.value = item.id;
        panel.classList.remove('active');
        input.value = '';
        toast('Elemento agregado al catálogo.', 'success');
      } catch (err) {
        toast(err.message || 'No se pudo agregar el elemento.', 'error');
      }
    }
  });

  modal.querySelector('#save-employee').addEventListener('click', async () => {
    if (!form.reportValidity()) return;

    if (!editing) {
      const usuarioField = form.querySelector('input[name="usuario"]');
      const contrasenaField = form.querySelector('input[name="contrasena"]');
      if (usuarioField.value.trim() && !contrasenaField.value) {
        toast('Escribe una contraseña para crear la cuenta de acceso.', 'error');
        return;
      }
      if (!usuarioField.value.trim() && contrasenaField.value) {
        toast('Escribe el nombre de usuario para poder crear la cuenta.', 'error');
        return;
      }
    }

    const saveBtn = modal.querySelector('#save-employee');
    saveBtn.disabled = true;
    if (form.pendingFotoUpload) {
      saveBtn.textContent = 'Subiendo foto...';
      await form.pendingFotoUpload;
      saveBtn.textContent = editing ? 'Guardar cambios' : 'Crear empleado';
    }
    const ip = await getClientIp();
    const data = Object.fromEntries(new FormData(form).entries());
    data.nombre = data.primerNombre;
    data.apellido = data.primerApellido;
    data.email = employeeEmail({ emailLocal: data.emailLocal, emailDominioId: data.emailDominioId });
    if (form.unlockedPassword) data.password = form.unlockedPassword;
    const sessionUser = JSON.parse(localStorage.getItem('rrhh_user') || 'null');
    const meta = { usuario: sessionUser ? `${sessionUser.nombre} ${sessionUser.apellidos || ''}`.trim() : 'Administrador', ip };

    try {
      if (editing) {
        await Store.updateEmployee(editing.id, data, meta);
        toast('Empleado actualizado correctamente.', 'success');
      } else {
        await Store.addEmployee({ ...data, estado: data.estado || 'activo' }, meta);
        toast('Empleado creado correctamente.', 'success');
      }
      closeModal();
      renderTable();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar el empleado.', 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

async function handleDelete(id) {
  const emp = Store.getEmployee(id);
  if (!emp) return;
  const confirmed = await confirmDialog(
    `Vas a eliminar a <strong>${escapeHtml(fullName(emp))}</strong>. También se eliminarán sus contratos, documentos y su historial de cambios. Esta acción no se puede deshacer.`
  );
  if (!confirmed) return;
  await Store.deleteEmployee(id);
  toast('Empleado eliminado.', 'success');
  renderTable();
  document.dispatchEvent(new CustomEvent('data:changed'));
}

// ---------------------------------------------------------------------------
// Ficha de detalle + historial de auditoría
// ---------------------------------------------------------------------------

function buildDetailBody(emp) {
  const dep = Store.getDepartment(emp.departmentId);
  const jefe = emp.jefeInmediatoId ? Store.getEmployee(emp.jefeInmediatoId) : null;
  const contracts = Store.getContractsByEmployee(emp.id);
  const documents = Store.getDocumentsByEmployee(emp.id);
  const auditEntries = Store.getAuditLogByEmployee(emp.id);
  const statusMeta = EMPLOYEE_STATUS_META[emp.estado] || EMPLOYEE_STATUS_META.activo;
  const locked = !Store.isPrivileged() && isMasked(emp.numeroDocumento || emp.telefono || emp.direccion);

  return `
    <div class="person-cell" style="margin-bottom:18px;">
      ${avatarHtml(emp, 52)}
      <div>
        <div style="font-size:16px;font-weight:700;">${escapeHtml(fullName(emp))}</div>
        <div class="cell-sub">${escapeHtml(catalogName('cargos', emp.cargoId))} · <span class="badge ${statusMeta.cls}">${statusMeta.label}</span></div>
      </div>
    </div>
    ${locked ? `
      <div class="unlock-bar" id="unlock-bar">
        ${icon('lock')}
        <span>Los datos sensibles de este empleado están protegidos.</span>
        <input type="password" id="unlock-password" placeholder="Tu contraseña">
        <button type="button" class="btn btn-primary btn-sm" id="unlock-btn">Ver datos completos</button>
      </div>
    ` : ''}
    <dl class="detail-grid">
      <div class="detail-item"><dt>Documento</dt><dd>${maskedCatalog('tiposDocumento', emp.tipoDocumentoId)} ${escapeHtml(maskedText(emp.numeroDocumento))}</dd></div>
      <div class="detail-item"><dt>Nacionalidad</dt><dd>${maskedCatalog('nacionalidades', emp.nacionalidadId)}</dd></div>
      <div class="detail-item"><dt>Estado civil</dt><dd>${maskedCatalog('estadosCiviles', emp.estadoCivilId)}</dd></div>
      <div class="detail-item"><dt>Hijos</dt><dd>${escapeHtml(maskedText(emp.hijos))}</dd></div>
      <div class="detail-item"><dt>Email</dt><dd>${escapeHtml(employeeEmail(emp))}</dd></div>
      <div class="detail-item"><dt>Teléfono</dt><dd>${escapeHtml(maskedText(emp.telefono))}</dd></div>
      <div class="detail-item"><dt>Fecha de nacimiento</dt><dd>${maskedDate(emp.fechaNacimiento)}</dd></div>
      <div class="detail-item"><dt>Dirección</dt><dd>${escapeHtml(maskedText(emp.direccion))}</dd></div>
      <div class="detail-item"><dt>Ubicación</dt><dd>${isMasked(emp.distritoId) ? MASK : `${maskedCatalog('distritos', emp.distritoId)}, ${maskedCatalog('provincias', emp.provinciaId)}, ${maskedCatalog('departamentosGeo', emp.departamentoGeoId)}`}</dd></div>
      <div class="detail-item"><dt>Código postal</dt><dd>${escapeHtml(maskedText(emp.codigoPostal))}</dd></div>
      <div class="detail-item"><dt>Coordenadas</dt><dd>${escapeHtml(maskedText(emp.coordenadas))}</dd></div>
      <div class="detail-item"><dt>Antecedentes</dt><dd>${isMasked(emp.cuentaAntecedentes) ? MASK : (emp.cuentaAntecedentes === 'Si' ? maskedCatalog('tiposAntecedente', emp.tipoAntecedenteId) : 'No')}</dd></div>
      <div class="detail-item"><dt>Departamento</dt><dd>${dep ? escapeHtml(dep.nombre) : '—'}</dd></div>
      <div class="detail-item"><dt>Área de trabajo</dt><dd>${maskedCatalog('areasTrabajo', emp.areaTrabajoId)}</dd></div>
      <div class="detail-item"><dt>Jefe inmediato</dt><dd>${jefe ? escapeHtml(fullName(jefe)) : '—'}</dd></div>
      <div class="detail-item"><dt>Fecha de ingreso</dt><dd>${formatDate(emp.fechaIngreso)}</dd></div>
      <div class="detail-item"><dt>Usuario de acceso</dt><dd>${escapeHtml(emp.usuario || 'Sin cuenta creada')}</dd></div>
      <div class="detail-item"><dt>Contacto de referencia</dt><dd>${escapeHtml(maskedText(emp.contactoReferenciaNombre))} ${escapeHtml(isMasked(emp.contactoReferenciaTel1) ? '' : (emp.contactoReferenciaTel1 || ''))}</dd></div>
      ${emp.estado === 'inactivo' ? `<div class="detail-item"><dt>Observaciones de baja</dt><dd>${escapeHtml(maskedText(emp.observacionesBaja))}</dd></div>` : ''}
    </dl>

    <div class="subsection-title">${icon('file-text')} Contratos (${contracts.length})</div>
    <div class="mini-list">
      ${contracts.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">Sin contratos registrados.</p>' :
        contracts.map(c => {
          const meta = CONTRACT_STATUS_META[contractStatus(c)];
          return `<div class="mini-row"><span>${escapeHtml(c.tipo)} — ${formatDate(c.fechaInicio)} a ${c.fechaFin ? formatDate(c.fechaFin) : 'Indefinido'}</span><span class="badge ${meta.cls}">${meta.label}</span></div>`;
        }).join('')}
    </div>

    <div class="subsection-title">${icon('folder')} Documentos (${documents.length})</div>
    <div class="mini-list">
      ${documents.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">Sin documentos cargados.</p>' :
        documents.map(d => `<div class="mini-row"><span>${escapeHtml(d.categoria)} — ${escapeHtml(d.nombreArchivo)}</span><span class="cell-sub">${formatDate(d.fechaSubida)}</span></div>`).join('')}
    </div>

    <div class="subsection-title">${icon('edit')} Historial de cambios — ${auditEntries.length} modificación(es)</div>
    ${auditEntries.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">Todavía no se registraron cambios sobre este empleado.</p>' : `
    <div class="audit-table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th>Fecha y hora</th>
            <th>Usuario</th>
            <th>Campo</th>
            <th>Valor anterior</th>
            <th>Valor nuevo</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          ${auditEntries.map(a => `
            <tr>
              <td>${formatDateTime(a.fecha)}</td>
              <td>${escapeHtml(a.usuario)}</td>
              <td>${escapeHtml(a.campo)}</td>
              <td>${escapeHtml(maskedText(a.valorAnterior))}</td>
              <td>${escapeHtml(maskedText(a.valorNuevo))}</td>
              <td>${escapeHtml(a.ip)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}
  `;
}

function wireDetailUnlock(modal, emp) {
  const btn = modal.querySelector('#unlock-btn');
  if (!btn) return;
  const input = modal.querySelector('#unlock-password');
  const doUnlock = async () => {
    const password = input.value;
    if (!password) return;
    btn.disabled = true;
    try {
      const unmasked = await Store.unlockEmployee(emp.id, password);
      modal.querySelector('.modal__body').innerHTML = buildDetailBody(unmasked);
      wireDetailUnlock(modal, unmasked);
    } catch (err) {
      toast(err.message || 'No se pudo verificar la contraseña.', 'error');
      btn.disabled = false;
    }
  };
  btn.addEventListener('click', doUnlock);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doUnlock(); } });
}

function openEmployeeDetail(id) {
  const emp = Store.getEmployee(id);
  if (!emp) return;

  const modal = openModal({
    title: 'Ficha del empleado',
    size: 'lg',
    bodyHtml: buildDetailBody(emp),
    footerHtml: `<button class="btn btn-secondary" data-close>Cerrar</button>`,
  });
  wireDetailUnlock(modal, emp);
}
