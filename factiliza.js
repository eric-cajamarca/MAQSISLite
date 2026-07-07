/**
 * Consultas de DNI y RUC contra la API de Factiliza (SUNAT / RENIEC).
 * Extraído de MAQSIS (backAppC/controllers/externalController.js) y simplificado:
 * MAQSIS Lite es de una sola empresa, así que el token se lee de FACTILIZA_TOKEN (.env)
 * y no se usan las tablas multiempresa (FactilizaConfig / EmpresaFactiliza).
 */
const FACTILIZA_BASE = 'https://api.factiliza.com/v1';
const TIMEOUT_MS = 8000;

function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

function normalizeDni(raw) {
  const o = (raw && (raw.data !== undefined ? raw.data : raw)) || {};
  const nombres = pick(o, 'nombres', 'Nombres');
  const apellidoPaterno = pick(o, 'apellidoPaterno', 'apellido_paterno', 'ApellidoPaterno', 'paterno');
  const apellidoMaterno = pick(o, 'apellidoMaterno', 'apellido_materno', 'ApellidoMaterno', 'materno');
  const nombreCompleto = pick(o, 'nombre_completo', 'nombreCompleto');
  const partes = [apellidoPaterno, apellidoMaterno, nombres].filter(Boolean);
  return {
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    nombreCompleto: partes.length ? partes.join(' ').replace(/\s+/g, ' ') : (nombreCompleto || ''),
    direccion: pick(o, 'direccion', 'Direccion') || null
  };
}

function normalizeRuc(raw) {
  const o = (raw && (raw.data !== undefined ? raw.data : raw)) || {};
  const razonSocial = pick(o, 'razonSocial', 'RazonSocial', 'nombre_o_razon_social', 'razon_social', 'nombre', 'nombreComercial');
  const ubigeoRaw = pick(o, 'ubigeo', 'Ubigeo', 'ubigeo_sunat');
  const ubigeo = Array.isArray(ubigeoRaw) ? (ubigeoRaw[ubigeoRaw.length - 1] || ubigeoRaw[0]) : ubigeoRaw;
  return {
    razonSocial,
    estado: pick(o, 'estado', 'Estado', 'condicion', 'Condicion') || 'ACTIVO',
    ubigeo: ubigeo || undefined,
    direccion: pick(o, 'direccion', 'Direccion', 'domicilioFiscal', 'direccion_completa') || null,
    departamento: pick(o, 'departamento', 'Departamento'),
    provincia: pick(o, 'provincia', 'Provincia'),
    distrito: pick(o, 'distrito', 'Distrito')
  };
}

async function llamarFactiliza(path) {
  const token = process.env.FACTILIZA_TOKEN;
  if (!token) {
    throw new Error('FACTILIZA_TOKEN no está configurado en el archivo .env');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${FACTILIZA_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    const raw = await response.json().catch(() => ({}));
    const inner = raw && (raw.data ?? raw);
    const hasData = inner && (Array.isArray(inner)
      ? inner.length > 0
      : (typeof inner === 'object' && Object.keys(inner).length > 0));
    if (response.status === 200 && hasData) {
      return raw;
    }
    throw new Error((raw && raw.message) || 'No se encontraron datos');
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al consultar Factiliza');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function consultarDni(dni) {
  const raw = await llamarFactiliza(`/dni/info/${encodeURIComponent(dni)}`);
  return normalizeDni(raw);
}

async function consultarRuc(ruc) {
  const raw = await llamarFactiliza(`/ruc/info/${encodeURIComponent(ruc)}`);
  return normalizeRuc(raw);
}

module.exports = { consultarDni, consultarRuc };
