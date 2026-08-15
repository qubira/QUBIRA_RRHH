// Capa de persistencia — conectada a la API centralizada de QUBIRA (API_QUBIRA),
// que a su vez guarda todo en el schema "rrhh" de la base Neon.
// Mantiene los MISMOS nombres de método que la versión anterior (localStorage)
// para no tener que tocar el resto de los módulos de página: los getters
// siguen siendo síncronos (leen de una caché en memoria ya cargada por
// bootstrap()), y los métodos que escriben (add/update/delete) ahora son
// asíncronos porque pegan contra la API.

const QR_API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000'
  : 'https://api-qubira.onrender.com';

function qrToken() { return localStorage.getItem('rrhh_token') || null; }

async function qrFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = qrToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(QR_API_BASE + path, { ...opts, headers });

  if (res.status === 401) {
    localStorage.removeItem('rrhh_token');
    localStorage.removeItem('rrhh_user');
    window.location.href = 'login.html';
    throw new Error('SESSION_EXPIRED');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
  return data;
}

/* Caché en memoria — misma forma que el viejo objeto `db` de localStorage */
let db = {
  departments: [], employees: [], contracts: [], documents: [],
  jobPostings: [], candidates: [], payrollRecords: [], vacations: [],
  trainings: [], trainingEnrollments: [], performanceReviews: [],
  climateSurveys: [], climateSurveyResponses: [], conflictCases: [],
  catalogs: {}, auditLog: [], privileged: false,
};

/* Carga inicial — hay que esperarla antes de renderizar cualquier vista */
async function bootstrap() {
  const res = await qrFetch('/api/rrhh/bootstrap');
  db = res.data;
  return db;
}

/* Vuelve a traer todo desde el servidor (por si dos personas editan a la vez) */
async function refresh() {
  return bootstrap();
}

