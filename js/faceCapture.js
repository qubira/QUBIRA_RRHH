// Reconocimiento facial de colaboradores — RRHH captura el rostro al dar de
// alta (o después, editando) al empleado. Todo el cómputo (detección +
// descriptor de 128 dimensiones) corre en el navegador vía face-api.js; el
// servidor solo recibe y guarda esos vectores, nunca una foto ni video.
import { icon, escapeHtml } from './utils.js';
import { openModal, closeModal, toast } from './ui.js';

const QR_API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000'
  : 'https://api-qubira.onrender.com';

function rrhhToken() { return localStorage.getItem('rrhh_token') || null; }

async function faceApiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = rrhhToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(QR_API_BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
  return data;
}

export function getFaceStatus(username) {
  return faceApiFetch('/api/auth/face/status?username=' + encodeURIComponent(username));
}

export function removeFaceEnrollment(username) {
  return faceApiFetch('/api/auth/face/enroll?username=' + encodeURIComponent(username), { method: 'DELETE' });
}

// ─── Carga perezosa de face-api.js + modelos (solo cuando hace falta) ─────────
let faceApiScriptPromise = null;
function loadFaceApiScript() {
  if (!faceApiScriptPromise) {
    faceApiScriptPromise = new Promise((resolve, reject) => {
      if (window.faceapi) return resolve();
      const s = document.createElement('script');
      s.src = 'vendor/face-api/face-api.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar el módulo de reconocimiento facial'));
      document.head.appendChild(s);
    });
  }
  return faceApiScriptPromise;
}

let faceModelsPromise = null;
function loadFaceModels() {
  if (!faceModelsPromise) {
    faceModelsPromise = loadFaceApiScript().then(() => Promise.all([
      window.faceapi.nets.tinyFaceDetector.loadFromUri('vendor/face-api/models'),
      window.faceapi.nets.faceLandmark68Net.loadFromUri('vendor/face-api/models'),
      window.faceapi.nets.faceRecognitionNet.loadFromUri('vendor/face-api/models'),
    ]));
  }
  return faceModelsPromise;
}

const SAMPLES_NEEDED = 5;

/* Abre el modal de captura para un colaborador puntual. Resuelve `true`
   si el rostro quedó guardado, `false` si se canceló. */
