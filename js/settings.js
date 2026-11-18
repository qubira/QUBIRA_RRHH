import { Store } from './storage.js';
import { confirmDialog, toast } from './ui.js';
import { icon, escapeHtml } from './utils.js';

const CATALOG_GROUPS = [
  { key: 'tiposDocumento', label: 'Tipos de documento' },
  { key: 'nacionalidades', label: 'Nacionalidades' },
  { key: 'estadosCiviles', label: 'Estados civiles' },
  { key: 'dominiosEmail', label: 'Dominios de correo' },
  { key: 'tiposAntecedente', label: 'Tipos de antecedente' },
  { key: 'areasTrabajo', label: 'Áreas de trabajo (sigla y nombre oficial)', tipo: 'areas' },
  { key: 'cargos', label: 'Cargos principales (nivel jerárquico)', tipo: 'cargos' },
  { key: 'subcargos', label: 'Sub-cargos', tipo: 'subcargos', parentKey: 'cargos' },
  { key: 'departamentosGeo', label: 'Departamentos (ubicación)' },
  { key: 'provincias', label: 'Provincias', parentKey: 'departamentosGeo' },
  { key: 'distritos', label: 'Distritos', parentKey: 'provincias' },
];

// Áreas: nombre interno -> sigla oficial (igual que en la API)
const CANON = { ORH: 'RRHH', ODN: 'COMERCIAL', OCOS: 'SOPORTE', OTI: 'TI' };
const ETIQUETA = { RRHH: 'ORH', COMERCIAL: 'ODN', SOPORTE: 'OCOS', TI: 'OTI' };
const canon = n => { const a = String(n || '').trim().toUpperCase(); return CANON[a] || a; };
const etiquetaArea = clave => ETIQUETA[clave] || clave;
const NIVELES = ['Director', 'Gerente', 'Jefe de Oficina', 'Coordinador', 'Supervisor / Líder', 'Especialista', 'Analista', 'Asistente / Técnico', 'Practicante'];

// Controles extra al agregar: nivel para cargos; cargo principal y área para sub-cargos
function extraAddHtml(g) {
  if (g.tipo === 'areas') {
    return `<p class="settings-empty" style="margin:0 0 6px;width:100%">La sigla (2 a 5 letras) va en los códigos de documentos y se bloquea cuando ya se usó. El nombre completo se imprime en los membretes.</p>
      <input type="text" id="settings-add-nombrecompleto-${g.key}" placeholder="Nombre completo (ej. Oficina de Logística)" style="flex:1 1 100%">
      <input type="text" id="settings-add-alias-${g.key}" placeholder="Alias, separados por coma (opcional)" style="flex:1 1 100%">`;
  }
  if (g.tipo === 'cargos') {
    return `<select id="settings-add-nivel-${g.key}" aria-label="Nivel jerárquico"><option value="">Nivel…</option>${NIVELES.map((n, i) => `<option value="${i + 1}">N${i + 1} · ${escapeHtml(n)}</option>`).join('')}</select>`;
  }
  if (g.tipo === 'subcargos') {
    const cargos = [...Store.getCatalog('cargos')].sort((a, b) => (a.nivel || 99) - (b.nivel || 99));
    const areas = Store.getCatalog('areasTrabajo');
    return `<select id="settings-add-padre-${g.key}" aria-label="Cargo principal"><option value="">Cargo principal…</option>${cargos.map(c => `<option value="${c.id}">${c.nivel ? 'N' + c.nivel + ' · ' : ''}${escapeHtml(c.nombre)}</option>`).join('')}</select>
      <select id="settings-add-area-${g.key}" aria-label="Área"><option value="">Área…</option>${areas.map(a => `<option value="${escapeHtml(a.nombre)}">${escapeHtml(a.nombre)}</option>`).join('')}</select>`;
  }
  return '';
}

