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
const modalTiposGasto = new bootstrap.Modal('#modalTiposGasto');
const modalCerrarTurno = new bootstrap.Modal('#modalCerrarTurno');

let maquinariaCache = [];
let tiposGastoCache = [];

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
  if (!document.getElementById('compFecha').value) {
    document.getElementById('compFecha').value = todayStr();
  }
  syncCompTarifaDesdeMaquina();
  actualizarCompCalcInfo();
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

function syncCompTarifaDesdeMaquina() {
  const id = document.getElementById('compMaquinaria').value;
  const m = maquinariaCache.find((x) => String(x.id) === String(id));
  const tarifaEl = document.getElementById('compTarifa');
  if (!tarifaEl.dataset.manual || tarifaEl.dataset.manual === '0') {
    tarifaEl.value = m ? Number(m.tarifa_hora || 0) : '';
  }
}

function previewCompCalculo() {
  const horoIni = document.getElementById('compHorometroIni').value;
  const horoFin = document.getElementById('compHorometroFin').value;
  const horaIni = document.getElementById('compInicio').value;
  const horaFin = document.getElementById('compFin').value;
  const tarifa = Number(document.getElementById('compTarifa').value) || 0;
  const montoManual = document.getElementById('compMonto').value;

  const hasHoro = horoIni !== '' && horoFin !== '';
  const hasReloj = !!(horaIni && horaFin);
  if (!hasHoro && !hasReloj) return null;

  let horas = null;
  let base = null;
  let aviso = null;
  let horasReloj = null;

  if (hasReloj) {
    const ini = new Date(horaIni);
    const fin = new Date(horaFin);
    if (!Number.isNaN(ini.getTime()) && !Number.isNaN(fin.getTime()) && fin > ini) {
      horasReloj = (fin - ini) / (1000 * 60 * 60);
    }
  }
  if (hasHoro) {
    const a = Number(horoIni);
    const b = Number(horoFin);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
    horas = b - a;
    base = 'horometro';
    if (horasReloj != null && Math.abs(horas - horasReloj) > 0.25) {
      aviso = `Horómetro (${horas.toFixed(2)} h) ≠ reloj (${horasReloj.toFixed(2)} h): manda horómetro`;
    }
  } else if (horasReloj != null) {
    horas = horasReloj;
    base = 'reloj';
  } else {
    return null;
  }

  const monto = montoManual !== ''
    ? Number(montoManual)
    : Math.round(horas * tarifa * 100) / 100;
  if (!Number.isFinite(monto)) return null;
  return { horas, monto, base, aviso };
}

function actualizarCompCalcInfo() {
  const info = document.getElementById('compCalcInfo');
  const p = previewCompCalculo();
  if (!p) {
    info.className = 'small text-muted mb-2';
    info.textContent = 'Cobra por horómetro si hay inicio y fin; si no, por reloj. Puedes editar tarifa o monto.';
    return;
  }
  const baseTxt = p.base === 'horometro' ? 'horómetro' : 'reloj';
  info.className = p.aviso ? 'small text-warning mb-2' : 'small text-success mb-2';
  info.textContent = p.aviso
    || `Vista previa: ${p.horas.toFixed(2)} h (${baseTxt}) → ${fmtMoney(p.monto)}`;
}

document.getElementById('compMaquinaria').addEventListener('change', () => {
  document.getElementById('compTarifa').dataset.manual = '0';
  syncCompTarifaDesdeMaquina();
  actualizarCompCalcInfo();
});
document.getElementById('compTarifa').addEventListener('input', () => {
  document.getElementById('compTarifa').dataset.manual = '1';
  actualizarCompCalcInfo();
});
['compHorometroIni', 'compHorometroFin', 'compInicio', 'compFin', 'compMonto', 'compFecha'].forEach((id) => {
  document.getElementById(id).addEventListener('input', actualizarCompCalcInfo);
});

