import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import {
  formatDate, fullName, icon, escapeHtml, average,
  SURVEY_STATUS_META, CONFLICT_STATUS_META, scoreBadgeClass,
} from './utils.js';

const CONFLICT_TYPES = ['Conflicto interpersonal', 'Queja', 'Acoso', 'Otro'];

let activeTab = 'surveys';

function employeeOptions(selectedId) {
  return Store.getEmployees().map(e =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(fullName(e))}</option>`
  ).join('');
}

export function renderClimate() {
  const container = document.getElementById('view-climate');
  container.innerHTML = `
    <div class="subtabs">
      <button class="subtab" data-tab="surveys">${icon('smile')} Encuestas de Clima</button>
      <button class="subtab" data-tab="conflicts">${icon('message-circle')} Casos y Conflictos</button>
    </div>
    <div class="subview" id="sub-surveys"></div>
    <div class="subview" id="sub-conflicts"></div>
  `;
  container.querySelectorAll('.subtab').forEach(tab =>
    tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  switchTab(activeTab);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#view-climate .subtab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('#view-climate .subview').forEach(v => v.classList.remove('active'));
  document.getElementById(`sub-${tab}`).classList.add('active');
  if (tab === 'surveys') renderSurveys();
  else renderConflicts();
}

// ===================== Encuestas de Clima =====================
function renderSurveys() {
  const wrap = document.getElementById('sub-surveys');
  const surveys = Store.getClimateSurveys().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  wrap.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-survey">${icon('plus')} Nueva encuesta</button>
    </div>
    <div class="table-wrap">
      ${surveys.length === 0 ? `
        <div class="empty-state">${icon('smile')}<p><strong>No hay encuestas registradas</strong></p></div>
      ` : `
        <table>
          <thead>
            <tr><th>Título</th><th>Fecha</th><th>Respuestas</th><th>Promedio</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${surveys.map(s => {
              const meta = SURVEY_STATUS_META[s.estado] || SURVEY_STATUS_META['Activa'];
              const responses = Store.getResponsesBySurvey(s.id);
              const avg = average(responses.map(r => r.puntaje));
              return `
                <tr>
                  <td class="cell-main">${escapeHtml(s.titulo)}</td>
                  <td>${formatDate(s.fecha)}</td>
                  <td>${responses.length}</td>
                  <td>${avg != null ? `<span class="badge ${scoreBadgeClass(avg)}">${avg.toFixed(1)} / 5</span>` : '<span class="cell-sub">—</span>'}</td>
                  <td><span class="badge ${meta.cls}">${meta.label}</span></td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm" data-action="view-survey" data-id="${s.id}" title="Ver respuestas">${icon('eye')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="edit-survey" data-id="${s.id}" title="Editar">${icon('edit')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="delete-survey" data-id="${s.id}" title="Eliminar">${icon('trash')}</button>
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

  wrap.querySelector('#btn-new-survey').addEventListener('click', () => openSurveyForm());
  wrap.querySelectorAll('[data-action="view-survey"]').forEach(btn =>
    btn.addEventListener('click', () => openSurveyDetail(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="edit-survey"]').forEach(btn =>
    btn.addEventListener('click', () => openSurveyForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete-survey"]').forEach(btn =>
    btn.addEventListener('click', () => handleDeleteSurvey(btn.dataset.id)));
}

function openSurveyForm(id) {
  const editing = id ? Store.getClimateSurvey(id) : null;
  const modal = openModal({
    title: editing ? 'Editar encuesta' : 'Nueva encuesta de clima',
    bodyHtml: `
      <form id="survey-form">
        <div class="field">
          <label>Título *</label>
          <input type="text" name="titulo" required value="${escapeHtml(editing?.titulo || '')}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Fecha</label>
            <input type="date" name="fecha" value="${editing?.fecha || new Date().toISOString().slice(0, 10)}">
          </div>
          <div class="field">
            <label>Estado</label>
            <select name="estado">
              ${Object.keys(SURVEY_STATUS_META).map(s => `<option value="${s}" ${editing?.estado === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Descripción</label>
          <textarea name="descripcion" rows="3">${escapeHtml(editing?.descripcion || '')}</textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-survey">${editing ? 'Guardar cambios' : 'Crear encuesta'}</button>
    `,
  });

  modal.querySelector('#save-survey').addEventListener('click', async () => {
    const form = modal.querySelector('#survey-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      titulo: fd.get('titulo'),
      fecha: fd.get('fecha'),
      estado: fd.get('estado'),
      descripcion: fd.get('descripcion') || '',
    };
    try {
      if (editing) {
        await Store.updateClimateSurvey(editing.id, data);
        toast('Encuesta actualizada correctamente.', 'success');
      } else {
        await Store.addClimateSurvey(data);
        toast('Encuesta creada correctamente.', 'success');
      }
      closeModal();
      renderSurveys();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar la encuesta.', 'error');
    }
  });
}

async function handleDeleteSurvey(id) {
  const confirmed = await confirmDialog('Vas a eliminar esta encuesta y todas sus respuestas.');
  if (!confirmed) return;
  await Store.deleteClimateSurvey(id);
  toast('Encuesta eliminada.', 'success');
  renderSurveys();
  document.dispatchEvent(new CustomEvent('data:changed'));
}

function openSurveyDetail(surveyId) {
  const survey = Store.getClimateSurvey(surveyId);
  if (!survey) return;

  const modal = openModal({
    title: 'Respuestas de la encuesta',
    size: 'lg',
    bodyHtml: `
      <div style="margin-bottom:16px;">
        <div style="font-size:16px;font-weight:700;">${escapeHtml(survey.titulo)}</div>
        <div class="cell-sub">${escapeHtml(survey.descripcion || '')}</div>
      </div>
      <div class="field-row" style="align-items:end;">
        <div class="field">
          <label>Empleado (opcional)</label>
          <select id="resp-employee">
            <option value="">Anónimo</option>
            ${employeeOptions()}
          </select>
        </div>
        <div class="field">
          <label>Puntaje *</label>
          <select id="resp-score">
            ${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Comentario</label>
        <input type="text" id="resp-comment" placeholder="Opcional">
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-add-response" style="margin-bottom:14px;">${icon('plus')} Agregar respuesta</button>
      <div id="response-list"></div>
    `,
    footerHtml: `<button class="btn btn-secondary" data-close>Cerrar</button>`,
  });

  function refreshList() {
    const listEl = modal.querySelector('#response-list');
    const responses = Store.getResponsesBySurvey(surveyId).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    if (responses.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Todavía no hay respuestas.</p>';
      return;
    }
    listEl.innerHTML = `
      <div class="mini-list">
        ${responses.map(r => {
          const emp = !r.anonimo && r.employeeId ? Store.getEmployee(r.employeeId) : null;
          return `
            <div class="mini-row" style="align-items:flex-start;">
              <span>
                <strong>${emp ? escapeHtml(fullName(emp)) : 'Anónimo'}</strong>
                ${r.comentario ? ` — ${escapeHtml(r.comentario)}` : ''}
                <div class="cell-sub">${formatDate(r.fecha)}</div>
              </span>
              <span style="display:flex;align-items:center;gap:8px;">
                <span class="badge ${scoreBadgeClass(r.puntaje)}">${r.puntaje} / 5</span>
                <button class="btn btn-ghost btn-sm" data-action="remove-response" data-id="${r.id}" title="Eliminar">${icon('trash')}</button>
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    listEl.querySelectorAll('[data-action="remove-response"]').forEach(btn =>
      btn.addEventListener('click', async () => {
        try {
          await Store.deleteSurveyResponse(btn.dataset.id);
          toast('Respuesta eliminada.', 'success');
          refreshList();
          renderSurveys();
        } catch (err) {
          toast(err.message || 'No se pudo eliminar la respuesta.', 'error');
        }
      }));
  }

  modal.querySelector('#btn-add-response').addEventListener('click', async () => {
    const employeeId = modal.querySelector('#resp-employee').value;
    const puntaje = Number(modal.querySelector('#resp-score').value);
    const comentario = modal.querySelector('#resp-comment').value;
    try {
      await Store.addSurveyResponse({
        surveyId,
        anonimo: !employeeId,
        employeeId: employeeId || null,
        puntaje,
        comentario,
        fecha: new Date().toISOString().slice(0, 10),
      });
      toast('Respuesta agregada correctamente.', 'success');
      modal.querySelector('#resp-comment').value = '';
      refreshList();
      renderSurveys();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo agregar la respuesta.', 'error');
    }
  });

  refreshList();
}

// ===================== Casos y Conflictos =====================
function renderConflicts() {
  const wrap = document.getElementById('sub-conflicts');
  const cases = Store.getConflictCases().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  wrap.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-conflict">${icon('plus')} Nuevo caso</button>
    </div>
    <div class="table-wrap">
      ${cases.length === 0 ? `
        <div class="empty-state">${icon('message-circle')}<p><strong>No hay casos registrados</strong></p></div>
      ` : `
        <table>
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Involucrados</th><th>Mediador</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${cases.map(c => {
              const meta = CONFLICT_STATUS_META[c.estado] || CONFLICT_STATUS_META['Abierto'];
              return `
                <tr>
                  <td>${formatDate(c.fecha)}</td>
                  <td><span class="tag">${escapeHtml(c.tipo)}</span></td>
                  <td>
                    <div class="cell-main">${escapeHtml(c.involucrados)}</div>
                    <div class="cell-sub">${escapeHtml(c.descripcion || '')}</div>
                  </td>
                  <td>${escapeHtml(c.mediador || '—')}</td>
                  <td><span class="badge ${meta.cls}">${meta.label}</span></td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm" data-action="edit-conflict" data-id="${c.id}" title="Editar">${icon('edit')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="delete-conflict" data-id="${c.id}" title="Eliminar">${icon('trash')}</button>
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

  wrap.querySelector('#btn-new-conflict').addEventListener('click', () => openConflictForm());
  wrap.querySelectorAll('[data-action="edit-conflict"]').forEach(btn =>
    btn.addEventListener('click', () => openConflictForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete-conflict"]').forEach(btn =>
    btn.addEventListener('click', () => handleDeleteConflict(btn.dataset.id)));
}

function openConflictForm(id) {
  const editing = id ? Store.getConflictCase(id) : null;
  const modal = openModal({
    title: editing ? 'Editar caso' : 'Nuevo caso / conflicto',
    size: 'lg',
    bodyHtml: `
      <form id="conflict-form">
        <div class="field-row">
          <div class="field">
            <label>Fecha *</label>
            <input type="date" name="fecha" required value="${editing?.fecha || new Date().toISOString().slice(0, 10)}">
          </div>
          <div class="field">
            <label>Tipo *</label>
            <select name="tipo" required>
              ${CONFLICT_TYPES.map(t => `<option value="${t}" ${editing?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Involucrados *</label>
          <input type="text" name="involucrados" required placeholder="Nombres o área involucrada" value="${escapeHtml(editing?.involucrados || '')}">
        </div>
        <div class="field">
          <label>Descripción *</label>
          <textarea name="descripcion" rows="3" required>${escapeHtml(editing?.descripcion || '')}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Mediador / responsable</label>
            <select name="mediador">
              <option value="">Sin asignar</option>
              ${Store.getEmployees().map(e => `<option value="${escapeHtml(fullName(e))}" ${editing?.mediador === fullName(e) ? 'selected' : ''}>${escapeHtml(fullName(e))}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Estado</label>
            <select name="estado">
              ${Object.keys(CONFLICT_STATUS_META).map(s => `<option value="${s}" ${editing?.estado === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Resolución</label>
          <textarea name="resolucion" rows="2">${escapeHtml(editing?.resolucion || '')}</textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-conflict">${editing ? 'Guardar cambios' : 'Crear caso'}</button>
    `,
  });

  modal.querySelector('#save-conflict').addEventListener('click', async () => {
    const form = modal.querySelector('#conflict-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      fecha: fd.get('fecha'),
      tipo: fd.get('tipo'),
      involucrados: fd.get('involucrados'),
      descripcion: fd.get('descripcion'),
      mediador: fd.get('mediador') || '',
      estado: fd.get('estado'),
      resolucion: fd.get('resolucion') || '',
    };
    try {
      if (editing) {
        await Store.updateConflictCase(editing.id, data);
        toast('Caso actualizado correctamente.', 'success');
      } else {
        await Store.addConflictCase(data);
        toast('Caso creado correctamente.', 'success');
      }
      closeModal();
      renderConflicts();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar el caso.', 'error');
    }
  });
}

async function handleDeleteConflict(id) {
  const confirmed = await confirmDialog('Vas a eliminar este caso. Esta acción no se puede deshacer.');
  if (!confirmed) return;
  await Store.deleteConflictCase(id);
  toast('Caso eliminado.', 'success');
  renderConflicts();
  document.dispatchEvent(new CustomEvent('data:changed'));
}