export function renderSettings() {
  const container = document.getElementById('view-settings');
  container.innerHTML = `
    <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 16px;">Aquí se gestionan todas las listas de opciones que aparecen en los formularios (los botones "+"). Puedes renombrar o eliminar cualquier valor.</p>
    <div class="settings-grid">
      ${CATALOG_GROUPS.map(g => `
        <div class="settings-card" id="settings-card-${g.key}">
          <div class="settings-card__header">
            <h3>${escapeHtml(g.label)}</h3>
            <span class="tag" id="settings-count-${g.key}">0</span>
          </div>
          <div class="settings-card__list" id="settings-list-${g.key}"></div>
          <div class="settings-card__add" ${g.tipo ? 'style="flex-wrap:wrap"' : ''}>
            ${extraAddHtml(g)}
            <input type="text" id="settings-add-input-${g.key}" placeholder="${g.tipo === 'areas' ? 'Sigla (ej. OLG)' : 'Agregar nuevo...'}"${g.tipo === 'areas' ? ' maxlength="5" style="text-transform:uppercase"' : ''}>
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

  // Cargos por nivel; sub-cargos agrupados por área y nivel
  const ordenados = [...items].sort((a, b) => group.tipo === 'subcargos'
    ? (etiquetaArea(canon(a.area)).localeCompare(etiquetaArea(canon(b.area))) || (a.nivel || 99) - (b.nivel || 99) || a.nombre.localeCompare(b.nombre))
    : group.tipo === 'cargos' ? (a.nivel || 99) - (b.nivel || 99) : 0);
  let areaPrev = null;
  list.innerHTML = ordenados.map(item => {
    const parent = parentName(group, item);
    let titulo = '';
    if (group.tipo === 'subcargos') {
      const ar = etiquetaArea(canon(item.area)) || 'Sin área';
      if (ar !== areaPrev) { titulo = `<div class="settings-item__parent" style="font-weight:700;margin:10px 0 2px">${escapeHtml(ar)}</div>`; areaPrev = ar; }
    }
    const nivel = item.nivel ? `<span class="tag" title="Nivel jerárquico">N${item.nivel}</span>` : '';
    if (group.tipo === 'areas') return renderArea(item);
    return titulo + renderItem(item, group.tipo === 'subcargos' ? '' : parent, nivel);
  }).join('');
  bindItems(group, list);
}

/* Área: sigla, nombre completo, alias y activa */
function renderArea(a) {
  const sigla = a.sigla || a.nombre;
  const alias = (a.alias || []).join(', ');
  return `
    <div class="settings-item" data-id="${a.id}">
      <div class="settings-item__view" style="flex-wrap:wrap">
        <span class="tag" title="Sigla">${escapeHtml(sigla)}</span>
        <span class="settings-item__name">${escapeHtml(a.nombreCompleto || 'Falta el nombre completo')}</span>
        ${a.activo === false ? '<span class="tag" style="background:#fee2e2;color:#991b1b">Inactiva</span>' : ''}
        ${a.siglaBloqueada ? '<span class="settings-item__parent" title="Ya se usó en códigos de documentos">🔒 sigla en uso</span>' : ''}
        ${alias ? `<span class="settings-item__parent" style="flex-basis:100%">También: ${escapeHtml(alias)}</span>` : ''}
        <div class="settings-item__actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="edit" title="Editar">${icon('edit')}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="delete" title="Eliminar">${icon('trash')}</button>
        </div>
      </div>
      <div class="settings-item__edit" style="display:none;flex-wrap:wrap;gap:6px">
        <input type="text" data-f="sigla" value="${escapeHtml(sigla)}" maxlength="5" style="width:90px;text-transform:uppercase" ${a.siglaBloqueada ? 'disabled title="Ya se usó en códigos: no se puede cambiar"' : ''} aria-label="Sigla">
        <input type="text" data-f="nombreCompleto" value="${escapeHtml(a.nombreCompleto || '')}" placeholder="Nombre completo" style="flex:1 1 220px" aria-label="Nombre completo">
        <input type="text" data-f="alias" value="${escapeHtml(alias)}" placeholder="Alias, separados por coma" style="flex:1 1 100%" aria-label="Alias">
        <label style="font-size:12.5px;display:flex;align-items:center;gap:4px"><input type="checkbox" data-f="activo" ${a.activo === false ? '' : 'checked'}> Activa</label>
        <button type="button" class="btn btn-primary btn-sm" data-action="save">Guardar</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="cancel">Cancelar</button>
      </div>
    </div>`;
}