document.getElementById('formCompleto').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const horoIni = document.getElementById('compHorometroIni').value;
    const horoFin = document.getElementById('compHorometroFin').value;
    const horaIni = document.getElementById('compInicio').value;
    const horaFin = document.getElementById('compFin').value;
    const fecha = document.getElementById('compFecha').value;
    const hasHoro = horoIni !== '' && horoFin !== '';
    const hasReloj = !!(horaIni && horaFin);

    if (!hasHoro && !hasReloj) {
      throw new Error('Indica horómetro inicio y fin, o hora inicio y fin');
    }
    if (!hasReloj && !fecha && !horaIni && !horaFin) {
      throw new Error('Indica al menos una fecha del trabajo');
    }

    const r = await api('/registros', {
      method: 'POST',
      body: JSON.stringify({
        id_maquinaria: document.getElementById('compMaquinaria').value,
        id_cliente: document.getElementById('compCliente').value || null,
        fecha: fecha || null,
        hora_inicio: horaIni || null,
        hora_fin: horaFin || null,
        horometro_inicio: horoIni || null,
        horometro_fin: horoFin || null,
        tarifa_hora: document.getElementById('compTarifa').value || null,
        monto: document.getElementById('compMonto').value || null,
        ubicacion: document.getElementById('compUbicacion').value,
        latitud: gpsCompleto.lat,
        longitud: gpsCompleto.lng
      })
    });
    const aviso = r.data?.aviso;
    toast(
      aviso || `Guardado: ${r.data.horas} h → ${fmtMoney(r.data.monto)}`,
      aviso ? 'warning' : 'success'
    );
    gpsCompleto = { lat: null, lng: null };
    document.getElementById('gpsCompletoInfo').textContent = '';
    document.getElementById('formCompleto').reset();
    document.getElementById('compFecha').value = todayStr();
    document.getElementById('compTarifa').dataset.manual = '0';
    document.getElementById('compCliente').value = '';
    await cargarSelects();
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
    const aviso = r.data?.aviso;
    toast(
      aviso || `Cerrado: ${r.data.horas} h — ${fmtMoney(r.data.monto)}`,
      aviso ? 'warning' : 'success'
    );
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

let ultimoReporteRentabilidad = null;

