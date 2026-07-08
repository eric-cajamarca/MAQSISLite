const API = '/api';

let gpsIniciar = { lat: null, lng: null };
let gpsCompleto = { lat: null, lng: null };
let clientesCache = [];
let currentUser = null;
let catalogoPermisos = {};

const modalElegirCliente = new bootstrap.Modal('#modalElegirCliente');
const modalFormCliente = new bootstrap.Modal('#modalFormCliente');
const modalFormMaquinaria = new bootstrap.Modal('#modalFormMaquinaria');
const modalFormUsuario = new bootstrap.Modal('#modalFormUsuario');
const modalFormGasto = new bootstrap.Modal('#modalFormGasto');
const modalCerrarTurno = new bootstrap.Modal('#modalCerrarTurno');

let maquinariaCache = [];

function hasPermiso(perm) {
  return !!(currentUser && Array.isArray(currentUser.permisos) && currentUser.permisos.includes(perm));
}

function aplicarPermisosUI() {
  if (!currentUser) return;

  document.querySelectorAll('[data-perm-tab]').forEach((li) => {
    li.classList.toggle('d-none', !hasPermiso(li.dataset.permTab));
  });

  document.querySelectorAll('[data-perm]').forEach((el) => {
    el.classList.toggle('d-none', !hasPermiso(el.dataset.perm));
  });

  const rolLabel = currentUser.rol === 'admin' ? ' (Admin)' : '';
  document.getElementById('navUsuario').textContent = (currentUser.nombre || currentUser.usuario) + rolLabel;

  const activeBtn = document.querySelector('#mainNav .nav-link.active');
  if (activeBtn && activeBtn.classList.contains('d-none')) {
    const first = document.querySelector('#mainNav .nav-link:not(.d-none)');
    if (first) first.click();
  }
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (res.status === 401) {
    location.href = '/login.html';
    throw new Error('Sesión expirada');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Error en la solicitud');
  return body;
}

async function ensureAuth() {
  try {
    const { data } = await api('/auth/me');
    currentUser = data;
    aplicarPermisosUI();
    return data;
  } catch {
    location.href = '/login.html';
  }
}

document.getElementById('btnLogout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  location.href = '/login.html';
});

function toast(msg, type = 'primary') {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0 show`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function fmtMoney(n) {
  return 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDt(s) {
  if (!s) return '—';
  return String(s).replace('T', ' ').slice(0, 16);
}

function fmtGps(lat, lng) {
  if (lat == null || lng == null) return '';
  const la = Number(lat).toFixed(5);
  const ln = Number(lng).toFixed(5);
  const url = `https://maps.google.com/?q=${lat},${lng}`;
  return `<a href="${url}" target="_blank" rel="noopener" class="text-decoration-none">🛰️ ${la}, ${ln}</a>`;
}

function fmtUbicacion(ubicacion, lat, lng) {
  const partes = [];
  const txt = (ubicacion || '').trim();
  if (txt) partes.push(`📍 ${esc(txt)}`);
  const gps = fmtGps(lat, lng);
  if (gps) partes.push(gps);
  return partes.length ? partes.join('<br>') : '<span class="text-muted">Sin ubicación</span>';
}

function nowLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function firstDayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Navegación (sidebar)
function cerrarSidebarMovil() {
  const inst = bootstrap.Offcanvas.getInstance('#sidebar');
  if (inst) inst.hide();
}

document.querySelectorAll('#mainNav .nav-link').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mainNav .nav-link').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.add('d-none'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('d-none');
    cerrarSidebarMovil();
    if (btn.dataset.tab === 'inicio') cargarResumen();
    if (btn.dataset.tab === 'historial') cargarHistorial();
    if (btn.dataset.tab === 'clientes') cargarClientes();
    if (btn.dataset.tab === 'maquinaria') cargarMaquinaria();
    if (btn.dataset.tab === 'registrar') cargarSelects();
    if (btn.dataset.tab === 'gastos') cargarGastos();
    if (btn.dataset.tab === 'reportes') cargarReportes();
    if (btn.dataset.tab === 'usuarios') cargarUsuarios();
  });
});

async function cargarSelects() {
  const [maq, cli] = await Promise.all([
    api('/maquinaria'),
    api('/clientes')
  ]);
  clientesCache = cli.data || [];
  maquinariaCache = maq.data || [];
  const maqOpts = maquinariaCache.map((m) =>
    `<option value="${m.id}">${m.nombre} (${m.codigo || 's/c'}) — ${fmtMoney(m.tarifa_hora)}/h</option>`
  ).join('');
  const optsCli = '<option value="">— Sin cliente —</option>' + clientesCache.map((c) =>
    `<option value="${c.id}">${c.nombre}</option>`
  ).join('');
  ['iniMaquinaria', 'compMaquinaria'].forEach((id) => {
    document.getElementById(id).innerHTML = '<option value="">Seleccione...</option>' + maqOpts;
  });
  document.getElementById('compCliente').innerHTML = optsCli;
  document.getElementById('iniHora').value = nowLocalInput();
  document.getElementById('compInicio').value = nowLocalInput();
  document.getElementById('compFin').value = nowLocalInput();
}