export const Store = {
  bootstrap,
  refresh,

  // Cuentas del sistema (tabla `usuarios`, compartida por todo Qubira) —
  // solo lectura desde RRHH: se crean al dar de alta un empleado y la
  // contraseña solo la restablece el panel de Soporte.
  getAccounts: async () => (await qrFetch('/api/usuarios')).usuarios,
  getRoles: async () => (await qrFetch('/api/rrhh/roles')).data,

  // Departments
  getDepartments: () => db.departments,
  getDepartment: (id) => db.departments.find(d => d.id === id),
  addDepartment: async (dep) => {
    const res = await qrFetch('/api/rrhh/departamentos', { method: 'POST', body: JSON.stringify(dep) });
    db.departments.push(res.data);
    return res.data;
  },
  updateDepartment: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/departamentos/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.departments.findIndex(d => d.id === id);
    if (i >= 0) db.departments[i] = res.data;
    return res.data;
  },
  deleteDepartment: async (id) => {
    await qrFetch(`/api/rrhh/departamentos/${id}`, { method: 'DELETE' });
    db.departments = db.departments.filter(d => d.id !== id);
  },

  // Employees
  getEmployees: () => db.employees,
  getEmployee: (id) => db.employees.find(e => e.id === id),
  // Si es true, esta cuenta ve los datos sensibles del empleado directo,
  // sin pedir contraseña (Área de trabajo = ADG y Cargo = Gerente).
  isPrivileged: () => !!db.privileged,
  // Verifica la propia contraseña de quien está logueado y, si es correcta,
  // devuelve ese empleado con TODOS los campos sin enmascarar.
  unlockEmployee: async (id, password) => {
    const res = await qrFetch(`/api/rrhh/empleados/${id}/unlock`, {
      method: 'POST', body: JSON.stringify({ password }),
    });
    return res.data;
  },
  addEmployee: async (emp, meta = {}) => {
    const res = await qrFetch('/api/rrhh/empleados', { method: 'POST', body: JSON.stringify({ ...emp, meta }) });
    db.employees.push(res.data);
    await refreshAuditLog();
    return res.data;
  },
  updateEmployee: async (id, changes, meta = {}) => {
    const res = await qrFetch(`/api/rrhh/empleados/${id}`, { method: 'PUT', body: JSON.stringify({ ...changes, meta }) });
    const i = db.employees.findIndex(e => e.id === id);
    if (i >= 0) db.employees[i] = res.data;
    await refreshAuditLog();
    return res.data;
  },
  getAuditLogByEmployee: (employeeId) => db.auditLog.filter(a => a.employeeId === employeeId).sort((a, b) => b.fecha.localeCompare(a.fecha)),
  deleteEmployee: async (id) => {
    await qrFetch(`/api/rrhh/empleados/${id}`, { method: 'DELETE' });
    db.employees = db.employees.filter(e => e.id !== id);
    db.contracts = db.contracts.filter(c => c.employeeId !== id);
    db.documents = db.documents.filter(doc => doc.employeeId !== id);
    db.payrollRecords = db.payrollRecords.filter(p => p.employeeId !== id);
    db.vacations = db.vacations.filter(v => v.employeeId !== id);
    db.trainingEnrollments = db.trainingEnrollments.filter(en => en.employeeId !== id);
    db.performanceReviews = db.performanceReviews.filter(r => r.employeeId !== id);
    db.auditLog = db.auditLog.filter(a => a.employeeId !== id);
  },

  // Catálogos editables (tipo de documento, nacionalidad, ubicación, etc.)
  getCatalog: (catalogKey) => db.catalogs[catalogKey] || [],
  getCatalogItem: (catalogKey, id) => (db.catalogs[catalogKey] || []).find(i => i.id === id),
  addCatalogItem: async (catalogKey, nombre, parentId = null) => {
    const res = await qrFetch(`/api/rrhh/catalogos/${encodeURIComponent(catalogKey)}`, {
      method: 'POST', body: JSON.stringify({ nombre, parentId }),
    });
    if (!db.catalogs[catalogKey]) db.catalogs[catalogKey] = [];
    db.catalogs[catalogKey].push(res.data);
    return res.data;
  },
  updateCatalogItem: async (catalogKey, id, nombre) => {
    const res = await qrFetch(`/api/rrhh/catalogos/item/${id}`, {
      method: 'PUT', body: JSON.stringify({ nombre }),
    });
    const list = db.catalogs[catalogKey] || [];
    const i = list.findIndex(item => item.id === id);
    if (i >= 0) list[i] = { ...list[i], nombre: res.data.nombre };
    return res.data;
  },
  deleteCatalogItem: async (catalogKey, id) => {
    await qrFetch(`/api/rrhh/catalogos/item/${id}`, { method: 'DELETE' });
    for (const key of Object.keys(db.catalogs)) {
      db.catalogs[key] = db.catalogs[key].filter(item => item.id !== id && item.parentId !== id);
    }
  },

  // Foto de perfil (sube a Cloudinary vía la API, no usa qrFetch porque
  // el body es FormData y no debe llevar Content-Type: application/json)
  uploadFoto: async (file) => {
    const token = qrToken();
    const fd = new FormData();
    fd.append('foto', file);

    const res = await fetch(QR_API_BASE + '/api/rrhh/empleados/foto', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: fd,
    });

    if (res.status === 401) {
      localStorage.removeItem('rrhh_token');
      localStorage.removeItem('rrhh_user');
      window.location.href = 'login.html';
      throw new Error('SESSION_EXPIRED');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
    return data.data.url;
  },

  // Contracts
  getContracts: () => db.contracts,
  getContract: (id) => db.contracts.find(c => c.id === id),
  getContractsByEmployee: (employeeId) => db.contracts.filter(c => c.employeeId === employeeId),
  addContract: async (c) => {
    const res = await qrFetch('/api/rrhh/contratos', { method: 'POST', body: JSON.stringify(c) });
    db.contracts.push(res.data);
    return res.data;
  },
  updateContract: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/contratos/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.contracts.findIndex(c => c.id === id);
    if (i >= 0) db.contracts[i] = res.data;
    return res.data;
  },
  deleteContract: async (id) => {
    await qrFetch(`/api/rrhh/contratos/${id}`, { method: 'DELETE' });
    db.contracts = db.contracts.filter(c => c.id !== id);
  },

  // Documents
  getDocuments: () => db.documents,
  getDocumentsByEmployee: (employeeId) => db.documents.filter(d => d.employeeId === employeeId),
  addDocument: async (doc) => {
    const res = await qrFetch('/api/rrhh/documentos', { method: 'POST', body: JSON.stringify(doc) });
    db.documents.push(res.data);
    return res.data;
  },
  deleteDocument: async (id) => {
    await qrFetch(`/api/rrhh/documentos/${id}`, { method: 'DELETE' });
    db.documents = db.documents.filter(d => d.id !== id);
  },

  // Job Postings (Reclutamiento)
  getJobPostings: () => db.jobPostings,
  getJobPosting: (id) => db.jobPostings.find(j => j.id === id),
  addJobPosting: async (j) => {
    const res = await qrFetch('/api/rrhh/vacantes', { method: 'POST', body: JSON.stringify(j) });
    db.jobPostings.push(res.data);
    return res.data;
  },
  updateJobPosting: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/vacantes/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.jobPostings.findIndex(j => j.id === id);
    if (i >= 0) db.jobPostings[i] = res.data;
    return res.data;
  },
  deleteJobPosting: async (id) => {
    await qrFetch(`/api/rrhh/vacantes/${id}`, { method: 'DELETE' });
    db.jobPostings = db.jobPostings.filter(j => j.id !== id);
    db.candidates = db.candidates.filter(c => c.jobPostingId !== id);
  },

  // Candidates (Reclutamiento)
  getCandidates: () => db.candidates,
  getCandidate: (id) => db.candidates.find(c => c.id === id),
  getCandidatesByJobPosting: (jobPostingId) => db.candidates.filter(c => c.jobPostingId === jobPostingId),
  addCandidate: async (c) => {
    const res = await qrFetch('/api/rrhh/candidatos', { method: 'POST', body: JSON.stringify(c) });
    db.candidates.push(res.data);
    return res.data;
  },
  updateCandidate: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/candidatos/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.candidates.findIndex(c => c.id === id);
    if (i >= 0) db.candidates[i] = res.data;
    return res.data;
  },
  deleteCandidate: async (id) => {
    await qrFetch(`/api/rrhh/candidatos/${id}`, { method: 'DELETE' });
    db.candidates = db.candidates.filter(c => c.id !== id);
  },

  // Payroll Records (Nómina)
  getPayrollRecords: () => db.payrollRecords,
  getPayrollRecord: (id) => db.payrollRecords.find(p => p.id === id),
  addPayrollRecord: async (p) => {
    const res = await qrFetch('/api/rrhh/nomina', { method: 'POST', body: JSON.stringify(p) });
    db.payrollRecords.push(res.data);
    return res.data;
  },
  updatePayrollRecord: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/nomina/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.payrollRecords.findIndex(p => p.id === id);
    if (i >= 0) db.payrollRecords[i] = res.data;
    return res.data;
  },
  deletePayrollRecord: async (id) => {
    await qrFetch(`/api/rrhh/nomina/${id}`, { method: 'DELETE' });
    db.payrollRecords = db.payrollRecords.filter(p => p.id !== id);
  },

  // Vacations / Licencias
  getVacations: () => db.vacations,
  getVacation: (id) => db.vacations.find(v => v.id === id),
  addVacation: async (v) => {
    const res = await qrFetch('/api/rrhh/vacaciones', { method: 'POST', body: JSON.stringify(v) });
    db.vacations.push(res.data);
    return res.data;
  },
  updateVacation: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/vacaciones/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.vacations.findIndex(v => v.id === id);
    if (i >= 0) db.vacations[i] = res.data;
    return res.data;
  },
  deleteVacation: async (id) => {
    await qrFetch(`/api/rrhh/vacaciones/${id}`, { method: 'DELETE' });
    db.vacations = db.vacations.filter(v => v.id !== id);
  },

  // Trainings (Capacitación)
  getTrainings: () => db.trainings,
  getTraining: (id) => db.trainings.find(t => t.id === id),
  addTraining: async (t) => {
    const res = await qrFetch('/api/rrhh/capacitaciones', { method: 'POST', body: JSON.stringify(t) });
    db.trainings.push(res.data);
    return res.data;
  },
  updateTraining: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/capacitaciones/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.trainings.findIndex(t => t.id === id);
    if (i >= 0) db.trainings[i] = res.data;
    return res.data;
  },
  deleteTraining: async (id) => {
    await qrFetch(`/api/rrhh/capacitaciones/${id}`, { method: 'DELETE' });
    db.trainings = db.trainings.filter(t => t.id !== id);
    db.trainingEnrollments = db.trainingEnrollments.filter(en => en.trainingId !== id);
  },

  // Training Enrollments
  getEnrollmentsByTraining: (trainingId) => db.trainingEnrollments.filter(en => en.trainingId === trainingId),
  addEnrollment: async (en) => {
    const res = await qrFetch('/api/rrhh/inscripciones', { method: 'POST', body: JSON.stringify(en) });
    db.trainingEnrollments.push(res.data);
    return res.data;
  },
  deleteEnrollment: async (id) => {
    await qrFetch(`/api/rrhh/inscripciones/${id}`, { method: 'DELETE' });
    db.trainingEnrollments = db.trainingEnrollments.filter(en => en.id !== id);
  },

  // Performance Reviews (Evaluación de Desempeño)
  getPerformanceReviews: () => db.performanceReviews,
  getPerformanceReview: (id) => db.performanceReviews.find(r => r.id === id),
  addPerformanceReview: async (r) => {
    const res = await qrFetch('/api/rrhh/evaluaciones', { method: 'POST', body: JSON.stringify(r) });
    db.performanceReviews.push(res.data);
    return res.data;
  },
  updatePerformanceReview: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/evaluaciones/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.performanceReviews.findIndex(r => r.id === id);
    if (i >= 0) db.performanceReviews[i] = res.data;
    return res.data;
  },
  deletePerformanceReview: async (id) => {
    await qrFetch(`/api/rrhh/evaluaciones/${id}`, { method: 'DELETE' });
    db.performanceReviews = db.performanceReviews.filter(r => r.id !== id);
  },

  // Climate Surveys (Clima Laboral)
  getClimateSurveys: () => db.climateSurveys,
  getClimateSurvey: (id) => db.climateSurveys.find(s => s.id === id),
  addClimateSurvey: async (s) => {
    const res = await qrFetch('/api/rrhh/encuestas-clima', { method: 'POST', body: JSON.stringify(s) });
    db.climateSurveys.push(res.data);
    return res.data;
  },
  updateClimateSurvey: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/encuestas-clima/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.climateSurveys.findIndex(s => s.id === id);
    if (i >= 0) db.climateSurveys[i] = res.data;
    return res.data;
  },
  deleteClimateSurvey: async (id) => {
    await qrFetch(`/api/rrhh/encuestas-clima/${id}`, { method: 'DELETE' });
    db.climateSurveys = db.climateSurveys.filter(s => s.id !== id);
    db.climateSurveyResponses = db.climateSurveyResponses.filter(r => r.surveyId !== id);
  },

  // Climate Survey Responses
  getSurveyResponses: () => db.climateSurveyResponses,
  getResponsesBySurvey: (surveyId) => db.climateSurveyResponses.filter(r => r.surveyId === surveyId),
  addSurveyResponse: async (r) => {
    const res = await qrFetch('/api/rrhh/respuestas-clima', { method: 'POST', body: JSON.stringify(r) });
    db.climateSurveyResponses.push(res.data);
    return res.data;
  },
  deleteSurveyResponse: async (id) => {
    await qrFetch(`/api/rrhh/respuestas-clima/${id}`, { method: 'DELETE' });
    db.climateSurveyResponses = db.climateSurveyResponses.filter(r => r.id !== id);
  },

  // Conflict Cases (Clima Laboral)
  getConflictCases: () => db.conflictCases,
  getConflictCase: (id) => db.conflictCases.find(c => c.id === id),
  addConflictCase: async (c) => {
    const res = await qrFetch('/api/rrhh/casos-conflicto', { method: 'POST', body: JSON.stringify(c) });
    db.conflictCases.push(res.data);
    return res.data;
  },
  updateConflictCase: async (id, changes) => {
    const res = await qrFetch(`/api/rrhh/casos-conflicto/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    const i = db.conflictCases.findIndex(c => c.id === id);
    if (i >= 0) db.conflictCases[i] = res.data;
    return res.data;
  },
  deleteConflictCase: async (id) => {
    await qrFetch(`/api/rrhh/casos-conflicto/${id}`, { method: 'DELETE' });
    db.conflictCases = db.conflictCases.filter(c => c.id !== id);
  },
};

async function refreshAuditLog() {
  /* El log de auditoría se recalcula en el servidor (diffs campo a campo);
     lo volvemos a traer completo para mantener la caché local al día. */
  try {
    const res = await qrFetch('/api/rrhh/bootstrap');
    db.auditLog = res.data.auditLog;
  } catch (_) { /* si falla, el resto de la app sigue funcionando */ }
}