async function cargarReportes() {
  const desde = document.getElementById('repDesde').value || firstDayMonth();
  const hasta = document.getElementById('repHasta').value || todayStr();
  document.getElementById('repDesde').value = desde;
  document.getElementById('repHasta').value = hasta;

  const { data } = await api(`/reportes/rentabilidad?desde=${desde}&hasta=${hasta}`);
  ultimoReporteRentabilidad = data;
  const t = data.totales || {};

  document.getElementById('repIngresos').textContent = fmtMoney(t.ingresos);
  document.getElementById('repGastos').textContent = fmtMoney(t.gastos_total);
  const elUtil = document.getElementById('repUtilidad');
  elUtil.textContent = fmtMoney(t.utilidad);
  elUtil.className = 'kpi-value ' + claseUtilidad(t.utilidad);

  const filas = data.porMaquina || [];
  const tbody = document.getElementById('tablaRentabilidad');
  tbody.innerHTML = filas.map((m) => {
    const porTipo = Array.isArray(m.gastos_por_tipo) ? m.gastos_por_tipo : [];
    const gastosDet = porTipo
      .filter((x) => Number(x.monto) > 0)
      .map((x) => `${esc(x.nombre)} ${fmtMoney(x.monto)}`);
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

function fmtMoneyPdf(n) {
  return 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFechaPdf(s) {
  if (!s) return '-';
  return String(s).replace('T', ' ').slice(0, 16);
}

function pdfNuevoDoc() {
  if (!window.jspdf?.jsPDF) throw new Error('No se pudo cargar la librería PDF');
  return new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
}

function pdfCabecera(doc, titulo, desde, hasta) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('MAQSIS', 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(titulo, 14, 23);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Periodo: ${desde} al ${hasta}`, 14, 29);
  doc.text(`Generado: ${fmtFechaPdf(new Date().toISOString())}`, 14, 34);
  doc.setTextColor(0);
  return 40;
}

function pdfPiePaginas(doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${total}`, 105, 287, { align: 'center' });
    doc.setTextColor(0);
  }
}

function pdfSeccionResumen(doc, data, startY) {
  const t = data.totales || {};
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Resumen general', 14, y);
  y += 6;

  doc.autoTable({
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45 },
      1: { halign: 'right' }
    },
    body: [
      ['Ingresos', fmtMoneyPdf(t.ingresos)],
      ['Gastos', fmtMoneyPdf(t.gastos_total)],
      ['Utilidad', fmtMoneyPdf(t.utilidad)]
    ],
    didParseCell(hook) {
      if (hook.section === 'body' && hook.column.index === 1) {
        if (hook.row.index === 0) hook.cell.styles.textColor = [25, 135, 84];
        if (hook.row.index === 1) hook.cell.styles.textColor = [220, 53, 69];
        if (hook.row.index === 2) {
          const u = Number(t.utilidad || 0);
          hook.cell.styles.textColor = u >= 0 ? [25, 135, 84] : [220, 53, 69];
          hook.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  y = (doc.lastAutoTable?.finalY || y) + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Rentabilidad por máquina', 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Utilidad = Ingresos - Gastos (combustible + mantenimiento)', 14, y);
  doc.setTextColor(0);
  y += 3;

  const filas = data.porMaquina || [];
  const body = filas.length
    ? filas.map((m) => {
      const porTipo = Array.isArray(m.gastos_por_tipo) ? m.gastos_por_tipo : [];
      const det = porTipo
        .filter((x) => Number(x.monto) > 0)
        .map((x) => `${x.nombre}: ${fmtMoneyPdf(x.monto)}`);
      const gastosTxt = det.length
        ? `${fmtMoneyPdf(m.gastos_total)}\n${det.join(' | ')}`
        : fmtMoneyPdf(m.gastos_total);
      return [
        `${m.nombre || ''}\n${m.codigo || ''}`,
        Number(m.horas || 0).toFixed(2),
        fmtMoneyPdf(m.ingresos),
        gastosTxt,
        fmtMoneyPdf(m.utilidad)
      ];
    })
    : [['Sin datos en el periodo', '', '', '', '']];

  if (filas.length) {
    body.push([
      'Total',
      Number(t.horas || 0).toFixed(2),
      fmtMoneyPdf(t.ingresos),
      fmtMoneyPdf(t.gastos_total),
      fmtMoneyPdf(t.utilidad)
    ]);
  }

  doc.autoTable({
    startY: y,
    head: [['Máquina', 'Horas', 'Ingresos', 'Gastos', 'Utilidad']],
    body,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2, valign: 'top' },
    headStyles: { fillColor: [33, 37, 41], textColor: 255 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right', textColor: [25, 135, 84] },
      3: {halign: 'right', textColor: [220, 53, 69] },
      4: {halign: 'right', fontStyle: 'bold' }
    },
    didParseCell(hook) {
      if (hook.section !== 'body') return;
      if (hook.row.index === body.length - 1 && filas.length) {
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fillColor = [248, 249, 250];
      }
      if (hook.column.index === 4 && filas.length) {
        const raw = filas[hook.row.index]?.utilidad ?? t.utilidad;
        const u = Number(raw || 0);
        hook.cell.styles.textColor = u >= 0 ? [25, 135, 84] : [220, 53, 69];
      }
    }
  });

  return doc.lastAutoTable?.finalY || y;
}

function pdfSeccionIngresos(doc, detalle, { newPage = false } = {}) {
  if (newPage) doc.addPage();
  const y = pdfCabecera(doc, 'Detalle de ingresos', detalle.desde, detalle.hasta);

  const filas = detalle.ingresos || [];
  const body = filas.length
    ? filas.map((r) => [
      fmtFechaPdf(r.hora_inicio),
      `${r.maquinaria_nombre || ''}${r.maquinaria_codigo ? ` (${r.maquinaria_codigo})` : ''}`,
      r.cliente_nombre || '-',
      r.horas != null ? Number(r.horas).toFixed(2) : '-',
      fmtMoneyPdf(r.monto)
    ])
    : [['Sin ingresos en el periodo', '', '', '', '']];

  if (filas.length) {
    body.push(['Total', '', '', '', fmtMoneyPdf(detalle.totales?.ingresos)]);
  }

  doc.autoTable({
    startY: y,
    head: [['Fecha inicio', 'Máquina', 'Cliente', 'Horas', 'Monto']],
    body,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [25, 135, 84], textColor: 255 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right', textColor: [25, 135, 84] }
    },
    didParseCell(hook) {
      if (hook.section === 'body' && filas.length && hook.row.index === body.length - 1) {
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fillColor = [232, 245, 233];
      }
    }
  });
}

function pdfSeccionEgresos(doc, detalle, { newPage = false } = {}) {
  if (newPage) doc.addPage();
  const y = pdfCabecera(doc, 'Detalle de egresos', detalle.desde, detalle.hasta);

  const filas = detalle.egresos || [];
  const body = filas.length
    ? filas.map((g) => [
      String(g.fecha || '').slice(0, 10),
      g.tipo_nombre || g.tipo || '-',
      `${g.maquinaria_nombre || ''}${g.maquinaria_codigo ? ` (${g.maquinaria_codigo})` : ''}`,
      g.proveedor || g.descripcion || '-',
      fmtMoneyPdf(g.monto)
    ])
    : [['Sin egresos en el periodo', '', '', '', '']];

  if (filas.length) {
    body.push(['Total', '', '', '', fmtMoneyPdf(detalle.totales?.egresos)]);
  }

  doc.autoTable({
    startY: y,
    head: [['Fecha', 'Tipo', 'Máquina', 'Detalle', 'Monto']],
    body,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [220, 53, 69], textColor: 255 },
    columnStyles: {
      4: {halign: 'right', textColor: [220, 53, 69] }
    },
    didParseCell(hook) {
      if (hook.section === 'body' && filas.length && hook.row.index === body.length - 1) {
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fillColor = [253, 236, 234];
      }
    }
  });
}

async function exportarPdfReportes(modo) {
  try {
    const desde = document.getElementById('repDesde').value || firstDayMonth();
    const hasta = document.getElementById('repHasta').value || todayStr();

    let rent = ultimoReporteRentabilidad;
    if (!rent || rent.desde !== desde || rent.hasta !== hasta) {
      const { data } = await api(`/reportes/rentabilidad?desde=${desde}&hasta=${hasta}`);
      rent = data;
      ultimoReporteRentabilidad = data;
    }

    let detalle = null;
    if (modo === 'completo' || modo === 'ingresos' || modo === 'egresos') {
      const { data } = await api(`/reportes/detalle?desde=${desde}&hasta=${hasta}`);
      detalle = data;
    }

    const doc = pdfNuevoDoc();
    const nombreBase = `MAQSIS_${modo}_${desde}_${hasta}`;

    if (modo === 'resumen') {
      const y = pdfCabecera(doc, 'Resumen de rentabilidad', desde, hasta);
      pdfSeccionResumen(doc, rent, y);
    } else if (modo === 'ingresos') {
      pdfSeccionIngresos(doc, detalle);
    } else if (modo === 'egresos') {
      pdfSeccionEgresos(doc, detalle);
    } else {
      const y = pdfCabecera(doc, 'Reporte completo', desde, hasta);
      pdfSeccionResumen(doc, rent, y);
      pdfSeccionIngresos(doc, detalle, { newPage: true });
      pdfSeccionEgresos(doc, detalle, { newPage: true });
    }

    pdfPiePaginas(doc);
    doc.save(`${nombreBase}.pdf`);
    toast('PDF generado', 'success');
  } catch (err) {
    toast(err.message || 'No se pudo exportar el PDF', 'danger');
  }
}

document.querySelectorAll('[data-pdf]').forEach((btn) => {
  btn.addEventListener('click', () => exportarPdfReportes(btn.dataset.pdf));
});

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

// --- Tipos de gasto ---
async function cargarTiposGasto(forzar = false) {
  if (!forzar && tiposGastoCache.length) return tiposGastoCache;
  const { data } = await api('/tipos-gasto');
  tiposGastoCache = data || [];
  return tiposGastoCache;
}

function opcionesTiposGasto(selected = '', { incluirVacio = false, vacioLabel = 'Todos' } = {}) {
  const opts = [];
  if (incluirVacio) opts.push(`<option value="">${esc(vacioLabel)}</option>`);
  for (const t of tiposGastoCache) {
    const sel = String(t.codigo) === String(selected) ? ' selected' : '';
    opts.push(`<option value="${esc(t.codigo)}"${sel}>${esc(t.nombre)}</option>`);
  }
  return opts.join('');
}

async function refrescarSelectsTipoGasto(selected = '') {
  await cargarTiposGasto(true);
  const filtroSel = document.getElementById('gastoFiltroTipo').value;
  document.getElementById('gastoFiltroTipo').innerHTML = opcionesTiposGasto(filtroSel, { incluirVacio: true });
  document.getElementById('gastoTipo').innerHTML = opcionesTiposGasto(selected || (tiposGastoCache[0]?.codigo || ''));
}

function resetFormTipoGasto() {
  document.getElementById('tipoGastoId').value = '';
  document.getElementById('tipoGastoNombre').value = '';
  document.getElementById('tipoGastoCodigo').value = '';
  document.getElementById('tipoGastoPideGalones').checked = false;
  document.getElementById('btnGuardarTipoGasto').textContent = 'Agregar tipo';
  document.getElementById('btnCancelarTipoGasto').classList.add('d-none');
}

function editarTipoGastoForm(t) {
  document.getElementById('tipoGastoId').value = t.id;
  document.getElementById('tipoGastoNombre').value = t.nombre || '';
  document.getElementById('tipoGastoCodigo').value = t.codigo || '';
  document.getElementById('tipoGastoPideGalones').checked = !!Number(t.pide_galones);
  document.getElementById('btnGuardarTipoGasto').textContent = 'Guardar cambios';
  document.getElementById('btnCancelarTipoGasto').classList.remove('d-none');
}

async function renderListaTiposGasto() {
  const { data } = await api('/tipos-gasto?todos=1');
  const activos = (data || []).filter((t) => Number(t.activo) === 1);
  const inactivos = (data || []).filter((t) => Number(t.activo) !== 1);
  const items = [...activos, ...inactivos];

  document.getElementById('listaTiposGasto').innerHTML = items.map((t) => {
    const inactivo = Number(t.activo) !== 1;
    return `
    <li class="list-group-item d-flex justify-content-between align-items-start gap-2 ${inactivo ? 'opacity-50' : ''}">
      <div>
        <strong>${esc(t.nombre)}</strong>
        <div class="small text-muted">${esc(t.codigo)}${Number(t.pide_galones) ? ' · pide galones' : ''}${inactivo ? ' · inactivo' : ''}</div>
      </div>
      ${inactivo ? '' : `<div class="d-flex gap-1 flex-shrink-0">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-edit-tipo='${JSON.stringify(t).replace(/'/g, '&#39;')}'>Editar</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-del-tipo="${t.id}">Baja</button>
      </div>`}
    </li>`;
  }).join('') || '<li class="list-group-item text-muted">Sin tipos</li>';

  document.querySelectorAll('[data-edit-tipo]').forEach((btn) => {
    btn.addEventListener('click', () => editarTipoGastoForm(JSON.parse(btn.getAttribute('data-edit-tipo'))));
  });
  document.querySelectorAll('[data-del-tipo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Dar de baja este tipo de gasto?')) return;
      try {
        await api(`/tipos-gasto/${btn.dataset.delTipo}`, { method: 'DELETE' });
        toast('Tipo dado de baja', 'success');
        resetFormTipoGasto();
        await renderListaTiposGasto();
        await refrescarSelectsTipoGasto();
      } catch (err) {
        toast(err.message, 'danger');
      }
    });
  });
}