function opcionesMaquinaria() {
  return '<option value="">Seleccione...</option>' + maquinariaCache.map((m) =>
    `<option value="${m.id}">${esc(m.nombre)} (${esc(m.codigo || 's/c')})</option>`
  ).join('');
}

async function asegurarMaquinariaCache() {
  if (maquinariaCache.length) return;
  const { data } = await api('/maquinaria');
  maquinariaCache = data || [];
}

// --- Modal elegir cliente (iniciar turno) ---
function renderListaClienteModal(filtro = '') {
  const q = filtro.trim().toLowerCase();
  const lista = clientesCache.filter((c) => {
    if (!q) return true;
    const texto = `${c.nombre} ${c.documento || ''} ${c.telefono || ''}`.toLowerCase();
    return texto.includes(q);
  });
  const el = document.getElementById('listaClienteModal');
  if (!lista.length) {
    el.innerHTML = '<div class="text-muted text-center py-3">No hay clientes</div>';
    return;
  }
  el.innerHTML = lista.map((c, i) => `
    <button type="button" class="list-group-item list-group-item-action py-3" data-idx="${i}">
      <div class="fw-semibold">${esc(c.nombre)}</div>
      <small class="text-muted">${esc(c.documento || 'Sin documento')}${c.telefono ? ' · ' + esc(c.telefono) : ''}</small>
    </button>
  `).join('');
  el.querySelectorAll('button[data-idx]').forEach((btn) => {
    btn.addEventListener('click', () => seleccionarClienteIniciar(lista[Number(btn.dataset.idx)]));
  });
}

function seleccionarClienteIniciar(c) {
  if (!c || !c.id) {
    document.getElementById('iniCliente').value = '';
    document.getElementById('iniClienteNombre').value = '';
    document.getElementById('iniClienteInfo').textContent = '';
    modalElegirCliente.hide();
    return;
  }
  document.getElementById('iniCliente').value = c.id;
  document.getElementById('iniClienteNombre').value = c.nombre || '';
  const partes = [c.documento, c.telefono].filter(Boolean);
  document.getElementById('iniClienteInfo').textContent = partes.join(' · ');
  if (c.direccion && !document.getElementById('iniUbicacion').value.trim()) {
    document.getElementById('iniUbicacion').value = c.direccion;
  }
  modalElegirCliente.hide();
}

async function abrirModalElegirCliente() {
  try {
    const { data } = await api('/clientes');
    clientesCache = data || [];
    document.getElementById('buscarClienteModal').value = '';
    renderListaClienteModal();
    modalElegirCliente.show();
    setTimeout(() => document.getElementById('buscarClienteModal').focus(), 300);
  } catch (err) {
    toast(err.message, 'danger');
  }
}

document.getElementById('btnElegirClienteIni').addEventListener('click', abrirModalElegirCliente);
document.getElementById('buscarClienteModal').addEventListener('input', (e) => {
  renderListaClienteModal(e.target.value);
});
document.getElementById('btnSinClienteModal').addEventListener('click', () => {
  seleccionarClienteIniciar(null);
});

function pedirGps(target) {
  if (!navigator.geolocation) {
    toast('GPS no disponible en este navegador', 'warning');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      target.lat = pos.coords.latitude;
      target.lng = pos.coords.longitude;
      const info = document.getElementById(target === gpsIniciar ? 'gpsIniciarInfo' : 'gpsCompletoInfo');
      info.textContent = `GPS: ${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`;
    },
    () => toast('No se pudo obtener ubicación', 'warning')
  );
}

document.getElementById('btnGpsIniciar').addEventListener('click', () => pedirGps(gpsIniciar));
document.getElementById('btnGpsCompleto').addEventListener('click', () => pedirGps(gpsCompleto));

