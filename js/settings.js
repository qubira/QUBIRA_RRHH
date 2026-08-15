import { Store } from './storage.js';
import { confirmDialog, toast } from './ui.js';
import { icon, escapeHtml } from './utils.js';

const CATALOG_GROUPS = [
  { key: 'tiposDocumento', label: 'Tipos de documento' },
  { key: 'nacionalidades', label: 'Nacionalidades' },
  { key: 'estadosCiviles', label: 'Estados civiles' },
  { key: 'dominiosEmail', label: 'Dominios de correo' },
  { key: 'tiposAntecedente', label: 'Tipos de antecedente' },
  { key: 'areasTrabajo', label: 'Áreas de trabajo' },
  { key: 'cargos', label: 'Cargos' },
  { key: 'departamentosGeo', label: 'Departamentos (ubicación)' },
  { key: 'provincias', label: 'Provincias', parentKey: 'departamentosGeo' },
  { key: 'distritos', label: 'Distritos', parentKey: 'provincias' },
];

export function renderSettings() {
  const container = document.getElementById('view-settings');
  container.innerHTML = `
    <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 16px;">Acá se gestionan todas las listas de opciones que aparecen en los formularios (los botones "+"). Podés renombrar o eliminar cualquier valor.</p>
    <div class="settings-grid">
      ${CATALOG_GROUPS.map(g => `
        <div class="settings-card" id="settings-card-${g.key}">
          <div class="settings-card__header">
            <h3>${escapeHtml(g.label)}</h3>
            <span class="tag" id="settings-count-${g.key}">0</span>
          </div>
          <div class="settings-card__list" id="settings-list-${g.key}"></div>
          <div class="settings-card__add">
            <input type="text" id="settings-add-input-${g.key}" placeholder="Agregar nuevo...">
            <button type="button" class="btn btn-secondary btn-sm" data-add="${g.key}">${icon('plus')}</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  CATALOG_GROUPS.forEach(g => renderGroup(g));

  container.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => handleAdd(btn.dataset.add));
  });
  container.querySelectorAll('[id^="settings-add-input-"]').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd(input.id.replace('settings-add-input-', ''));
      }
    });
  });
}

function parentName(group, item) {
  if (!group.parentKey || !item.parentId) return '';
  const parent = Store.getCatalogItem(group.parentKey, item.parentId);
  return parent ? parent.nombre : '';
}

function renderGroup(group) {
  const list = document.getElementById(`settings-list-${group.key}`);
  const count = document.getElementById(`settings-count-${group.key}`);
  const items = Store.getCatalog(group.key);
  count.textContent = items.length;

  if (items.length === 0) {
    list.innerHTML = `<p class="settings-empty">Sin valores todavía.</p>`;
    return;
  }

  list.innerHTML = items.map(item => {
    const parent = parentName(group, item);
    return `
      <div class="settings-item" data-id="${item.id}">
        <div class="settings-item__view">
          <span class="settings-item__name">${escapeHtml(item.nombre)}</span>
          ${parent ? `<span class="settings-item__parent">bajo ${escapeHtml(parent)}</span>` : ''}
          <div class="settings-item__actions">
            <button type="button" class="btn btn-ghost btn-sm" data-action="edit" title="Editar">${icon('edit')}</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="delete" title="Eliminar">${icon('trash')}</button>
          </div>
        </div>
        <div class="settings-item__edit" style="display:none;">
          <input type="text" value="${escapeHtml(item.nombre)}">
          <button type="button" class="btn btn-primary btn-sm" data-action="save">Guardar</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="cancel">Cancelar</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.settings-item').forEach(row => {
    const id = row.dataset.id;
    const viewBox = row.querySelector('.settings-item__view');
    const editBox = row.querySelector('.settings-item__edit');

    row.querySelector('[data-action="edit"]').addEventListener('click', () => {
      viewBox.style.display = 'none';
      editBox.style.display = '';
      editBox.querySelector('input').focus();
    });
    row.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      editBox.style.display = 'none';
      viewBox.style.display = '';
    });
    row.querySelector('[data-action="save"]').addEventListener('click', () => handleRename(group, id, editBox.querySelector('input').value));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => handleDelete(group, id));
  });
}

async function handleAdd(key) {
  const group = CATALOG_GROUPS.find(g => g.key === key);
  const input = document.getElementById(`settings-add-input-${key}`);
  const value = input.value.trim();
  if (!value) return;
  try {
    await Store.addCatalogItem(key, value, null);
    input.value = '';
    renderGroup(group);
    toast('Valor agregado.', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo agregar el valor.', 'error');
  }
}

async function handleRename(group, id, value) {
  const nombre = value.trim();
  if (!nombre) return;
  try {
    await Store.updateCatalogItem(group.key, id, nombre);
    renderGroup(group);
    toast('Valor actualizado.', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo actualizar el valor.', 'error');
  }
}

async function handleDelete(group, id) {
  const hasChildren = group.key === 'departamentosGeo' || group.key === 'provincias';
  const confirmed = await confirmDialog(
    hasChildren
      ? 'Vas a eliminar este valor. Si tiene provincias o distritos debajo, también se eliminarán. Esta acción no se puede deshacer.'
      : 'Vas a eliminar este valor. Si algún empleado lo tiene asignado, quedará sin ese dato. Esta acción no se puede deshacer.'
  );
  if (!confirmed) return;
  try {
    await Store.deleteCatalogItem(group.key, id);
    await Store.refresh();
    CATALOG_GROUPS.forEach(renderGroup);
    toast('Valor eliminado.', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo eliminar el valor.', 'error');
  }
}