function renderItem(item, parent, nivel) {
  {
    return `
      <div class="settings-item" data-id="${item.id}">
        <div class="settings-item__view">
          ${nivel}<span class="settings-item__name">${escapeHtml(item.nombre)}</span>
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
  }
}

function bindItems(group, list) {
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
    row.querySelector('[data-action="save"]').addEventListener('click', () => {
      if (group.tipo !== 'areas') return handleRename(group, id, editBox.querySelector('input').value);
      const f = n => editBox.querySelector(`[data-f="${n}"]`);
      const sigla = f('sigla').value.trim().toUpperCase();
      handleRename(group, id, sigla, { sigla, nombreCompleto: f('nombreCompleto').value.trim(), alias: f('alias').value, activo: f('activo').checked });
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => handleDelete(group, id));
  });
}

async function handleAdd(key) {
  const group = CATALOG_GROUPS.find(g => g.key === key);
  const input = document.getElementById(`settings-add-input-${key}`);
  const value = input.value.trim();
  if (!value) return;
  let parentId = null; const extra = {};
  if (group.tipo === 'cargos') {
    extra.nivel = document.getElementById(`settings-add-nivel-${key}`).value;
    if (!extra.nivel) { toast('Elige el nivel jerárquico del cargo.', 'error'); return; }
  }
  if (group.tipo === 'areas') {
    extra.sigla = value.toUpperCase();
    extra.nombreCompleto = document.getElementById(`settings-add-nombrecompleto-${key}`).value.trim();
    extra.alias = document.getElementById(`settings-add-alias-${key}`).value;
    if (!/^[A-Z]{2,5}$/.test(extra.sigla)) { toast('La sigla debe tener de 2 a 5 letras.', 'error'); return; }
    if (!extra.nombreCompleto) { toast('Escribe el nombre completo del área.', 'error'); return; }
  }
  if (group.tipo === 'subcargos') {
    parentId = document.getElementById(`settings-add-padre-${key}`).value;
    extra.area = document.getElementById(`settings-add-area-${key}`).value;
    if (!parentId || !extra.area) { toast('Elige el cargo principal y el área del sub-cargo.', 'error'); return; }
  }
  try {
    await Store.addCatalogItem(key, group.tipo === 'areas' ? extra.sigla : value, parentId, extra);
    input.value = '';
    if (group.tipo === 'areas') ['nombrecompleto', 'alias'].forEach(k => { document.getElementById(`settings-add-${k}-${key}`).value = ''; });
    renderGroup(group);
    if (group.tipo === 'cargos') renderGroup(CATALOG_GROUPS.find(g => g.tipo === 'subcargos'));
    toast('Valor agregado.', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo agregar el valor.', 'error');
  }
}

async function handleRename(group, id, value, extra = {}) {
  const nombre = value.trim();
  if (!nombre) return;
  try {
    await Store.updateCatalogItem(group.key, id, nombre, extra);
    renderGroup(group);
    toast('Valor actualizado.', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo actualizar el valor.', 'error');
  }
}

async function handleDelete(group, id) {
  const hasChildren = group.key === 'departamentosGeo' || group.key === 'provincias';
  const confirmed = await confirmDialog(
    group.tipo === 'areas'
      ? 'Vas a eliminar esta área. Solo se puede si no tiene empleados ni documentos codificados; si los tiene, desactívala (editar → quitar «Activa»).'
      : hasChildren
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