document.getElementById('formIniciar').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/registros/iniciar', {
      method: 'POST',
      body: JSON.stringify({
        id_maquinaria: document.getElementById('iniMaquinaria').value,
        id_cliente: document.getElementById('iniCliente').value || null,
        hora_inicio: document.getElementById('iniHora').value,
        horometro_inicio: document.getElementById('iniHorometro').value || null,
        ubicacion: document.getElementById('iniUbicacion').value,
        latitud: gpsIniciar.lat,
        longitud: gpsIniciar.lng
      })
    });
    toast('Turno iniciado', 'success');
    gpsIniciar = { lat: null, lng: null };
    document.getElementById('gpsIniciarInfo').textContent = '';
    document.getElementById('formIniciar').reset();
    document.getElementById('iniCliente').value = '';
    document.getElementById('iniClienteInfo').textContent = '';
    document.getElementById('iniHora').value = nowLocalInput();
    cargarResumen();
  } catch (err) {
    toast(err.message, 'danger');
  }
});

document.getElementById('formCompleto').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/registros', {
      method: 'POST',
      body: JSON.stringify({
        id_maquinaria: document.getElementById('compMaquinaria').value,
        id_cliente: document.getElementById('compCliente').value || null,
        hora_inicio: document.getElementById('compInicio').value,
        hora_fin: document.getElementById('compFin').value,
        horometro_inicio: document.getElementById('compHorometroIni').value || null,
        horometro_fin: document.getElementById('compHorometroFin').value || null,
        ubicacion: document.getElementById('compUbicacion').value,
        latitud: gpsCompleto.lat,
        longitud: gpsCompleto.lng
      })
    });
    toast(`Guardado: ${r.data.horas} h → ${fmtMoney(r.data.monto)}`, 'success');
    gpsCompleto = { lat: null, lng: null };
    document.getElementById('gpsCompletoInfo').textContent = '';
    cargarResumen();
  } catch (err) {
    toast(err.message, 'danger');
  }
});

function cerrarTurno(id, info = '') {
  document.getElementById('cerrarTurnoId').value = id;
  document.getElementById('cerrarHoraFin').value = nowLocalInput();
  document.getElementById('cerrarHorometroFin').value = '';
  document.getElementById('cerrarTurnoInfo').textContent = info || '';
  modalCerrarTurno.show();
}

document.getElementById('formCerrarTurno').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('cerrarTurnoId').value;
  try {
    const r = await api(`/registros/${id}/cerrar`, {
      method: 'POST',
      body: JSON.stringify({
        hora_fin: document.getElementById('cerrarHoraFin').value,
        horometro_fin: document.getElementById('cerrarHorometroFin').value || null
      })
    });
    modalCerrarTurno.hide();
    toast(`Cerrado: ${r.data.horas} h — ${fmtMoney(r.data.monto)}`, 'success');
    cargarResumen();
    if (!document.getElementById('tab-historial').classList.contains('d-none')) cargarHistorial();
  } catch (err) {
    toast(err.message, 'danger');
  }
});

async function cargarResumen() {
  const desde = document.getElementById('filtroDesde').value || firstDayMonth();
  const hasta = document.getElementById('filtroHasta').value || todayStr();
  document.getElementById('filtroDesde').value = desde;
  document.getElementById('filtroHasta').value = hasta;

  const { data } = await api(`/reportes/resumen?desde=${desde}&hasta=${hasta}`);
  document.getElementById('kpiIngresos').textContent = fmtMoney(data.totales.total_ingresos);
  document.getElementById('kpiHoras').textContent = Number(data.totales.total_horas || 0).toFixed(2);
  document.getElementById('kpiEnCurso').textContent = (data.enCurso || []).length;

  document.getElementById('tablaPorMaquina').innerHTML = (data.porMaquina || []).map((m) => `
    <tr>
      <td>${esc(m.nombre)}<br><small class="text-muted">${esc(m.codigo || '')}</small></td>
      <td>${Number(m.horas).toFixed(2)}</td>
      <td class="text-success fw-semibold">${fmtMoney(m.ingresos)}</td>
    </tr>
  `).join('') || '<tr><td colspan="3" class="text-muted">Sin datos en el período</td></tr>';

  const lista = document.getElementById('listaEnCurso');
  if (!(data.enCurso || []).length) {
    lista.innerHTML = '<div class="text-muted small py-2">No hay turnos en curso</div>';
    return;
  }
  lista.innerHTML = data.enCurso.map((t) => `
    <div class="list-group-item d-flex justify-content-between align-items-center gap-2 py-2">
      <div class="small">
        <strong>${esc(t.maquinaria)}</strong><br>
        <span class="text-muted">${esc(t.cliente || 'Sin cliente')} · ${fmtDt(t.hora_inicio)}</span><br>
        <span class="text-muted">${fmtUbicacion(t.ubicacion, t.latitud, t.longitud)}</span>
      </div>
      ${hasPermiso('registrar') ? `<button class="btn btn-sm btn-warning flex-shrink-0" data-cerrar="${t.id}" data-info="${esc(t.maquinaria)} · inicio ${fmtDt(t.hora_inicio)}">Cerrar</button>` : ''}
    </div>
  `).join('');

  lista.querySelectorAll('[data-cerrar]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarTurno(btn.dataset.cerrar, btn.dataset.info));
  });
}

