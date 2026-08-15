import { Store } from './storage.js';
import { openModal, closeModal, confirmDialog, toast } from './ui.js';
import {
  formatDate, fullName, icon, escapeHtml,
  JOB_POSTING_STATUS_META, CANDIDATE_STAGES,
} from './utils.js';

const MODALIDADES = ['Presencial', 'Remoto', 'Híbrido'];
const TIPOS_CONTRATO = ['Indefinido', 'Plazo Fijo', 'Temporal', 'Pasantía'];

let activeTab = 'postings';

function departmentOptions(selectedId) {
  return Store.getDepartments().map(d =>
    `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${escapeHtml(d.nombre)}</option>`
  ).join('');
}

function jobPostingOptions(selectedId) {
  return Store.getJobPostings().map(j =>
    `<option value="${j.id}" ${j.id === selectedId ? 'selected' : ''}>${escapeHtml(j.titulo)}</option>`
  ).join('');
}

function starsHtml(rating) {
  if (rating == null) return '<span class="cell-sub">Sin calificar</span>';
  let html = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    html += i <= rating
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"></polygon></svg>'
      : '<svg class="star-empty" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"></polygon></svg>';
  }
  return html + '</span>';
}

export function renderRecruitment() {
  const container = document.getElementById('view-recruitment');
  container.innerHTML = `
    <div class="subtabs">
      <button class="subtab" data-tab="postings">${icon('briefcase')} Ofertas de Empleo</button>
      <button class="subtab" data-tab="candidates">${icon('user-check')} Candidatos</button>
    </div>
    <div class="subview" id="sub-postings"></div>
    <div class="subview" id="sub-candidates"></div>
  `;

  container.querySelectorAll('.subtab').forEach(tab =>
    tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

  switchTab(activeTab);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#view-recruitment .subtab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('#view-recruitment .subview').forEach(v => v.classList.remove('active'));
  document.getElementById(`sub-${tab}`).classList.add('active');
  if (tab === 'postings') renderPostings();
  else renderCandidates();
}

// ===================== Ofertas de Empleo =====================
function renderPostings() {
  const wrap = document.getElementById('sub-postings');
  const postings = Store.getJobPostings();
  wrap.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-posting">${icon('plus')} Nueva oferta</button>
    </div>
    <div class="table-wrap">
      ${postings.length === 0 ? `
        <div class="empty-state">${icon('briefcase')}<p><strong>No hay ofertas publicadas</strong></p></div>
      ` : `
        <table>
          <thead>
            <tr><th>Puesto</th><th>Departamento</th><th>Modalidad</th><th>Vacantes</th><th>Candidatos</th><th>Publicada</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${postings.map(j => {
              const dep = Store.getDepartment(j.departmentId);
              const meta = JOB_POSTING_STATUS_META[j.estado] || JOB_POSTING_STATUS_META['Abierta'];
              const count = Store.getCandidatesByJobPosting(j.id).length;
              return `
                <tr>
                  <td class="cell-main">${escapeHtml(j.titulo)}</td>
                  <td>${dep ? `<span class="tag">${escapeHtml(dep.nombre)}</span>` : '—'}</td>
                  <td>${escapeHtml(j.modalidad)}</td>
                  <td>${j.vacantes}</td>
                  <td>${count}</td>
                  <td>${formatDate(j.fechaPublicacion)}</td>
                  <td><span class="badge ${meta.cls}">${meta.label}</span></td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm" data-action="edit-posting" data-id="${j.id}" title="Editar">${icon('edit')}</button>
                      <button class="btn btn-ghost btn-sm" data-action="delete-posting" data-id="${j.id}" title="Eliminar">${icon('trash')}</button>
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

  wrap.querySelector('#btn-new-posting').addEventListener('click', () => openPostingForm());
  wrap.querySelectorAll('[data-action="edit-posting"]').forEach(btn =>
    btn.addEventListener('click', () => openPostingForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete-posting"]').forEach(btn =>
    btn.addEventListener('click', () => handleDeletePosting(btn.dataset.id)));
}

function openPostingForm(id) {
  const editing = id ? Store.getJobPosting(id) : null;
  const modal = openModal({
    title: editing ? 'Editar oferta de empleo' : 'Nueva oferta de empleo',
    size: 'lg',
    bodyHtml: `
      <form id="posting-form">
        <div class="field">
          <label>Título del puesto *</label>
          <input type="text" name="titulo" required value="${escapeHtml(editing?.titulo || '')}">
        </div>
        <div class="field-row">
          <div class="field">
            <label>Departamento *</label>
            <select name="departmentId" required>
              <option value="">Seleccionar...</option>
              ${departmentOptions(editing?.departmentId)}
            </select>
          </div>
          <div class="field">
            <label>Vacantes *</label>
            <input type="number" name="vacantes" min="1" required value="${editing?.vacantes ?? 1}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Modalidad</label>
            <select name="modalidad">
              ${MODALIDADES.map(m => `<option value="${m}" ${editing?.modalidad === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Tipo de contrato</label>
            <select name="tipoContrato">
              ${TIPOS_CONTRATO.map(t => `<option value="${t}" ${editing?.tipoContrato === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Descripción</label>
          <textarea name="descripcion" rows="2">${escapeHtml(editing?.descripcion || '')}</textarea>
        </div>
        <div class="field">
          <label>Requisitos</label>
          <textarea name="requisitos" rows="2">${escapeHtml(editing?.requisitos || '')}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Fecha de publicación</label>
            <input type="date" name="fechaPublicacion" value="${editing?.fechaPublicacion || new Date().toISOString().slice(0, 10)}">
          </div>
          <div class="field">
            <label>Estado</label>
            <select name="estado">
              ${Object.keys(JOB_POSTING_STATUS_META).map(s => `<option value="${s}" ${editing?.estado === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-posting">${editing ? 'Guardar cambios' : 'Publicar oferta'}</button>
    `,
  });

  modal.querySelector('#save-posting').addEventListener('click', async () => {
    const form = modal.querySelector('#posting-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      titulo: fd.get('titulo'),
      departmentId: fd.get('departmentId'),
      vacantes: Number(fd.get('vacantes')),
      modalidad: fd.get('modalidad'),
      tipoContrato: fd.get('tipoContrato'),
      descripcion: fd.get('descripcion') || '',
      requisitos: fd.get('requisitos') || '',
      fechaPublicacion: fd.get('fechaPublicacion'),
      estado: fd.get('estado'),
    };
    try {
      if (editing) {
        await Store.updateJobPosting(editing.id, data);
        toast('Oferta actualizada correctamente.', 'success');
      } else {
        await Store.addJobPosting(data);
        toast('Oferta publicada correctamente.', 'success');
      }
      closeModal();
      renderPostings();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar la oferta.', 'error');
    }
  });
}

async function handleDeletePosting(id) {
  const confirmed = await confirmDialog('Vas a eliminar esta oferta de empleo. Los candidatos asociados también se eliminarán.');
  if (!confirmed) return;
  await Store.deleteJobPosting(id);
  toast('Oferta eliminada.', 'success');
  renderPostings();
  document.dispatchEvent(new CustomEvent('data:changed'));
}

// ===================== Candidatos (Kanban) =====================
function renderCandidates() {
  const wrap = document.getElementById('sub-candidates');
  const candidates = Store.getCandidates();

  wrap.innerHTML = `
    <div class="toolbar">
      <div></div>
      <button class="btn btn-primary" id="btn-new-candidate">${icon('plus')} Nuevo candidato</button>
    </div>
    <div class="kanban-board">
      ${CANDIDATE_STAGES.map(stage => {
        const items = candidates.filter(c => c.etapa === stage);
        return `
          <div class="kanban-col">
            <div class="kanban-col__header"><span>${stage}</span><span class="tag">${items.length}</span></div>
            <div class="kanban-col__body">
              ${items.map(c => {
                const job = Store.getJobPosting(c.jobPostingId);
                return `
                  <div class="kanban-card">
                    <div class="kanban-card__name">${escapeHtml(fullName(c))}</div>
                    <div class="kanban-card__job">${job ? escapeHtml(job.titulo) : 'Sin oferta asociada'}</div>
                    ${starsHtml(c.calificacion)}
                    <div class="kanban-card__footer">
                      <select data-action="change-stage" data-id="${c.id}">
                        ${CANDIDATE_STAGES.map(s => `<option value="${s}" ${s === stage ? 'selected' : ''}>${s}</option>`).join('')}
                      </select>
                      <div class="table-actions">
                        <button class="btn btn-ghost btn-sm" data-action="edit-candidate" data-id="${c.id}" title="Editar">${icon('edit')}</button>
                        <button class="btn btn-ghost btn-sm" data-action="delete-candidate" data-id="${c.id}" title="Eliminar">${icon('trash')}</button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  wrap.querySelector('#btn-new-candidate').addEventListener('click', () => openCandidateForm());
  wrap.querySelectorAll('[data-action="change-stage"]').forEach(sel =>
    sel.addEventListener('change', async () => {
      try {
        await Store.updateCandidate(sel.dataset.id, { etapa: sel.value });
        toast('Etapa del candidato actualizada.', 'success');
        renderCandidates();
      } catch (err) {
        toast(err.message || 'No se pudo actualizar la etapa.', 'error');
      }
    }));
  wrap.querySelectorAll('[data-action="edit-candidate"]').forEach(btn =>
    btn.addEventListener('click', () => openCandidateForm(btn.dataset.id)));
  wrap.querySelectorAll('[data-action="delete-candidate"]').forEach(btn =>
    btn.addEventListener('click', () => handleDeleteCandidate(btn.dataset.id)));
}

function openCandidateForm(id) {
  const editing = id ? Store.getCandidate(id) : null;
  const modal = openModal({
    title: editing ? 'Editar candidato' : 'Nuevo candidato',
    size: 'lg',
    bodyHtml: `
      <form id="candidate-form">
        <div class="field-row">
          <div class="field">
            <label>Nombre *</label>
            <input type="text" name="nombre" required value="${escapeHtml(editing?.nombre || '')}">
          </div>
          <div class="field">
            <label>Apellido *</label>
            <input type="text" name="apellido" required value="${escapeHtml(editing?.apellido || '')}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Email *</label>
            <input type="email" name="email" required value="${escapeHtml(editing?.email || '')}">
          </div>
          <div class="field">
            <label>Teléfono</label>
            <input type="text" name="telefono" value="${escapeHtml(editing?.telefono || '')}">
          </div>
        </div>
        <div class="field">
          <label>Oferta de empleo *</label>
          <select name="jobPostingId" required>
            <option value="">Seleccionar...</option>
            ${jobPostingOptions(editing?.jobPostingId)}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Etapa</label>
            <select name="etapa">
              ${CANDIDATE_STAGES.map(s => `<option value="${s}" ${editing?.etapa === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Calificación</label>
            <select name="calificacion">
              <option value="">Sin calificar</option>
              ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${String(editing?.calificacion) === String(n) ? 'selected' : ''}>${n} estrella${n > 1 ? 's' : ''}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Fecha de postulación</label>
          <input type="date" name="fechaPostulacion" value="${editing?.fechaPostulacion || new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="field">
          <label>Notas</label>
          <textarea name="notas" rows="3">${escapeHtml(editing?.notas || '')}</textarea>
        </div>
      </form>
    `,
    footerHtml: `
      <button class="btn btn-secondary" data-close>Cancelar</button>
      <button class="btn btn-primary" id="save-candidate">${editing ? 'Guardar cambios' : 'Agregar candidato'}</button>
    `,
  });

  modal.querySelector('#save-candidate').addEventListener('click', async () => {
    const form = modal.querySelector('#candidate-form');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const data = {
      nombre: fd.get('nombre'),
      apellido: fd.get('apellido'),
      email: fd.get('email'),
      telefono: fd.get('telefono') || '',
      jobPostingId: fd.get('jobPostingId'),
      etapa: fd.get('etapa'),
      calificacion: fd.get('calificacion') ? Number(fd.get('calificacion')) : null,
      fechaPostulacion: fd.get('fechaPostulacion'),
      notas: fd.get('notas') || '',
    };
    try {
      if (editing) {
        await Store.updateCandidate(editing.id, data);
        toast('Candidato actualizado correctamente.', 'success');
      } else {
        await Store.addCandidate(data);
        toast('Candidato agregado correctamente.', 'success');
      }
      closeModal();
      renderCandidates();
      document.dispatchEvent(new CustomEvent('data:changed'));
    } catch (err) {
      toast(err.message || 'No se pudo guardar el candidato.', 'error');
    }
  });
}

async function handleDeleteCandidate(id) {
  const confirmed = await confirmDialog('Vas a eliminar este candidato. Esta acción no se puede deshacer.');
  if (!confirmed) return;
  await Store.deleteCandidate(id);
  toast('Candidato eliminado.', 'success');
  renderCandidates();
  document.dispatchEvent(new CustomEvent('data:changed'));
}