async function abrirModalTiposGasto() {
  resetFormTipoGasto();
  await renderListaTiposGasto();
  modalTiposGasto.show();
}

document.getElementById('btnTiposGasto').addEventListener('click', () => abrirModalTiposGasto());
document.getElementById('btnCancelarTipoGasto').addEventListener('click', resetFormTipoGasto);

document.getElementById('formTipoGasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('tipoGastoNombre').value,
    codigo: document.getElementById('tipoGastoCodigo').value || null,
    pide_galones: document.getElementById('tipoGastoPideGalones').checked
  };
  try {
    const id = document.getElementById('tipoGastoId').value;
    if (id) {
      await api(`/tipos-gasto/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Tipo actualizado', 'success');
    } else {
      await api('/tipos-gasto', { method: 'POST', body: JSON.stringify(payload) });
      toast('Tipo creado', 'success');
    }
    resetFormTipoGasto();
    await renderListaTiposGasto();
    await refrescarSelectsTipoGasto();
  } catch (err) {
    toast(err.message, 'danger');
  }
});

// --- Gastos de maquinaria ---
function toggleGalonesGasto() {
  const codigo = document.getElementById('gastoTipo').value;
  const tipo = tiposGastoCache.find((t) => t.codigo === codigo);
  const pide = !!(tipo && Number(tipo.pide_galones));
  document.getElementById('bloqueGalones').classList.toggle('d-none', !pide);
}

async function abrirModalGasto(g = null) {
  await Promise.all([asegurarMaquinariaCache(), cargarTiposGasto()]);
  if (!tiposGastoCache.length) {
    toast('Primero cree un tipo de gasto', 'warning');
    return abrirModalTiposGasto();
  }
  document.getElementById('formGasto').reset();
  document.getElementById('gastoId').value = '';
  document.getElementById('gastoMaquinaria').innerHTML = opcionesMaquinaria();
  document.getElementById('gastoTipo').innerHTML = opcionesTiposGasto(g?.tipo || tiposGastoCache[0]?.codigo || '');
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
  await refrescarSelectsTipoGasto();
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
    const nombreTipo = g.tipo_nombre || g.tipo || 'Gasto';
    const badgeClass = g.tipo === 'COMBUSTIBLE' ? 'bg-info text-dark' : 'bg-secondary';
    const badge = `<span class="badge ${badgeClass}">${esc(nombreTipo)}</span>`;
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