document.getElementById('btnFiltrar').addEventListener('click', cargarResumen);

function claseUtilidad(n) {
  const v = Number(n || 0);
  if (v > 0) return 'text-success';
  if (v < 0) return 'text-danger';
  return 'text-muted';
}

async function cargarReportes() {
  const desde = document.getElementById('repDesde').value || firstDayMonth();
  const hasta = document.getElementById('repHasta').value || todayStr();
  document.getElementById('repDesde').value = desde;
  document.getElementById('repHasta').value = hasta;

  const { data } = await api(`/reportes/rentabilidad?desde=${desde}&hasta=${hasta}`);
  const t = data.totales || {};

  document.getElementById('repIngresos').textContent = fmtMoney(t.ingresos);
  document.getElementById('repGastos').textContent = fmtMoney(t.gastos_total);
  const elUtil = document.getElementById('repUtilidad');
  elUtil.textContent = fmtMoney(t.utilidad);
  elUtil.className = 'kpi-value ' + claseUtilidad(t.utilidad);

  const filas = data.porMaquina || [];
  const tbody = document.getElementById('tablaRentabilidad');
  tbody.innerHTML = filas.map((m) => {
    const gastosDet = [];
    if (Number(m.gastos_combustible) > 0) gastosDet.push(`⛽ ${fmtMoney(m.gastos_combustible)}`);
    if (Number(m.gastos_mantenimiento) > 0) gastosDet.push(`🔧 ${fmtMoney(m.gastos_mantenimiento)}`);
    return `
    <tr>
      <td>
        <strong>${esc(m.nombre)}</strong>
        <br><small class="text-muted">${esc(m.codigo || '')}</small>
      </td>
      <td class="text-end">${Number(m.horas).toFixed(2)}</td>
      <td class="text-end text-success">${fmtMoney(m.ingresos)}</td>
      <td class="text-end text-danger">
        ${fmtMoney(m.gastos_total)}
        ${gastosDet.length ? `<br><small class="text-muted">${gastosDet.join(' · ')}</small>` : ''}
      </td>
      <td class="text-end fw-semibold ${claseUtilidad(m.utilidad)}">${fmtMoney(m.utilidad)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-muted">Sin datos en el período</td></tr>';

  document.getElementById('tablaRentabilidadFoot').innerHTML = filas.length ? `
    <tr>
      <td>Total</td>
      <td class="text-end">${Number(t.horas).toFixed(2)}</td>
      <td class="text-end text-success">${fmtMoney(t.ingresos)}</td>
      <td class="text-end text-danger">${fmtMoney(t.gastos_total)}</td>
      <td class="text-end ${claseUtilidad(t.utilidad)}">${fmtMoney(t.utilidad)}</td>
    </tr>` : '';
}

document.getElementById('btnFiltrarReportes').addEventListener('click', cargarReportes);

function fmtHorometro(ini, fin) {
  const a = ini != null ? Number(ini).toFixed(1) : null;
  const b = fin != null ? Number(fin).toFixed(1) : null;
  if (a && b) return `${a} → ${b}`;
  if (a) return `${a} →`;
  if (b) return `→ ${b}`;
  return '—';
}

async function cargarHistorial() {
  const { data } = await api('/registros');
  const tbody = document.getElementById('tablaHistorial');
  tbody.innerHTML = (data || []).map((r) => `
    <tr>
      <td>${esc(r.maquinaria_nombre)}</td>
      <td>${esc(r.cliente_nombre || '—')}</td>
      <td class="small">${fmtUbicacion(r.ubicacion, r.latitud, r.longitud)}</td>
      <td class="small">${fmtDt(r.hora_inicio)}</td>
      <td class="small">${r.estado === 'EN_CURSO' ? '<span class="badge bg-warning">En curso</span>' : fmtDt(r.hora_fin)}</td>
      <td class="small">${fmtHorometro(r.horometro_inicio, r.horometro_fin)}</td>
      <td>${r.horas != null ? Number(r.horas).toFixed(2) : '—'}</td>
      <td>${r.monto != null ? fmtMoney(r.monto) : '—'}</td>
      <td>${r.estado === 'EN_CURSO' && hasPermiso('registrar') ? `<button class="btn btn-sm btn-warning" data-cerrar="${r.id}" data-info="${esc(r.maquinaria_nombre)} · inicio ${fmtDt(r.hora_inicio)}">Cerrar</button>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="9">Sin registros</td></tr>';

  tbody.querySelectorAll('[data-cerrar]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarTurno(btn.dataset.cerrar, btn.dataset.info));
  });
}

// --- Modal cliente (crear/editar) ---
function abrirModalCliente(c = null) {
  document.getElementById('formCliente').reset();
  document.getElementById('clienteId').value = '';
  document.getElementById('clienteConsultaInfo').textContent = '';
  document.getElementById('modalFormClienteTitulo').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  if (c) {
    document.getElementById('clienteId').value = c.id;
    document.getElementById('clienteNombre').value = c.nombre;
    document.getElementById('clienteDocumento').value = c.documento || '';
    document.getElementById('clienteTelefono').value = c.telefono || '';
    document.getElementById('clienteDireccion').value = c.direccion || '';
  }
  modalFormCliente.show();
}

document.getElementById('btnNuevoCliente').addEventListener('click', () => abrirModalCliente());

async function buscarDocumentoSunat() {
  const numero = (document.getElementById('clienteDocumento').value || '').trim();
  const info = document.getElementById('clienteConsultaInfo');
  const btn = document.getElementById('btnBuscarSunat');
  if (!/^\d{8}$|^\d{11}$/.test(numero)) {
    toast('Ingrese un DNI (8 dígitos) o RUC (11 dígitos)', 'warning');
    return;
  }
  btn.disabled = true;
  info.textContent = 'Consultando...';
  info.className = 'form-text text-muted';
  try {
    const res = await api(`/external/consulta/${numero}`);
    if (res.tipo === 'RUC') {
      document.getElementById('clienteNombre').value = res.data.razonSocial || '';
      if (res.data.direccion) document.getElementById('clienteDireccion').value = res.data.direccion;
    } else {
      document.getElementById('clienteNombre').value = res.data.nombreCompleto || '';
      if (res.data.direccion) document.getElementById('clienteDireccion').value = res.data.direccion;
    }
    info.textContent = `${res.tipo} encontrado`;
    info.className = 'form-text text-success';
    toast('Datos cargados desde SUNAT/RENIEC', 'success');
  } catch (err) {
    info.textContent = err.message;
    info.className = 'form-text text-danger';
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btnBuscarSunat').addEventListener('click', buscarDocumentoSunat);
document.getElementById('clienteDocumento').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    buscarDocumentoSunat();
  }
});

document.getElementById('formCliente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('clienteNombre').value,
    documento: document.getElementById('clienteDocumento').value,
    telefono: document.getElementById('clienteTelefono').value,
    direccion: document.getElementById('clienteDireccion').value
  };
  try {
    const id = document.getElementById('clienteId').value;
    if (id) {
      await api(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/clientes', { method: 'POST', body: JSON.stringify(payload) });
    }
    modalFormCliente.hide();
    toast('Cliente guardado', 'success');
    cargarClientes();
  } catch (err) {
    toast(err.message, 'danger');
  }
});

async function cargarClientes() {
  const { data } = await api('/clientes');
  clientesCache = data || [];
  const puedeEditar = hasPermiso('clientes_crear');
  document.getElementById('listaClientes').innerHTML = clientesCache.map((c) => `
    <li class="list-group-item d-flex justify-content-between align-items-center gap-2 py-3">
      <div>
        <strong>${esc(c.nombre)}</strong><br>
        <small class="text-muted">${esc(c.documento || '')}${c.telefono ? ' · ' + esc(c.telefono) : ''}</small>
      </div>
      ${puedeEditar ? `<button class="btn btn-sm btn-outline-secondary flex-shrink-0" data-edit-cliente='${JSON.stringify(c).replace(/'/g, "&#39;")}'>Editar</button>` : ''}
    </li>
  `).join('') || '<li class="list-group-item text-muted">Sin clientes</li>';

  document.querySelectorAll('[data-edit-cliente]').forEach((btn) => {
    btn.addEventListener('click', () => {
      abrirModalCliente(JSON.parse(btn.getAttribute('data-edit-cliente')));
    });
  });
}

// --- Modal maquinaria (crear/editar) ---
function abrirModalMaquinaria(m = null) {
  document.getElementById('formMaquinaria').reset();
  document.getElementById('maqId').value = '';
  document.getElementById('modalFormMaquinariaTitulo').textContent = m ? 'Editar máquina' : 'Nueva máquina';
  if (m) {
    document.getElementById('maqId').value = m.id;
    document.getElementById('maqNombre').value = m.nombre;
    document.getElementById('maqCodigo').value = m.codigo || '';
    document.getElementById('maqTipo').value = m.tipo || '';
    document.getElementById('maqTarifa').value = m.tarifa_hora;
  }
  modalFormMaquinaria.show();
}

document.getElementById('btnNuevaMaquinaria').addEventListener('click', () => abrirModalMaquinaria());

document.getElementById('formMaquinaria').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('maqNombre').value,
    codigo: document.getElementById('maqCodigo').value,
    tipo: document.getElementById('maqTipo').value,
    tarifa_hora: document.getElementById('maqTarifa').value
  };
  try {
    const id = document.getElementById('maqId').value;
    if (id) {
      await api(`/maquinaria/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/maquinaria', { method: 'POST', body: JSON.stringify(payload) });
    }
    modalFormMaquinaria.hide();
    toast('Maquinaria guardada', 'success');
    cargarMaquinaria();
  } catch (err) {
    toast(err.message, 'danger');
  }
});

