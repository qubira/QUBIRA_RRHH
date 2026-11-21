(() => {
  'use strict';

  const script = document.currentScript;
  const tokenKeys = script.dataset.token.split(',');
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const authUrl = (local ? 'http://localhost:4000' : 'https://api-qubira.onrender.com') + '/api/auth/me';

  const css = document.createElement('style');
  css.textContent = `
    [data-pie-modulo].qb-pie {
      box-sizing: border-box; width: 100%; padding: 12px;
      border-top: 1px solid rgba(255,255,255,.08);
      background: #101623; color: #f8fafc; container-type: inline-size;
    }
    .qb-pie > :not(.qb-pie-contenido) { display: none !important; }
    .qb-pie-identidad { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
    .qb-pie-avatar {
      display: grid; place-items: center; width: 27px; height: 27px; flex: none;
      border-radius: 50%; background: #e0f2fe; color: #075985;
      font: 700 11px/1 system-ui, sans-serif;
    }
    .qb-pie-texto { min-width: 0; }
    .qb-pie-nombre { font: 700 11px/1.25 system-ui, sans-serif; overflow-wrap: anywhere; }
    .qb-pie-puesto { color: #a9c0d9; font: 500 10px/1.25 system-ui, sans-serif; overflow-wrap: anywhere; }
    .qb-pie-acciones { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; }
    .qb-pie .qb-pie-acciones > .qb-pie-boton {
      box-sizing: border-box; display: flex; justify-content: center; align-items: center; gap: 4px;
      width: 100%; min-width: 0; min-height: 24px; height: auto; margin: 0; padding: 3px;
      border: 1px solid #323844; border-radius: 4px; background: #202532; color: #f8fafc;
      font: 700 10px/1.2 system-ui, sans-serif; text-decoration: none; cursor: pointer;
    }
    .qb-pie .qb-pie-acciones > .qb-pie-boton:hover { background: #30394a; }
    .qb-pie-boton svg { width: 12px; height: 12px; flex: none; }
    .qb-pie-boton .qb-pie-icono-salir { display: none; }
    @container (max-width: 120px) {
      .qb-pie-identidad { justify-content: center; }
      .qb-pie-texto, .qb-pie-boton span { display: none; }
      .qb-pie-acciones { grid-template-columns: minmax(0,1fr); }
      .qb-pie-boton .qb-pie-icono-salir { display: block; }
    }
  `;
  document.head.append(css);

  const svg = (path, className = '') => `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${path}</svg>`;
  const modulos = svg('<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>');
  const salir = svg('<path d="M10 3H4v18h6m4-14 5 5-5 5m-5-5h10"/>', 'qb-pie-icono-salir');
  let perfil, tokenConsultado;
  const vacio = { nombre: '—', iniciales: '—', puesto: '— - —' };

  function pintar(pie) {
    if (pie.classList.contains('qb-pie')) return;
    const cambiarModulo = pie.querySelector('[data-pie-cambiar]');
    const cerrarSesion = pie.querySelector('[data-pie-salir]');
    if (!cambiarModulo || !cerrarSesion) return;

    const contenido = document.createElement('div');
    contenido.className = 'qb-pie-contenido';
    contenido.innerHTML = `
      <div class="qb-pie-identidad">
        <div class="qb-pie-avatar" aria-hidden="true"></div>
        <div class="qb-pie-texto">
          <div class="qb-pie-nombre"></div>
          <div class="qb-pie-puesto"></div>
        </div>
      </div>
      <div class="qb-pie-acciones"></div>
    `;
    cambiarModulo.classList.add('qb-pie-boton');
    cambiarModulo.setAttribute('aria-label', 'Módulos');
    cambiarModulo.innerHTML = modulos + '<span>Módulos</span>';
    cerrarSesion.classList.add('qb-pie-boton');
    cerrarSesion.setAttribute('aria-label', 'Salir');
    cerrarSesion.innerHTML = salir + '<span>Salir</span>';
    contenido.querySelector('.qb-pie-acciones').append(cambiarModulo, cerrarSesion);
    pie.append(contenido);
    pie.classList.add('qb-pie');
  }

  function actualizarPerfil(pie) {
    pintar(pie);
    if (!pie.classList.contains('qb-pie')) return;
    const datos = perfil || vacio;
    pie.querySelector('.qb-pie-avatar').textContent = datos.iniciales;
    const nombre = pie.querySelector('.qb-pie-nombre');
    nombre.textContent = nombre.title = datos.nombre;
    const puesto = pie.querySelector('.qb-pie-puesto');
    puesto.textContent = puesto.title = datos.puesto;
  }

  function actualizar() {
    const pies = document.querySelectorAll('[data-pie-modulo]');
    if (!pies.length) return;
    const token = tokenKeys.map(key => localStorage.getItem(key)).find(Boolean);
    if (token === tokenConsultado) {
      pies.forEach(actualizarPerfil);
      return;
    }

    tokenConsultado = token;
    perfil = null;
    pies.forEach(actualizarPerfil);
    if (!token) return;
    fetch(authUrl, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    }).then(response => response.ok ? response.json() : null).then(data => {
      if (!data?.user || tokenConsultado !== token) return;
      const user = data.user;
      const [apellidoCuenta, segundoApellidoCuenta] = (user.apellidos || '').trim().split(/\s+/);
      const { nombre, apellido, segundoApellido, puesto, area } = user.perfilModulo || {
        nombre: (user.nombre || '').trim().split(/\s+/)[0],
        apellido: apellidoCuenta,
        segundoApellido: segundoApellidoCuenta,
        puesto: user.subcargo,
      };
      const inicial = Array.from(segundoApellido || '')[0];
      perfil = {
        nombre: [nombre, apellido, inicial && `${inicial}.`].filter(Boolean).join(' ').toLocaleUpperCase('es')
          || data.user.username,
        iniciales: [nombre, apellido].map(parte => Array.from(parte || '')[0] || '').join('').toLocaleUpperCase('es')
          || data.user.username?.slice(0, 2).toLocaleUpperCase('es') || '—',
        puesto: [puesto || '—', area || '—'].join(' - '),
      };
      actualizar();
    }).catch(() => {});
  }

  const sidebar = document.getElementById('sidebar-container');
  if (sidebar) new MutationObserver(actualizar).observe(sidebar, { childList: true });

  actualizar();
})();
