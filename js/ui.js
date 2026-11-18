import { icon } from './utils.js';

const overlay = document.getElementById('modal-overlay');
const toastContainer = document.getElementById('toast-container');

let activeResolve = null;

export function openModal({ title, bodyHtml, footerHtml = '', size = '' }) {
  overlay.innerHTML = `
    <div class="modal ${size ? 'modal--' + size : ''}">
      <div class="modal__header">
        <h2>${title}</h2>
        <button class="close-btn" data-close>${icon('close')}</button>
      </div>
      <div class="modal__body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal__footer">${footerHtml}</div>` : ''}
    </div>
  `;
  overlay.classList.add('active');
  overlay.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeModal));
  return overlay.querySelector('.modal');
}

export function closeModal() {
  overlay.classList.remove('active');
  overlay.innerHTML = '';
  if (activeResolve) { activeResolve(false); activeResolve = null; }
}

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('active')) closeModal();
});

export function confirmDialog(message, { title = 'Confirmar acción', confirmLabel = 'Eliminar', danger = true } = {}) {
  return new Promise((resolve) => {
    activeResolve = resolve;
    openModal({
      title,
      size: 'sm',
      bodyHtml: `<p style="margin:0;color:var(--text-muted);font-size:13.5px;">${message}</p>`,
      footerHtml: `
        <button class="btn btn-secondary" data-close>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${confirmLabel}</button>
      `,
    });
    document.getElementById('confirm-ok').addEventListener('click', () => {
      activeResolve = null;
      resolve(true);
      closeModal();
    });
  });
}

/* Pide un motivo (anular): devuelve el texto o null si se cancela */
export function motivoDialog(message, { title = 'Anular', confirmLabel = 'Anular' } = {}) {
  return new Promise((resolve) => {
    activeResolve = () => resolve(null);
    openModal({
      title, size: 'sm',
      bodyHtml: `<p style="margin:0 0 10px;color:var(--text-muted);font-size:13.5px;">${message}</p>
        <textarea id="motivo-txt" rows="3" style="width:100%" placeholder="Motivo (obligatorio)"></textarea>`,
      footerHtml: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-danger" id="motivo-ok">${confirmLabel}</button>`,
    });
    const txt = document.getElementById('motivo-txt'); setTimeout(() => txt.focus(), 50);
    document.getElementById('motivo-ok').addEventListener('click', () => {
      if (!txt.value.trim()) { txt.focus(); return; }
      const v = txt.value.trim();
      activeResolve = null; resolve(v); closeModal();
    });
  });
}

export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'bell';
  el.innerHTML = `${icon(iconName)}<span>${message}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 200);
  }, 3200);
}