async function cargarMaquinaria() {
  const { data } = await api('/maquinaria');
  const puedeEditar = hasPermiso('maquinaria_crear');
  document.getElementById('listaMaquinaria').innerHTML = (data || []).map((m) => `
    <li class="list-group-item d-flex justify-content-between align-items-center gap-2 py-3">
      <div>
        <strong>${esc(m.nombre)}</strong> <small class="text-muted">(${esc(m.codigo || 's/c')})</small><br>
        <small>${esc(m.tipo || '')} — ${fmtMoney(m.tarifa_hora)}/h</small>
      </div>
      ${puedeEditar ? `<div class="d-flex gap-1 flex-shrink-0">
        <button class="btn btn-sm btn-outline-secondary" data-edit-maq='${JSON.stringify(m).replace(/'/g, "&#39;")}'>Editar</button>
        <button class="btn btn-sm btn-outline-danger" data-del-maq="${m.id}" data-maq-nombre="${esc(m.nombre)}">Baja</button>
      </div>` : ''}
    </li>
  `).join('') || '<li class="list-group-item text-muted">Sin máquinas</li>';

  document.querySelectorAll('[data-edit-maq]').forEach((btn) => {
    btn.addEventListener('click', () => {
      abrirModalMaquinaria(JSON.parse(btn.getAttribute('data-edit-maq')));
    });
  });
  document.querySelectorAll('[data-del-maq]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`¿Dar de baja la máquina "${btn.dataset.maqNombre}"?\nDejará de aparecer en listados, pero se conserva el historial.`)) return;
      try {
        await api(`/maquinaria/${btn.dataset.delMaq}`, { method: 'DELETE' });
        toast('Maquinaria dada de baja', 'success');
        maquinariaCache = [];
        cargarMaquinaria();
      } catch (err) {
        toast(err.message, 'danger');
      }
    });
  });
}