export function openFaceEnrollModal({ username, label }) {
  return new Promise((resolve) => {
    let stream = null;
    let loopActive = false;
    let currentDescriptor = null;
    let settled = false;
    const samples = [];

    const modal = openModal({
      title: 'Reconocimiento facial',
      size: 'sm',
      bodyHtml: `
        <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:14px">
          Capturando el rostro de <strong>${escapeHtml(label)}</strong>. Pídele que mire directo a
          la cámara, con buena luz, y varíe un poco el ángulo y el gesto entre cada captura
          (ej. gira levemente, inclina la cabeza, sonríe) — mientras más variado, mejor lo va a
          reconocer después (${SAMPLES_NEEDED} en total).
        </p>
        <div style="position:relative;width:220px;height:220px;margin:0 auto 14px;border-radius:50%;overflow:hidden;background:#111827">
          <video id="face-enroll-video" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1)"></video>
          <div id="face-enroll-ring" style="position:absolute;inset:0;border-radius:50%;border:3px solid var(--border);pointer-events:none;transition:border-color .2s ease"></div>
        </div>
        <p id="face-enroll-status" style="text-align:center;font-size:13px;font-weight:600;color:var(--text-muted);min-height:18px;margin-bottom:6px">Preparando la cámara...</p>
        <div style="display:flex;justify-content:center;gap:6px" id="face-enroll-dots"></div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="face-enroll-cancel">Cancelar</button>
        <button class="btn btn-primary" id="face-enroll-capture" disabled>${icon('camera')} Capturar (0/${SAMPLES_NEEDED})</button>
        <button class="btn btn-primary" id="face-enroll-save" style="display:none">Guardar rostro</button>
      `,
    });

    const videoEl = modal.querySelector('#face-enroll-video');
    const ringEl = modal.querySelector('#face-enroll-ring');
    const statusEl = modal.querySelector('#face-enroll-status');
    const dotsEl = modal.querySelector('#face-enroll-dots');
    const captureBtn = modal.querySelector('#face-enroll-capture');
    const saveBtn = modal.querySelector('#face-enroll-save');
    const cancelBtn = modal.querySelector('#face-enroll-cancel');

    function renderDots() {
      dotsEl.innerHTML = Array.from({ length: SAMPLES_NEEDED }).map((_, i) =>
        `<span style="width:8px;height:8px;border-radius:50%;background:${i < samples.length ? 'var(--success)' : 'var(--border)'};display:inline-block"></span>`
      ).join('');
    }

    function setStatus(text, color) {
      statusEl.textContent = text;
      statusEl.style.color = color || 'var(--text-muted)';
      ringEl.style.borderColor = color || 'var(--border)';
    }

    function stopStream() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    }

    function finish(saved) {
      if (settled) return;
      settled = true;
      loopActive = false;
      stopStream();
      resolve(saved);
    }

    async function detectLoop() {
      if (!loopActive) return;
      try {
        const options = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
        const result = await window.faceapi.detectSingleFace(videoEl, options).withFaceLandmarks().withFaceDescriptor();
        if (result) {
          currentDescriptor = result.descriptor;
          if (samples.length < SAMPLES_NEEDED) {
            setStatus('Rostro detectado — listo para capturar', 'var(--success)');
            captureBtn.disabled = false;
          }
        } else {
          currentDescriptor = null;
          if (samples.length < SAMPLES_NEEDED) {
            setStatus('Buscando un rostro...', null);
            captureBtn.disabled = true;
          }
        }
      } catch (_) { /* un frame fallido no corta el ciclo */ }
      if (loopActive) setTimeout(detectLoop, 500);
    }

    async function init() {
      setStatus('Cargando reconocimiento facial...', null);
      try {
        await loadFaceModels();
      } catch (err) {
        setStatus(err.message, 'var(--danger)');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480, facingMode: 'user' }, audio: false });
      } catch (err) {
        setStatus('No se pudo acceder a la cámara. Revisa los permisos del navegador.', 'var(--danger)');
        return;
      }
      videoEl.srcObject = stream;
      try { await videoEl.play(); } catch (_) { /* algunos navegadores ya la reproducen solos */ }
      loopActive = true;
      renderDots();
      detectLoop();
    }

    captureBtn.addEventListener('click', () => {
      if (!currentDescriptor) return;
      samples.push(Array.from(currentDescriptor));
      currentDescriptor = null;
      renderDots();
      captureBtn.disabled = true;
      if (samples.length >= SAMPLES_NEEDED) {
        captureBtn.style.display = 'none';
        saveBtn.style.display = '';
        setStatus(`${SAMPLES_NEEDED} capturas listas. Guarda para terminar.`, 'var(--success)');
        loopActive = false;
        stopStream();
      } else {
        captureBtn.innerHTML = `${icon('camera')} Capturar (${samples.length}/${SAMPLES_NEEDED})`;
        setStatus('Gira un poco la cara para la próxima captura...', null);
      }
    });

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
      try {
        await faceApiFetch('/api/auth/face/enroll', {
          method: 'POST',
          body: JSON.stringify({ username, descriptors: samples }),
        });
        toast('Rostro registrado correctamente', 'success');
        closeModal();
        finish(true);
      } catch (err) {
        toast(err.message || 'No se pudo guardar el rostro', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar rostro';
      }
    });

    cancelBtn.addEventListener('click', () => {
      closeModal();
      finish(false);
    });

    // El botón × del encabezado (data-close) ya cierra el modal solo —
    // acá enganchamos la limpieza de cámara + la resolución de la promesa.
    modal.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => finish(false)));

    init();
  });
}
