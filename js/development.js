import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import {
  formatDate, fullName, initials, icon, escapeHtml,
  TRAINING_STATUS_META, ENROLLMENT_STATUS_META,
  PERFORMANCE_STATUS_META, performanceScore, scoreBadgeClass,
} from './utils.js';

const MODALIDADES = ['Presencial', 'Virtual', 'Híbrido'];
const RECOMENDACIONES = ['Ascenso', 'Mantener', 'Plan de mejora', 'Capacitación'];

let activeTab = 'trainings';

function employeeOptions(selectedId) {
  return Store.getEmployees().map(e =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(fullName(e))}</option>`
  ).join('');
}

export function renderDevelopment() {
  const container = document.getElementById('view-development');
  container.innerHTML = `
    <div class="subtabs">
      <button class="subtab" data-tab="trainings">${icon('award')} Capacitaciones</button>
      <button class="subtab" data-tab="performance">${icon('trending-up')} Evaluaciones de Desempeño</button>
    </div>
    <div class="subview" id="sub-trainings"></div>
    <div class="subview" id="sub-performance"></div>
  `;
  container.querySelectorAll('.subtab').forEach(tab =>
    tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  switchTab(activeTab);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#view-development .subtab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('#view-development .subview').forEach(v => v.classList.remove('active'));
  document.getElementById(`sub-${tab}`).classList.add('active');
  if (tab === 'trainings') renderTrainings();
  else renderPerformance();
}

// ===================== Capacitaciones =====================
function renderTrainings() {
  const wrap = document.getElementById('sub-trainings');
  const trainings = Store.getTrainings().sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));

  wrap.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-training">${icon('plus')} Nueva capacitación</button>
    </div>
    <div class="table-wrap">
      ${trainings.length === 0 ? `
        <div class="empty-state">${icon('award')}<p><strong>No hay capacitaciones programadas</strong></p></div>
      ` : `
        <table>
          <thead>
            <tr><th>Capacitación</th><th>Categoría</th><th>Modalidad</th><th>Fechas</th><th>Inscriptos</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${trainings.map(t => {
              const meta = TRAINING_STATUS_META[t.estado] || TRAINING_STATUS_META['Programada'];
              const count = Store.getEnrollmentsByTraining(t.id).length;
              return `
                <tr>
                  <td>
                    <div class="cell-main">${escapeHtml(t.nombre)}</div>
                    <div class="cell-sub">${escapeHtml(t.instructor || '')}</div>
                  </td>
                  <td><span class="tag">${escapeHtml(t.categoria)}</span></td>
                  <td>${escapeHtml(t.modalidad)}</td>
                  <td>${formatDate(t.fechaInicio)} – ${formatDate(t.fechaFin)}</td>
                  <td>${count} / ${t.cupo}</td>
                  <td><span class="badge ${meta.cls}">${meta.label}</span></td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm" data-action="view-training" data-id="${t.id}" title="Ver inscriptos">${icon('eye')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="edit-training" data-id="${t.id}" title="Editar">${icon('edit')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="delete-training" data-id="${t.id}" title="Eliminar">${icon('trash')}</button>
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

  wrap.querySelector('#btn-new-training').addEventListener('click', () => openTrainingForm());
  wrap.querySelectorAll('[data-action="view-training"]').forEach(btn =>
    btn.addEventListener('click', () => openTrainingDetail(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="edit-training"]').forEach(btn =>
    btn.addEventListener('click', () => openTrainingForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete-training"]').forEach(btn =>
    btn.addEventListener('click', () => handleDeleteTraining(btn.dataset.id)));
}

function openTrainingForm(id) {
  const editing = id ? Store.getTraining(id) : null;
  const modal = openModal({
    title: editing ? 'Editar capacitación' : 'Nueva capacitación',
    size: 'lg',
    bodyHtml: `
      <form id="training-form">
        <div class="field">
          <label>Nombre *</label>
          <input type="text" name="nombre" required value="${escapeHtml(editing?.nombre || '')}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Categoría *</label>
            <input type="text" name="categoria" required value="${escapeHtml(editing?.categoria || '')}" placeholder="Ej: Técnica, Soft skills, Obligatoria">
          </div>
          <div class="field">
            <label>Modalidad</label>
            <select name="modalidad">
              ${MODALIDADES.map(m => `<option value="${m}" ${editing?.modalidad === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Instructor</label>
            <input type="text" name="instructor" value="${escapeHtml(editing?.instructor || '')}">
          </div>
          <div class="field">
            <label>Cupo *</label>
            <input type="number" name="cupo" min="1" required value="${editing?.cupo ?? 10}">
          </div>
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
            ${Object.keys(TRAINING_STATUS_META).map(s => `<option value="${s}" ${editing?.estado === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Descripción</label>
          <textarea name="descripcion" rows="2">${escapeHtml(editing?.descripcion || '')}</textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-training">${editing ? 'Guardar cambios' : 'Crear capacitación'}</button>
    `,
  });

  modal.querySelector('#save-training').addEventListener('click', async () => {
    const form = modal.querySelector('#training-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      nombre: fd.get('nombre'),
      categoria: fd.get('categoria'),
      modalidad: fd.get('modalidad'),
      instructor: fd.get('instructor') || '',
      cupo: Number(fd.get('cupo')),
      fechaInicio: fd.get('fechaInicio'),
      fechaFin: fd.get('fechaFin'),
      estado: fd.get('estado'),
      descripcion: fd.get('descripcion') || '',
    };
    try {
      if (editing) {
        await Store.updateTraining(editing.id, data);
        toast('Capacitación actualizada correctamente.', 'success');
      } else {
        await Store.addTraining(data);
        toast('Capacitación creada correctamente.', 'success');
      }
      closeModal();
      renderTrainings();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar la capacitación.', 'error');
    }
  });
}

async function handleDeleteTraining(id) {
  const confirmed = await confirmDialog('Vas a eliminar esta capacitación y sus inscripciones asociadas.');
  if (!confirmed) return;
  await Store.deleteTraining(id);
  toast('Capacitación eliminada.', 'success');
  renderTrainings();
  document.dispatchEvent(new CustomEvent('data:changed'));
}

function openTrainingDetail(trainingId) {
  const training = Store.getTraining(trainingId);
  if (!training) return;
  const meta = TRAINING_STATUS_META[training.estado] || TRAINING_STATUS_META['Programada'];

  const modal = openModal({
    title: 'Inscriptos en la capacitación',
    size: 'lg',
    bodyHtml: `
      <div style="margin-bottom:16px;">
        <div style="font-size:16px;font-weight:700;">${escapeHtml(training.nombre)}</div>
        <div class="cell-sub">${formatDate(training.fechaInicio)} – ${formatDate(training.fechaFin)} · ${escapeHtml(training.modalidad)} · <span class="badge ${meta.cls}">${meta.label}</span></div>
      </div>
      <div class="field-row" style="align-items:end;">
        <div class="field">
          <label>Agregar empleado</label>
          <select id="add-enroll-employee">
            <option value="">Seleccionar...</option>
            ${employeeOptions()}
          </select>
        </div>
        <div class="field" style="display:flex;gap:10px;">
          <select id="add-enroll-estado" style="flex:1;">
            ${Object.keys(ENROLLMENT_STATUS_META).map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="btn-add-enroll">${icon('plus')}</button>
        </div>
      </div>
      <div id="enroll-list" style="margin-top:14px;"></div>
    `,
    footerHtml: `<button class="btn btn-secondary" data-close>Cerrar</button>`,
  });

  function refreshList() {
    const listEl = modal.querySelector('#enroll-list');
    const enrollments = Store.getEnrollmentsByTraining(trainingId);
    if (enrollments.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Todavía no hay empleados inscriptos.</p>';
      return;
    }
    listEl.innerHTML = `
      <div class="mini-list">
        ${enrollments.map(en => {
          const emp = Store.getEmployee(en.employeeId);
          const m = ENROLLMENT_STATUS_META[en.estado] || ENROLLMENT_STATUS_META['Inscripto'];
          return `
            <div class="mini-row">
              <span>${emp ? escapeHtml(fullName(emp)) : '<em>Empleado eliminado</em>'}</span>
              <span style="display:flex;align-items:center;gap:8px;">
                <span class="badge ${m.cls}">${m.label}</span>
                <button class="btn btn-ghost btn-sm" data-action="remove-enroll" data-id="${en.id}" title="Quitar">${icon('trash')}</button>
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    listEl.querySelectorAll('[data-action="remove-enroll"]').forEach(btn =>
      btn.addEventListener('click', async () => {
        try {
          await Store.deleteEnrollment(btn.dataset.id);
          toast('Inscripción eliminada.', 'success');
          refreshList();
          renderTrainings();
        } catch (err) {
          toast(err.message || 'No se pudo eliminar la inscripción.', 'error');
        }
      }));
  }

  modal.querySelector('#btn-add-enroll').addEventListener('click', async () => {
    const employeeId = modal.querySelector('#add-enroll-employee').value;
    const estado = modal.querySelector('#add-enroll-estado').value;
    if (!employeeId) { toast('Seleccioná un empleado.', 'error'); return; }
    const already = Store.getEnrollmentsByTraining(trainingId).some(en => en.employeeId === employeeId);
    if (already) { toast('Ese empleado ya está inscripto.', 'error'); return; }
    try {
      await Store.addEnrollment({ trainingId, employeeId, estado, calificacion: null, fechaInscripcion: new Date().toISOString().slice(0, 10) });
      toast('Empleado inscripto correctamente.', 'success');
      refreshList();
      renderTrainings();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo inscribir al empleado.', 'error');
    }
  });

  refreshList();
}

// ===================== Evaluaciones de Desempeño =====================
function renderPerformance() {
  const wrap = document.getElementById('sub-performance');
  const reviews = Store.getPerformanceReviews().sort((a, b) => (b.periodo || '').localeCompare(a.periodo || ''));

  wrap.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-review">${icon('plus')} Nueva evaluación</button>
    </div>
    <div class="table-wrap">
      ${reviews.length === 0 ? `
        <div class="empty-state">${icon('trending-up')}<p><strong>No hay evaluaciones registradas</strong></p></div>
      ` : `
        <table>
          <thead>
            <tr><th>Empleado</th><th>Período</th><th>Evaluador</th><th>Puntaje</th><th>Recomendación</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${reviews.map(r => {
              const emp = Store.getEmployee(r.employeeId);
              const meta = PERFORMANCE_STATUS_META[r.estado] || PERFORMANCE_STATUS_META['Borrador'];
              const score = performanceScore(r);
              return `
                <tr>
                  <td>${emp ? `<div class="person-cell"><div class="avatar">${initials(emp.nombre, emp.apellido)}</div><span class="cell-main">${escapeHtml(fullName(emp))}</span></div>` : '<em>Empleado eliminado</em>'}</td>
                  <td>${escapeHtml(r.periodo)}</td>
                  <td>${escapeHtml(r.evaluador || '—')}</td>
                  <td>${score != null ? `<span class="badge ${scoreBadgeClass(score)}">${score.toFixed(1)} / 5</span>` : '<span class="cell-sub">—</span>'}</td>
                  <td>${r.recomendacion ? `<span class="tag">${escapeHtml(r.recomendacion)}</span>` : '—'}</td>
                  <td><span class="badge ${meta.cls}">${meta.label}</span></td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm" data-action="edit-review" data-id="${r.id}" title="Editar">${icon('edit')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="delete-review" data-id="${r.id}" title="Eliminar">${icon('trash')}</button>
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

  wrap.querySelector('#btn-new-review').addEventListener('click', () => openReviewForm());
  wrap.querySelectorAll('[data-action="edit-review"]').forEach(btn =>
    btn.addEventListener('click', () => openReviewForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete-review"]').forEach(btn =>
    btn.addEventListener('click', () => handleDeleteReview(btn.dataset.id)));
}

function ratingSelect(name, value) {
  return `
    <select name="${name}">
      <option value="">Sin calificar</option>
      ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${String(value) === String(n) ? 'selected' : ''}>${n}</option>`).join('')}
    </select>
  `;
}

function openReviewForm(id) {
  const editing = id ? Store.getPerformanceReview(id) : null;
  const modal = openModal({
    title: editing ? 'Editar evaluación de desempeño' : 'Nueva evaluación de desempeño',
    size: 'lg',
    bodyHtml: `
      <form id="review-form">
        <div class="field-row">
          <div class="field">
            <label>Empleado *</label>
            <select name="employeeId" required>
              <option value="">Seleccionar...</option>
              ${employeeOptions(editing?.employeeId)}
            </select>
          </div>
          <div class="field">
            <label>Período *</label>
            <input type="text" name="periodo" required placeholder="Ej: 2026-S1" value="${escapeHtml(editing?.periodo || '')}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Evaluador</label>
            <input type="text" name="evaluador" value="${escapeHtml(editing?.evaluador || '')}">
          </div>
          <div class="field">
            <label>Fecha</label>
            <input type="date" name="fecha" value="${editing?.fecha || ''}">
          </div>
        </div>
        <div class="subsection-title" style="margin-top:6px;">Criterios de evaluación (1 a 5)</div>
        <div class="field-row">
          <div class="field"><label>Puntualidad</label>${ratingSelect('puntualidad', editing?.puntualidad)}</div>
          <div class="field"><label>Calidad de trabajo</label>${ratingSelect('calidad', editing?.calidad)}</div>
        </div>
        <div class="field-row">
          <div class="field"><label>Trabajo en equipo</label>${ratingSelect('trabajoEquipo', editing?.trabajoEquipo)}</div>
          <div class="field"><label>Liderazgo</label>${ratingSelect('liderazgo', editing?.liderazgo)}</div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Recomendación</label>
            <select name="recomendacion">
              <option value="">Sin definir</option>
              ${RECOMENDACIONES.map(r => `<option value="${r}" ${editing?.recomendacion === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Estado</label>
            <select name="estado">
              ${Object.keys(PERFORMANCE_STATUS_META).map(s => `<option value="${s}" ${editing?.estado === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Comentarios</label>
          <textarea name="comentarios" rows="3">${escapeHtml(editing?.comentarios || '')}</textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-review">${editing ? 'Guardar cambios' : 'Crear evaluación'}</button>
    `,
  });

  modal.querySelector('#save-review').addEventListener('click', async () => {
    const form = modal.querySelector('#review-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const toNum = (v) => (v === '' || v == null) ? null : Number(v);
    const data = {
      employeeId: fd.get('employeeId'),
      periodo: fd.get('periodo'),
      evaluador: fd.get('evaluador') || '',
      fecha: fd.get('fecha') || null,
      puntualidad: toNum(fd.get('puntualidad')),
      calidad: toNum(fd.get('calidad')),
      trabajoEquipo: toNum(fd.get('trabajoEquipo')),
      liderazgo: toNum(fd.get('liderazgo')),
      recomendacion: fd.get('recomendacion') || '',
      estado: fd.get('estado'),
      comentarios: fd.get('comentarios') || '',
    };
    try {
      if (editing) {
        await Store.updatePerformanceReview(editing.id, data);
        toast('Evaluación actualizada correctamente.', 'success');
      } else {
        await Store.addPerformanceReview(data);
        toast('Evaluación creada correctamente.', 'success');
      }
      closeModal();
      renderPerformance();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar la evaluación.', 'error');
    }
  });
}

async function handleDeleteReview(id) {
  const confirmed = await confirmDialog('Vas a eliminar esta evaluación. Esta acción no se puede deshacer.');
  if (!confirmed) return;
  await Store.deletePerformanceReview(id);
  toast('Evaluación eliminada.', 'success');
  renderPerformance();
  document.dispatchEvent(new CustomEvent('data:changed'));
}
