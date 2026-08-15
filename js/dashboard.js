import { Store } from './storage.js';
import {
  formatDate, fullName, contractStatus, CONTRACT_STATUS_META, icon, average,
} from './utils.js';

export function renderDashboard() {
  const container = document.getElementById('view-dashboard');
  const employees = Store.getEmployees();
  const departments = Store.getDepartments();
  const contracts = Store.getContracts();

  const activos = employees.filter(e => e.estado === 'activo').length;
  const statuses = contracts.map(c => ({ c, status: contractStatus(c) }));
  const vigentes = statuses.filter(s => s.status === 'vigente' || s.status === 'proximo').length;
  const proximosVencer = statuses.filter(s => s.status === 'proximo')
    .sort((a, b) => new Date(a.c.fechaFin) - new Date(b.c.fechaFin));

  const porDepartamento = departments.map(dep => ({
    nombre: dep.nombre,
    count: employees.filter(e => e.departmentId === dep.id).length,
  })).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...porDepartamento.map(d => d.count));

  const vacantesAbiertas = Store.getJobPostings().filter(j => j.estado === 'Abierta' || j.estado === 'En proceso').length;
  const candidatosEnProceso = Store.getCandidates().filter(c => c.etapa !== 'Contratado' && c.etapa !== 'Descartado').length;
  const licenciasPendientes = Store.getVacations().filter(v => v.estado === 'Pendiente');
  const climaPromedio = average(Store.getSurveyResponses().map(r => r.puntaje));
  const casosAbiertos = Store.getConflictCases().filter(c => c.estado === 'Abierto' || c.estado === 'En mediación').length;
  const capacitacionesEnCurso = Store.getTrainings().filter(t => t.estado === 'En curso').length;

  container.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div>
          <div class="kpi-card__label">Empleados</div>
          <div class="kpi-card__value">${employees.length}</div>
          <div class="kpi-card__hint">${activos} activos</div>
        </div>
        <div class="kpi-card__icon blue">${icon('users')}</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-card__label">Contratos vigentes</div>
          <div class="kpi-card__value">${vigentes}</div>
          <div class="kpi-card__hint">de ${contracts.length} contratos totales</div>
        </div>
        <div class="kpi-card__icon green">${icon('file-text')}</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-card__label">Por vencer (30 días)</div>
          <div class="kpi-card__value">${proximosVencer.length}</div>
          <div class="kpi-card__hint">requieren atención</div>
        </div>
        <div class="kpi-card__icon amber">${icon('alert-triangle')}</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-card__label">Departamentos</div>
          <div class="kpi-card__value">${departments.length}</div>
          <div class="kpi-card__hint">áreas activas</div>
        </div>
        <div class="kpi-card__icon gray">${icon('building')}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div>
          <div class="kpi-card__label">Vacantes abiertas</div>
          <div class="kpi-card__value">${vacantesAbiertas}</div>
          <div class="kpi-card__hint">${candidatosEnProceso} candidatos en proceso</div>
        </div>
        <div class="kpi-card__icon blue">${icon('briefcase')}</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-card__label">Licencias pendientes</div>
          <div class="kpi-card__value">${licenciasPendientes.length}</div>
          <div class="kpi-card__hint">por aprobar</div>
        </div>
        <div class="kpi-card__icon amber">${icon('calendar')}</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-card__label">Clima laboral</div>
          <div class="kpi-card__value">${climaPromedio != null ? climaPromedio.toFixed(1) : '—'}</div>
          <div class="kpi-card__hint">promedio sobre 5</div>
        </div>
        <div class="kpi-card__icon ${climaPromedio != null ? (climaPromedio >= 4 ? 'green' : climaPromedio >= 3 ? 'amber' : 'gray') : 'gray'}">${icon('smile')}</div>
      </div>
      <div class="kpi-card">
        <div>
          <div class="kpi-card__label">Casos abiertos</div>
          <div class="kpi-card__value">${casosAbiertos}</div>
          <div class="kpi-card__hint">${capacitacionesEnCurso} capacitaciones en curso</div>
        </div>
        <div class="kpi-card__icon ${casosAbiertos > 0 ? 'amber' : 'green'}">${icon('message-circle')}</div>
      </div>
    </div>

    <div class="panels-grid">
      <div class="card">
        <div class="card__header">
          <h3>Contratos próximos a vencer</h3>
        </div>
        <div class="card__body">
          ${proximosVencer.length === 0 ? `
            <div class="empty-state" style="padding:30px 10px;">
              ${icon('check-circle')}
              <p>No hay contratos por vencer en los próximos 30 días.</p>
            </div>
          ` : `
            <div class="mini-list">
              ${proximosVencer.slice(0, 6).map(({ c }) => {
                const emp = Store.getEmployee(c.employeeId);
                const meta = CONTRACT_STATUS_META[contractStatus(c)];
                return `
                  <div class="mini-row">
                    <span>${emp ? fullName(emp) : 'Empleado eliminado'} — vence ${formatDate(c.fechaFin)}</span>
                    <span class="badge ${meta.cls}">${meta.label}</span>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <h3>Empleados por departamento</h3>
        </div>
        <div class="card__body">
          ${porDepartamento.map(d => `
            <div class="bar-row">
              <span class="bar-row__label" title="${d.nombre}">${d.nombre}</span>
              <div class="bar-row__track"><div class="bar-row__fill" style="width:${(d.count / maxCount) * 100}%"></div></div>
              <span class="bar-row__value">${d.count}</span>
            </div>
          `).join('') || '<p style="color:var(--text-muted);">Sin departamentos cargados.</p>'}
        </div>
      </div>
    </div>
  `;
}
