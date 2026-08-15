export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const fecha = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fecha} ${hora}`;
}

export const HIJOS_OPTIONS = ['0', '1', '2', '3', '4', '5', '6+'];

let ipPromise = null;
export function getClientIp() {
  if (!ipPromise) {
    const signal = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(3000) : undefined;
    ipPromise = fetch('https://api.ipify.org?format=json', { signal })
      .then(r => r.json())
      .then(d => d.ip)
      .catch(() => 'No disponible');
  }
  return ipPromise;
}

export function formatMoney(value) {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function daysBetween(fromIso, toIso) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return Math.round((to - from) / 86400000);
}

export function initials(nombre, apellido) {
  return `${(nombre || '?')[0]}${(apellido || '?')[0]}`.toUpperCase();
}

export function fullName(emp) {
  if (emp.primerNombre || emp.primerApellido) {
    return [emp.primerNombre, emp.segundoNombre, emp.primerApellido, emp.segundoApellido].filter(Boolean).join(' ');
  }
  return `${emp.nombre} ${emp.apellido}`;
}

export function contractStatus(contract) {
  if (contract.finalizadoManual) return 'finalizado';
  if (!contract.fechaFin) return 'vigente';
  const today = new Date().toISOString().slice(0, 10);
  const diff = daysBetween(today, contract.fechaFin);
  if (diff < 0) return 'vencido';
  if (diff <= 30) return 'proximo';
  return 'vigente';
}

export const CONTRACT_STATUS_META = {
  vigente: { label: 'Vigente', cls: 'badge-green' },
  proximo: { label: 'Próximo a vencer', cls: 'badge-amber' },
  vencido: { label: 'Vencido', cls: 'badge-red' },
  finalizado: { label: 'Finalizado', cls: 'badge-gray' },
};

export const EMPLOYEE_STATUS_META = {
  activo: { label: 'Activo', cls: 'badge-green' },
  inactivo: { label: 'Inactivo', cls: 'badge-gray' },
};

// ---- Reclutamiento ----
export const JOB_POSTING_STATUS_META = {
  'Abierta': { label: 'Abierta', cls: 'badge-green' },
  'En proceso': { label: 'En proceso', cls: 'badge-amber' },
  'Cerrada': { label: 'Cerrada', cls: 'badge-gray' },
};

export const CANDIDATE_STAGES = ['Postulado', 'Entrevista', 'Evaluación', 'Oferta', 'Contratado', 'Descartado'];

// ---- Nómina y licencias ----
export const PAYROLL_STATUS_META = {
  'Pendiente': { label: 'Pendiente', cls: 'badge-amber' },
  'Pagado': { label: 'Pagado', cls: 'badge-green' },
};

export const VACATION_STATUS_META = {
  'Pendiente': { label: 'Pendiente', cls: 'badge-amber' },
  'Aprobada': { label: 'Aprobada', cls: 'badge-green' },
  'Rechazada': { label: 'Rechazada', cls: 'badge-red' },
};

// ---- Capacitación ----
export const TRAINING_STATUS_META = {
  'Programada': { label: 'Programada', cls: 'badge-gray' },
  'En curso': { label: 'En curso', cls: 'badge-amber' },
  'Finalizada': { label: 'Finalizada', cls: 'badge-green' },
  'Cancelada': { label: 'Cancelada', cls: 'badge-red' },
};

export const ENROLLMENT_STATUS_META = {
  'Inscripto': { label: 'Inscripto', cls: 'badge-gray' },
  'En curso': { label: 'En curso', cls: 'badge-amber' },
  'Completado': { label: 'Completado', cls: 'badge-green' },
  'Abandonado': { label: 'Abandonado', cls: 'badge-red' },
};

// ---- Evaluación de desempeño ----
export const PERFORMANCE_STATUS_META = {
  'Borrador': { label: 'Borrador', cls: 'badge-gray' },
  'Completada': { label: 'Completada', cls: 'badge-green' },
};

export function performanceScore(review) {
  const vals = [review.puntualidad, review.calidad, review.trabajoEquipo, review.liderazgo].filter(v => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function scoreBadgeClass(score) {
  if (score == null) return 'badge-gray';
  if (score >= 4) return 'badge-green';
  if (score >= 3) return 'badge-amber';
  return 'badge-red';
}

// ---- Clima laboral ----
export const SURVEY_STATUS_META = {
  'Activa': { label: 'Activa', cls: 'badge-green' },
  'Cerrada': { label: 'Cerrada', cls: 'badge-gray' },
};

export const CONFLICT_STATUS_META = {
  'Abierto': { label: 'Abierto', cls: 'badge-red' },
  'En mediación': { label: 'En mediación', cls: 'badge-amber' },
  'Resuelto': { label: 'Resuelto', cls: 'badge-green' },
  'Cerrado': { label: 'Cerrado', cls: 'badge-gray' },
};

export function average(numbers) {
  const vals = numbers.filter(n => n != null && !isNaN(n));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function icon(name, cls = 'icon') {
  return `<svg class="${cls}"><use href="#icon-${name}"></use></svg>`;
}