// --- Gastos de maquinaria ---
const GASTO_TIPOS = { COMBUSTIBLE: 'Combustible', MANTENIMIENTO: 'Mantenimiento' };

function toggleGalonesGasto() {
  const esCombustible = document.getElementById('gastoTipo').value === 'COMBUSTIBLE';
  document.getElementById('bloqueGalones').classList.toggle('d-none', !esCombustible);
}

async function abrirModalGasto(g = null) {
  await asegurarMaquinariaCache();
  document.getElementById('formGasto').reset();
  document.getElementById('gastoId').value = '';
  document.getElementById('gastoMaquinaria').innerHTML = opcionesMaquinaria();
  document.getElementById('modalFormGastoTitulo').textContent = g ? 'Editar gasto' : 'Nuevo gasto';

  if (g) {
    document.getElementById('gastoId').value = g.id;
    document.getElementById('gastoTipo').value = g.tipo;
    document.getElementById('gastoMaquinaria').value = g.id_maquinaria;
    document.getElementById('gastoFecha').value = (g.fecha || '').slice(0, 10);
    document.getElementById('gastoMonto').value = g.monto;
    document.getElementById('gastoHorometro').value = g.horometro ?? '';
    document.getElementById('gastoGalones').value = g.galones ?? '';
    document.getElementById('gastoProveedor').value = g.proveedor || '';
    document.getElementById('gastoDescripcion').value = g.descripcion || '';
  } else {
    document.getElementById('gastoFecha').value = todayStr();
    document.getElementById('gastoTipo').value = 'COMBUSTIBLE';
  }
  toggleGalonesGasto();
  modalFormGasto.show();
}

document.getElementById('gastoTipo').addEventListener('change', toggleGalonesGasto);
document.getElementById('btnNuevoGasto').addEventListener('click', () => abrirModalGasto());
document.getElementById('btnFiltrarGastos').addEventListener('click', cargarGastos);

