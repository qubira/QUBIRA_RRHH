import { Store } from './storage.js';
import { renderCalendario } from './calendario.js';
import { renderDashboard } from './dashboard.js';
import { renderEmployees } from './employees.js';
import { renderContracts } from './contracts.js';
import { renderDocuments } from './documents.js';
import { renderDepartments } from './departments.js';
import { renderRecruitment } from './recruitment.js';
import { renderPayroll } from './payroll.js';
import { renderDevelopment } from './development.js';
import { renderClimate } from './climate.js';
import { renderAccounts } from './accounts.js';
import { renderSettings } from './settings.js';
import { contractStatus } from './utils.js';

const VIEWS = {
  dashboard: { render: renderDashboard, title: 'Dashboard', subtitle: 'Resumen general de Recursos Humanos' },
  calendario: { render: renderCalendario, title: 'Calendario', subtitle: 'Reuniones de RR. HH. e interconexión con otras áreas' },
  employees: { render: renderEmployees, title: 'Empleados', subtitle: 'Gestión de datos del personal' },
  contracts: { render: renderContracts, title: 'Contratos', subtitle: 'Administración de contratos laborales' },
  documents: { render: renderDocuments, title: 'Documentos', subtitle: 'Archivos y documentación del personal' },
  departments: { render: renderDepartments, title: 'Departamentos', subtitle: 'Áreas y estructura organizacional' },
  recruitment: { render: renderRecruitment, title: 'Reclutamiento y Selección', subtitle: 'Ofertas de empleo y seguimiento de candidatos' },
  payroll: { render: renderPayroll, title: 'Administración y Nómina', subtitle: 'Liquidaciones, vacaciones y licencias' },
  development: { render: renderDevelopment, title: 'Capacitación y Desarrollo', subtitle: 'Formación del personal y evaluaciones de desempeño' },
  climate: { render: renderClimate, title: 'Clima Laboral', subtitle: 'Encuestas de clima y gestión de conflictos' },
  accounts: { render: renderAccounts, title: 'Cuentas de usuario', subtitle: 'Cuentas de acceso al sistema, roles y permisos' },
  settings: { render: renderSettings, title: 'Configuración', subtitle: 'Listas de opciones usadas en los formularios' },
};

let currentView = 'dashboard';

function renderView(name) {
  if (!VIEWS[name]) name = 'dashboard';
  currentView = name;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === name);
  });

  document.getElementById('topbar-title').textContent = VIEWS[name].title;
  document.getElementById('topbar-subtitle').textContent = VIEWS[name].subtitle;

  VIEWS[name].render();
  closeSidebarOnMobile();
}

function updateBadges() {
  const proximos = Store.getContracts().filter(c => contractStatus(c) === 'proximo').length;
  setBadge('badge-contracts', proximos);

  const licenciasPendientes = Store.getVacations().filter(v => v.estado === 'Pendiente').length;
  setBadge('badge-vacations', licenciasPendientes);

  const casosAbiertos = Store.getConflictCases().filter(c => c.estado === 'Abierto' || c.estado === 'En mediación').length;
  setBadge('badge-conflicts', casosAbiertos);
}

function setBadge(elementId, count) {
  const badge = document.getElementById(elementId);
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function closeSidebarOnMobile() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => renderView(item.dataset.view));
  });

  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('active');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebarOnMobile);
}

function renderSession() {
  const raw = localStorage.getItem('rrhh_user');
  if (!raw) return;
  try {
    const user = JSON.parse(raw);
    const nombre = `${user.nombre || ''} ${user.apellidos || ''}`.trim() || user.username;
    const iniciales = (user.nombre?.[0] || user.username?.[0] || '?').toUpperCase() + (user.apellidos?.[0] || '').toUpperCase();
    const nameEl = document.getElementById('session-name');
    const roleEl = document.getElementById('session-role');
    const avatarEl = document.getElementById('session-avatar');
    if (nameEl) nameEl.textContent = nombre;
    if (roleEl) roleEl.textContent = `${user.rol || 'RRHH'} · Qubira`;
    if (avatarEl) avatarEl.textContent = iniciales;
  } catch (_) { /* si el user guardado esta corrupto, se deja el placeholder */ }
}

async function logout() {
  try {
    await fetch(
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:4000' : 'https://api-qubira.onrender.com') + '/api/auth/logout',
      { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('rrhh_token') } }
    );
  } catch (_) { /* si ya estaba vencido igual cerramos local */ }
  localStorage.removeItem('rrhh_token');
  localStorage.removeItem('rrhh_user');
  window.location.href = 'login.html';
}

function showBootError() {
  const main = document.querySelector('.main');
  if (main) {
    main.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;text-align:center;padding:20px">
        <strong style="font-size:18px">No se pudo conectar con la API de RRHH</strong>
        <p style="color:var(--text-muted);max-width:420px">Verifica tu conexión e intenta de nuevo. Si el problema persiste, contacta a soporte técnico.</p>
        <button class="btn btn-primary" onclick="location.reload()">Reintentar</button>
      </div>`;
  }
}

document.addEventListener('data:changed', updateBadges);

(async function init() {
  /* Gate de acceso: sin sesión, no se carga nada del panel */
  if (!localStorage.getItem('rrhh_token')) {
    window.location.href = 'login.html';
    return;
  }

  renderSession();
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  try {
    await Store.bootstrap();
  } catch (err) {
    if (err.message !== 'SESSION_EXPIRED') showBootError();
    return;
  }

  initNav();
  updateBadges();
  renderView('dashboard');
})();