document.getElementById('formGasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    tipo: document.getElementById('gastoTipo').value,
    id_maquinaria: document.getElementById('gastoMaquinaria').value,
    fecha: document.getElementById('gastoFecha').value,
    monto: document.getElementById('gastoMonto').value,
    horometro: document.getElementById('gastoHorometro').value || null,
    galones: document.getElementById('gastoGalones').value || null,
    proveedor: document.getElementById('gastoProveedor').value,
    descripcion: document.getElementById('gastoDescripcion').value
  };
  try {
    const id = document.getElementById('gastoId').value;
    if (id) {
      await api(`/gastos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/gastos', { method: 'POST', body: JSON.stringify(payload) });
    }
    modalFormGasto.hide();
    toast('Gasto guardado', 'success');
    cargarGastos();
  } catch (err) {
    toast(err.message, 'danger');
  }
});

async function cargarGastos() {
  const desde = document.getElementById('gastoDesde').value;
  const hasta = document.getElementById('gastoHasta').value;
  const tipo = document.getElementById('gastoFiltroTipo').value;
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if (tipo) params.set('tipo', tipo);

  const { data } = await api('/gastos?' + params.toString());
  const puedeEditar = hasPermiso('gastos_crear');
  const total = (data || []).reduce((s, g) => s + Number(g.monto || 0), 0);
  document.getElementById('gastoTotal').textContent = fmtMoney(total);

  document.getElementById('listaGastos').innerHTML = (data || []).map((g) => {
    const badge = g.tipo === 'COMBUSTIBLE'
      ? '<span class="badge bg-info text-dark">Combustible</span>'
      : '<span class="badge bg-secondary">Mantenimiento</span>';
    const extra = [
      g.horometro != null ? `Horóm. ${Number(g.horometro).toFixed(1)}` : '',
      g.galones != null ? `${Number(g.galones).toFixed(2)} gal` : '',
      g.proveedor ? esc(g.proveedor) : ''
    ].filter(Boolean).join(' · ');
    return `
    <li class="list-group-item d-flex justify-content-between align-items-start gap-2 py-3">
      <div>
        <div>${badge} <strong>${fmtMoney(g.monto)}</strong></div>
        <div class="small"><strong>${esc(g.maquinaria_nombre)}</strong> · ${esc(g.fecha)}</div>
        <div class="small text-muted">${extra}${g.descripcion ? (extra ? ' — ' : '') + esc(g.descripcion) : ''}</div>
      </div>
      ${puedeEditar ? `<div class="d-flex gap-1 flex-shrink-0">
        <button class="btn btn-sm btn-outline-secondary" data-edit-gasto='${JSON.stringify(g).replace(/'/g, "&#39;")}'>Editar</button>
        <button class="btn btn-sm btn-outline-danger" data-del-gasto="${g.id}">Eliminar</button>
      </div>` : ''}
    </li>`;
  }).join('') || '<li class="list-group-item text-muted">Sin gastos en el período</li>';

  document.querySelectorAll('[data-edit-gasto]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalGasto(JSON.parse(btn.getAttribute('data-edit-gasto'))));
  });
  document.querySelectorAll('[data-del-gasto]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este gasto?')) return;
      try {
        await api(`/gastos/${btn.dataset.delGasto}`, { method: 'DELETE' });
        toast('Gasto eliminado', 'success');
        cargarGastos();
      } catch (err) {
        toast(err.message, 'danger');
      }
    });
  });
}

// --- Usuarios (solo admin) ---
function renderChecksPermisos(seleccionados = []) {
  const cont = document.getElementById('checksPermisosUsuario');
  const sel = new Set(seleccionados);
  cont.innerHTML = Object.entries(catalogoPermisos).map(([key, label]) => `
    <div class="col-12">
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="perm_${key}" value="${key}" ${sel.has(key) ? 'checked' : ''}>
        <label class="form-check-label" for="perm_${key}">${esc(label)}</label>
      </div>
    </div>
  `).join('');
}

function toggleBloquePermisosUsuario() {
  const esAdmin = document.getElementById('usuarioRol').value === 'admin';
  document.getElementById('bloquePermisosUsuario').classList.toggle('d-none', esAdmin);
}

function leerPermisosFormulario() {
  return Array.from(document.querySelectorAll('#checksPermisosUsuario input:checked')).map((el) => el.value);
}

async function cargarCatalogoPermisos() {
  if (Object.keys(catalogoPermisos).length) return;
  const { data } = await api('/permisos/catalogo');
  catalogoPermisos = data || {};
}

async function abrirModalUsuario(u = null) {
  await cargarCatalogoPermisos();
  document.getElementById('formUsuario').reset();
  document.getElementById('usuarioId').value = '';
    document.getElementById('usuarioLogin').disabled = false;
    document.getElementById('usuarioEmail').disabled = false;
    document.getElementById('usuarioPassword').required = true;
  document.getElementById('usuarioPasswordHint').textContent = '';
  document.getElementById('modalFormUsuarioTitulo').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('usuarioActivo').checked = true;

  if (u) {
    document.getElementById('usuarioId').value = u.id;
    document.getElementById('usuarioLogin').value = u.usuario;
    document.getElementById('usuarioLogin').disabled = true;
    document.getElementById('usuarioNombre').value = u.nombre;
    document.getElementById('usuarioEmail').value = u.email || '';
    document.getElementById('usuarioRol').value = u.rol || 'operador';
    document.getElementById('usuarioActivo').checked = !!u.activo;
    document.getElementById('usuarioPassword').required = false;
    document.getElementById('usuarioPasswordHint').textContent = 'Dejar vacío para no cambiar la contraseña';
    renderChecksPermisos(u.permisos || []);
  } else {
    renderChecksPermisos(['inicio', 'registrar', 'historial', 'clientes', 'maquinaria', 'gastos', 'reportes']);
  }
  toggleBloquePermisosUsuario();
  modalFormUsuario.show();
}

document.getElementById('usuarioRol').addEventListener('change', toggleBloquePermisosUsuario);
document.getElementById('btnNuevoUsuario').addEventListener('click', () => abrirModalUsuario());

document.getElementById('formUsuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('usuarioId').value;
  const payload = {
    nombre: document.getElementById('usuarioNombre').value,
    email: document.getElementById('usuarioEmail').value,
    rol: document.getElementById('usuarioRol').value,
    permisos: leerPermisosFormulario(),
    activo: document.getElementById('usuarioActivo').checked
  };
  const password = document.getElementById('usuarioPassword').value;
  if (password) payload.password = password;

  try {
    if (id) {
      await api(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      payload.usuario = document.getElementById('usuarioLogin').value;
      if (!password) {
        toast('La contraseña es obligatoria para usuarios nuevos', 'warning');
        return;
      }
      await api('/usuarios', { method: 'POST', body: JSON.stringify(payload) });
    }
    modalFormUsuario.hide();
    toast('Usuario guardado', 'success');
    cargarUsuarios();
  } catch (err) {
    toast(err.message, 'danger');
  }
});

async function cargarUsuarios() {
  const { data } = await api('/usuarios');
  document.getElementById('listaUsuarios').innerHTML = (data || []).map((u) => {
    const badge = u.rol === 'admin'
      ? '<span class="badge bg-dark">Admin</span>'
      : '<span class="badge bg-secondary">Operador</span>';
    const estado = u.activo
      ? '<span class="badge bg-success">Activo</span>'
      : '<span class="badge bg-danger">Inactivo</span>';
    return `
    <li class="list-group-item d-flex justify-content-between align-items-center gap-2 py-3">
      <div>
        <strong>${esc(u.nombre)}</strong> ${badge} ${estado}<br>
        <small class="text-muted">@${esc(u.usuario)}${u.email ? ` · ${esc(u.email)}` : ''}</small>
      </div>
      <div class="d-flex gap-1 flex-shrink-0">
        <button class="btn btn-sm btn-outline-secondary" data-edit-usuario='${JSON.stringify(u).replace(/'/g, "&#39;")}'>Editar</button>
        ${u.activo && u.id !== currentUser.id ? `<button class="btn btn-sm btn-outline-danger" data-del-usuario="${u.id}">Baja</button>` : ''}
      </div>
    </li>`;
  }).join('') || '<li class="list-group-item text-muted">Sin usuarios</li>';

  document.querySelectorAll('[data-edit-usuario]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalUsuario(JSON.parse(btn.getAttribute('data-edit-usuario'))));
  });
  document.querySelectorAll('[data-del-usuario]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Desactivar este usuario?')) return;
      try {
        await api(`/usuarios/${btn.dataset.delUsuario}`, { method: 'DELETE' });
        toast('Usuario desactivado', 'success');
        cargarUsuarios();
      } catch (err) {
        toast(err.message, 'danger');
      }
    });
  });
}

// Init
document.getElementById('filtroDesde').value = firstDayMonth();
document.getElementById('filtroHasta').value = todayStr();
document.getElementById('gastoDesde').value = firstDayMonth();
document.getElementById('gastoHasta').value = todayStr();
document.getElementById('repDesde').value = firstDayMonth();
document.getElementById('repHasta').value = todayStr();
ensureAuth().then((user) => {
  if (user && hasPermiso('inicio')) cargarResumen();
}).catch(() => {});
