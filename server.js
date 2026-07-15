require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const { pool } = require('./db');
const { signToken, authMiddleware, adminMiddleware, requirePermiso, permisosEfectivos, PERMISOS_OPERADOR, COOKIE_NAME, TOKEN_HOURS } = require('./auth');
const { consultarDni, consultarRuc } = require('./factiliza');
const { sendPasswordResetEmail, isMailConfigured } = require('./utils/mailer');
const { createResetToken, validateResetToken, markTokenUsed } = require('./utils/passwordReset');

const app = express();
const PORT = process.env.PORT || 3080;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: TOKEN_HOURS * 60 * 60 * 1000
  });
}

function toMysqlDatetime(d) {
  if (!d) return null;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const forgotRateLimit = new Map();
const FORGOT_RATE_WINDOW_MS = 15 * 60 * 1000;
const FORGOT_RATE_MAX = 5;

function checkForgotRateLimit(key) {
  const now = Date.now();
  const entry = forgotRateLimit.get(key);
  if (!entry || now - entry.start > FORGOT_RATE_WINDOW_MS) {
    forgotRateLimit.set(key, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= FORGOT_RATE_MAX) return false;
  entry.count += 1;
  return true;
}

function roundHoras(h) {
  return Math.round(Number(h) * 10000) / 10000;
}

function roundMonto(m) {
  return Math.round(Number(m) * 100) / 100;
}

function parseOptionalNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Prioriza horómetro para horas/cobro. Reloj es contexto;
 * si ambos existen y difieren, manda el horómetro y se genera aviso.
 * montoManual permite cobro no lineal.
 */
function calcHorasYMonto({
  horaInicio,
  horaFin,
  horometroInicio,
  horometroFin,
  tarifaHora,
  montoManual
} = {}) {
  const tarifa = Number(tarifaHora) || 0;
  const horoIni = parseOptionalNumber(horometroInicio);
  const horoFin = parseOptionalNumber(horometroFin);
  if (horoIni != null && Number.isNaN(horoIni)) throw new Error('Horómetro de inicio inválido');
  if (horoFin != null && Number.isNaN(horoFin)) throw new Error('Horómetro de fin inválido');
  if (horoIni != null && horoIni < 0) throw new Error('Horómetro de inicio inválido');
  if (horoFin != null && horoFin < 0) throw new Error('Horómetro de fin inválido');

  const hasHoro = horoIni != null && horoFin != null;
  if (hasHoro && horoFin < horoIni) {
    throw new Error('El horómetro de fin no puede ser menor al de inicio');
  }
  if (hasHoro && horoFin === horoIni) {
    throw new Error('El horómetro de fin debe ser mayor al de inicio');
  }

  let horasReloj = null;
  const ini = horaInicio ? new Date(horaInicio) : null;
  const fin = horaFin ? new Date(horaFin) : null;
  const hasReloj = !!(ini && fin && !Number.isNaN(ini.getTime()) && !Number.isNaN(fin.getTime()));
  if (hasReloj) {
    if (fin <= ini) throw new Error('La hora de fin debe ser posterior a la de inicio');
    horasReloj = (fin - ini) / (1000 * 60 * 60);
  }

  let horas;
  let baseCalculo;
  let aviso = null;

  if (hasHoro) {
    horas = horoFin - horoIni;
    baseCalculo = 'horometro';
    if (horasReloj != null) {
      const diff = Math.abs(horas - horasReloj);
      if (diff > 0.25) {
        aviso = `Horómetro (${roundHoras(horas)} h) difiere del reloj (${roundHoras(horasReloj)} h); se usa el horómetro para el cobro`;
      }
    }
  } else if (horasReloj != null) {
    horas = horasReloj;
    baseCalculo = 'reloj';
  } else {
    throw new Error('Indica horómetro inicio y fin, o hora inicio y fin');
  }

  horas = roundHoras(horas);
  let monto;
  const montoParsed = parseOptionalNumber(montoManual);
  if (montoParsed != null) {
    if (Number.isNaN(montoParsed) || montoParsed < 0) throw new Error('Monto inválido');
    monto = roundMonto(montoParsed);
  } else {
    monto = roundMonto(horas * tarifa);
  }

  return {
    horas,
    monto,
    tarifa,
    baseCalculo,
    aviso,
    horasReloj: horasReloj != null ? roundHoras(horasReloj) : null
  };
}

function addHoursToMysqlDatetime(mysqlDt, hours) {
  const d = new Date(String(mysqlDt).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return mysqlDt;
  d.setTime(d.getTime() + hours * 3600 * 1000);
  return toMysqlDatetime(d);
}

// --- Health (público) ---
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'maqsis-simple' });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

// --- Auth (público login; resto protegido) ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const usuario = String(req.body?.usuario || '').trim().toLowerCase();
    const password = req.body?.password || '';
    if (!usuario || !password) {
      return res.status(400).json({ message: 'Usuario y contraseña son obligatorios' });
    }
    const [[row]] = await pool.query(
      'SELECT id, usuario, nombre, rol, permisos, password_hash FROM usuarios WHERE LOWER(usuario) = ? AND activo = 1',
      [usuario]
    );
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }
    const token = signToken(row);
    setAuthCookie(res, token);
    res.json({
      message: 'Sesión iniciada',
      data: {
        id: row.id,
        usuario: row.usuario,
        nombre: row.nombre,
        rol: row.rol || 'operador',
        permisos: permisosEfectivos(row)
      }
    });
  } catch (e) {
    console.error('login:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: isProd });
  res.json({ message: 'Sesión cerrada' });
});

const FORGOT_PASSWORD_MSG =
  'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.';

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    if (!isMailConfigured()) {
      return res.status(503).json({
        message: 'La recuperación por correo no está configurada. Contacte al administrador.'
      });
    }

    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: 'Ingrese un correo electrónico válido' });
    }

    const rateKey = `${req.ip || 'unknown'}:${email}`;
    if (!checkForgotRateLimit(rateKey)) {
      return res.status(429).json({ message: 'Demasiados intentos. Espere unos minutos e intente de nuevo.' });
    }

    const [[user]] = await pool.query(
      'SELECT id, nombre, email FROM usuarios WHERE LOWER(email) = ? AND activo = 1',
      [email]
    );

    if (user?.email) {
      const token = await createResetToken(user.id);
      const appUrl = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
      const resetUrl = `${appUrl}/reset-password.html?token=${token}`;
      try {
        await sendPasswordResetEmail(user.email, resetUrl, user.nombre);
      } catch (mailErr) {
        console.error('forgot-password mail:', mailErr.message);
        return res.status(500).json({ message: 'No se pudo enviar el correo. Intente más tarde.' });
      }
    }

    res.json({ message: FORGOT_PASSWORD_MSG });
  } catch (e) {
    console.error('forgot-password:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = req.body?.password || '';

    if (!token) {
      return res.status(400).json({ message: 'Enlace inválido o expirado' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 4 caracteres' });
    }

    const tokenData = await validateResetToken(token);
    if (!tokenData) {
      return res.status(400).json({ message: 'Enlace inválido o expirado' });
    }

    const hash = bcrypt.hashSync(String(password), 10);
    await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, tokenData.idUsuario]);
    await markTokenUsed(tokenData.tokenId);

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (e) {
    console.error('reset-password:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [[row]] = await pool.query(
      'SELECT id, usuario, nombre, rol, permisos FROM usuarios WHERE id = ? AND activo = 1',
      [req.user.id]
    );
    if (!row) {
      return res.status(401).json({ message: 'Usuario no válido' });
    }
    res.json({
      data: {
        id: row.id,
        usuario: row.usuario,
        nombre: row.nombre,
        rol: row.rol || 'operador',
        permisos: permisosEfectivos(row)
      }
    });
  } catch (e) {
    console.error('auth/me:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.get('/api/permisos/catalogo', authMiddleware, adminMiddleware, (req, res) => {
  res.json({ data: PERMISOS_OPERADOR });
});

// Proteger el resto de /api
app.use('/api', (req, res, next) => {
  if (
    req.path === '/health'
    || req.path === '/auth/login'
    || req.path === '/auth/forgot-password'
    || req.path === '/auth/reset-password'
  ) return next();
  authMiddleware(req, res, next);
});

// --- Consulta SUNAT / RENIEC (Factiliza) ---
/** Consulta DNI (RENIEC) o RUC (SUNAT) según el número: 8 dígitos = DNI, 11 = RUC. */
app.get('/api/external/consulta/:numero', async (req, res) => {
  try {
    const numero = String(req.params.numero || '').trim();
    if (!/^\d+$/.test(numero)) {
      return res.status(400).json({ message: 'Ingrese solo números (DNI de 8 dígitos o RUC de 11)' });
    }
    if (numero.length === 8) {
      const data = await consultarDni(numero);
      return res.json({ tipo: 'DNI', data });
    }
    if (numero.length === 11) {
      const data = await consultarRuc(numero);
      return res.json({ tipo: 'RUC', data });
    }
    return res.status(400).json({ message: 'El documento debe tener 8 dígitos (DNI) u 11 dígitos (RUC)' });
  } catch (e) {
    console.error('consulta Factiliza:', e.message);
    res.status(502).json({ message: e.message || 'Error al consultar en SUNAT/RENIEC' });
  }
});

// --- Clientes ---
app.get('/api/clientes', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM clientes WHERE activo = 1 ORDER BY nombre'
    );
    res.json({ data: rows });
  } catch (e) {
    console.error('GET clientes:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/clientes', requirePermiso('clientes_crear'), async (req, res) => {
  try {
    const { nombre, documento, telefono, direccion } = req.body || {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }
    const [r] = await pool.query(
      `INSERT INTO clientes (nombre, documento, telefono, direccion)
       VALUES (?, ?, ?, ?)`,
      [String(nombre).trim(), documento || null, telefono || null, direccion || null]
    );
    res.status(201).json({ data: { id: r.insertId }, message: 'Cliente registrado' });
  } catch (e) {
    console.error('POST clientes:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.put('/api/clientes/:id', requirePermiso('clientes_crear'), async (req, res) => {
  try {
    const { nombre, documento, telefono, direccion } = req.body || {};
    await pool.query(
      `UPDATE clientes SET nombre = ?, documento = ?, telefono = ?, direccion = ?
       WHERE id = ? AND activo = 1`,
      [nombre, documento || null, telefono || null, direccion || null, req.params.id]
    );
    res.json({ message: 'Cliente actualizado' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    await pool.query('UPDATE clientes SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Cliente desactivado' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// --- Maquinaria ---
app.get('/api/maquinaria', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM maquinaria WHERE activo = 1 ORDER BY nombre'
    );
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/maquinaria', requirePermiso('maquinaria_crear'), async (req, res) => {
  try {
    const { codigo, nombre, tipo, tarifa_hora } = req.body || {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }
    const tarifa = Number(tarifa_hora);
    if (!Number.isFinite(tarifa) || tarifa < 0) {
      return res.status(400).json({ message: 'Tarifa por hora inválida' });
    }
    const [r] = await pool.query(
      `INSERT INTO maquinaria (codigo, nombre, tipo, tarifa_hora)
       VALUES (?, ?, ?, ?)`,
      [codigo || null, String(nombre).trim(), tipo || null, tarifa]
    );
    res.status(201).json({ data: { id: r.insertId }, message: 'Maquinaria registrada' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.put('/api/maquinaria/:id', requirePermiso('maquinaria_crear'), async (req, res) => {
  try {
    const { codigo, nombre, tipo, tarifa_hora } = req.body || {};
    await pool.query(
      `UPDATE maquinaria SET codigo = ?, nombre = ?, tipo = ?, tarifa_hora = ?
       WHERE id = ? AND activo = 1`,
      [codigo || null, nombre, tipo || null, Number(tarifa_hora), req.params.id]
    );
    res.json({ message: 'Maquinaria actualizada' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.delete('/api/maquinaria/:id', requirePermiso('maquinaria_crear'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[maq]] = await pool.query('SELECT id FROM maquinaria WHERE id = ? AND activo = 1', [id]);
    if (!maq) {
      return res.status(404).json({ message: 'Maquinaria no encontrada' });
    }

    const [[enCurso]] = await pool.query(
      `SELECT id FROM registros_trabajo WHERE id_maquinaria = ? AND estado = 'EN_CURSO' LIMIT 1`,
      [id]
    );
    if (enCurso) {
      return res.status(400).json({
        message: 'No se puede dar de baja: tiene un turno en curso. Ciérrelo primero.'
      });
    }

    await pool.query('UPDATE maquinaria SET activo = 0 WHERE id = ?', [id]);
    res.json({ message: 'Maquinaria dada de baja' });
  } catch (e) {
    console.error('DELETE maquinaria:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// --- Registros de trabajo ---
app.get('/api/registros', async (req, res) => {
  try {
    const { desde, hasta, id_maquinaria, estado } = req.query;
    let sql = `
      SELECT r.*,
        m.nombre AS maquinaria_nombre, m.codigo AS maquinaria_codigo,
        c.nombre AS cliente_nombre
      FROM registros_trabajo r
      INNER JOIN maquinaria m ON m.id = r.id_maquinaria
      LEFT JOIN clientes c ON c.id = r.id_cliente
      WHERE 1=1
    `;
    const params = [];
    if (desde) { sql += ' AND DATE(r.hora_inicio) >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND DATE(r.hora_inicio) <= ?'; params.push(hasta); }
    if (id_maquinaria) { sql += ' AND r.id_maquinaria = ?'; params.push(id_maquinaria); }
    if (estado) { sql += ' AND r.estado = ?'; params.push(estado); }
    sql += ' ORDER BY r.hora_inicio DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

/** Iniciar trabajo (solo hora inicio + ubicación) */
app.post('/api/registros/iniciar', requirePermiso('registrar'), async (req, res) => {
  try {
    const { id_maquinaria, id_cliente, hora_inicio, horometro_inicio, ubicacion, latitud, longitud, observaciones } = req.body || {};
    if (!id_maquinaria) return res.status(400).json({ message: 'Seleccione maquinaria' });

    const [[maq]] = await pool.query('SELECT id, tarifa_hora FROM maquinaria WHERE id = ? AND activo = 1', [id_maquinaria]);
    if (!maq) return res.status(404).json({ message: 'Maquinaria no encontrada' });

    const [[enCurso]] = await pool.query(
      `SELECT id FROM registros_trabajo WHERE id_maquinaria = ? AND estado = 'EN_CURSO' LIMIT 1`,
      [id_maquinaria]
    );
    if (enCurso) {
      return res.status(400).json({ message: 'Esta máquina ya tiene un turno en curso. Ciérrelo primero.' });
    }

    const horoIni = horometro_inicio != null && horometro_inicio !== '' ? Number(horometro_inicio) : null;
    if (horoIni != null && (!Number.isFinite(horoIni) || horoIni < 0)) {
      return res.status(400).json({ message: 'Horómetro de inicio inválido' });
    }

    const inicio = toMysqlDatetime(hora_inicio) || toMysqlDatetime(new Date());
    const [r] = await pool.query(
      `INSERT INTO registros_trabajo (
        id_maquinaria, id_cliente, hora_inicio, horometro_inicio, tarifa_hora, ubicacion, latitud, longitud, observaciones, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_CURSO')`,
      [
        id_maquinaria,
        id_cliente || null,
        inicio,
        horoIni,
        maq.tarifa_hora,
        ubicacion || null,
        latitud != null ? latitud : null,
        longitud != null ? longitud : null,
        observaciones || null
      ]
    );
    res.status(201).json({ data: { id: r.insertId }, message: 'Turno iniciado' });
  } catch (e) {
    console.error('iniciar:', e.message);
    res.status(500).json({ message: e.message });
  }
});

/** Cerrar trabajo (prioriza horómetro si hay ambos extremos) */
app.post('/api/registros/:id/cerrar', requirePermiso('registrar'), async (req, res) => {
  try {
    const { hora_fin, horometro_fin, tarifa_hora, monto } = req.body || {};
    const [[reg]] = await pool.query(
      `SELECT * FROM registros_trabajo WHERE id = ? AND estado = 'EN_CURSO'`,
      [req.params.id]
    );
    if (!reg) return res.status(404).json({ message: 'Registro no encontrado o ya cerrado' });

    const fin = toMysqlDatetime(hora_fin) || toMysqlDatetime(new Date());
    const calc = calcHorasYMonto({
      horaInicio: reg.hora_inicio,
      horaFin: fin,
      horometroInicio: reg.horometro_inicio,
      horometroFin: horometro_fin,
      tarifaHora: tarifa_hora != null && tarifa_hora !== '' ? tarifa_hora : (reg.tarifa_hora ?? 0),
      montoManual: monto
    });

    await pool.query(
      `UPDATE registros_trabajo
       SET hora_fin = ?, horometro_fin = ?, horas = ?, monto = ?, tarifa_hora = ?, estado = 'CERRADO'
       WHERE id = ?`,
      [
        fin,
        parseOptionalNumber(horometro_fin),
        calc.horas,
        calc.monto,
        calc.tarifa,
        req.params.id
      ]
    );
    res.json({
      data: {
        horas: calc.horas,
        monto: calc.monto,
        base_calculo: calc.baseCalculo,
        aviso: calc.aviso
      },
      message: calc.aviso || 'Turno cerrado'
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

/** Registro manual completo (inicio + fin de una vez; admite solo horómetro + fecha) */
app.post('/api/registros', requirePermiso('registrar'), async (req, res) => {
  try {
    const {
      id_maquinaria, id_cliente, fecha, hora_inicio, hora_fin, horometro_inicio, horometro_fin,
      ubicacion, latitud, longitud, observaciones, tarifa_hora, monto
    } = req.body || {};
    if (!id_maquinaria) {
      return res.status(400).json({ message: 'Maquinaria es obligatoria' });
    }

    const horoIni = parseOptionalNumber(horometro_inicio);
    const horoFin = parseOptionalNumber(horometro_fin);
    if (horometro_inicio != null && horometro_inicio !== '' && Number.isNaN(horoIni)) {
      return res.status(400).json({ message: 'Horómetro de inicio inválido' });
    }
    if (horometro_fin != null && horometro_fin !== '' && Number.isNaN(horoFin)) {
      return res.status(400).json({ message: 'Horómetro de fin inválido' });
    }

    const hasHoro = horoIni != null && horoFin != null;
    let ini = toMysqlDatetime(hora_inicio);
    let fin = toMysqlDatetime(hora_fin);
    const hasReloj = !!(ini && fin);
    const fechaStr = fecha ? String(fecha).trim().slice(0, 10) : '';
    if (fechaStr && !/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      return res.status(400).json({ message: 'Fecha inválida (use YYYY-MM-DD)' });
    }

    if (!hasHoro && !hasReloj) {
      return res.status(400).json({
        message: 'Indica horómetro inicio y fin, o hora inicio y fin'
      });
    }
    if (!ini && !fin && !fechaStr) {
      return res.status(400).json({
        message: 'Indica al menos una fecha del trabajo (campo fecha o hora inicio/fin)'
      });
    }

    const [[maq]] = await pool.query('SELECT tarifa_hora FROM maquinaria WHERE id = ?', [id_maquinaria]);
    if (!maq) return res.status(404).json({ message: 'Maquinaria no encontrada' });

    const tarifaBase = tarifa_hora != null && tarifa_hora !== ''
      ? Number(tarifa_hora)
      : Number(maq.tarifa_hora || 0);
    if (!Number.isFinite(tarifaBase) || tarifaBase < 0) {
      return res.status(400).json({ message: 'Tarifa inválida' });
    }

    // Reloj solo entra al cálculo si el usuario lo envió completo (evita avisos falsos)
    const calc = calcHorasYMonto({
      horaInicio: hasReloj ? ini : null,
      horaFin: hasReloj ? fin : null,
      horometroInicio: horoIni,
      horometroFin: horoFin,
      tarifaHora: tarifaBase,
      montoManual: monto
    });

    // Contexto de fecha/hora para reportes cuando no hay reloj completo
    if (!hasReloj) {
      if (fechaStr) {
        ini = toMysqlDatetime(`${fechaStr}T00:00:00`);
        fin = addHoursToMysqlDatetime(ini, calc.horas);
      } else if (ini) {
        fin = addHoursToMysqlDatetime(ini, calc.horas);
      } else if (fin) {
        const finDate = new Date(String(fin).replace(' ', 'T'));
        finDate.setTime(finDate.getTime() - calc.horas * 3600 * 1000);
        ini = toMysqlDatetime(finDate);
      }
    }
    if (!ini || !fin) {
      return res.status(400).json({ message: 'No se pudo determinar fecha/hora del trabajo' });
    }

    const [r] = await pool.query(
      `INSERT INTO registros_trabajo (
        id_maquinaria, id_cliente, hora_inicio, horometro_inicio, hora_fin, horometro_fin, horas, tarifa_hora, monto,
        ubicacion, latitud, longitud, observaciones, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CERRADO')`,
      [
        id_maquinaria, id_cliente || null, ini, horoIni, fin, horoFin, calc.horas, calc.tarifa, calc.monto,
        ubicacion || null, latitud ?? null, longitud ?? null, observaciones || null
      ]
    );
    res.status(201).json({
      data: {
        id: r.insertId,
        horas: calc.horas,
        monto: calc.monto,
        base_calculo: calc.baseCalculo,
        aviso: calc.aviso
      },
      message: calc.aviso || 'Registro guardado'
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// --- Tipos de gasto (catálogo) ---
function slugCodigoTipo(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function validarTipoGastoBody(body, { requireCodigo = false } = {}) {
  const nombre = String(body?.nombre || '').trim();
  if (!nombre || nombre.length < 2) throw new Error('El nombre del tipo es obligatorio');
  if (nombre.length > 80) throw new Error('El nombre no puede superar 80 caracteres');

  let codigo = String(body?.codigo || '').trim().toUpperCase();
  if (!codigo) codigo = slugCodigoTipo(nombre);
  codigo = codigo.replace(/[^A-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!codigo) throw new Error('Código de tipo inválido');
  if (requireCodigo && !codigo) throw new Error('Código obligatorio');

  const pideGalones = body?.pide_galones === true || body?.pide_galones === 1 || body?.pide_galones === '1';
  return { nombre, codigo, pide_galones: pideGalones ? 1 : 0 };
}

async function ensureTiposGastoSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tipos_gasto (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      codigo        VARCHAR(40)  NOT NULL,
      nombre        VARCHAR(80)  NOT NULL,
      pide_galones  TINYINT(1)   NOT NULL DEFAULT 0,
      activo        TINYINT(1)   NOT NULL DEFAULT 1,
      creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_tipos_gasto_codigo (codigo)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    INSERT IGNORE INTO tipos_gasto (codigo, nombre, pide_galones) VALUES
      ('COMBUSTIBLE', 'Combustible', 1),
      ('MANTENIMIENTO', 'Mantenimiento', 0)
  `);
  try {
    await pool.query('ALTER TABLE gastos MODIFY COLUMN tipo VARCHAR(40) NOT NULL');
  } catch (e) {
    // Si la columna ya es VARCHAR o la tabla no existe aún, continuar
    if (!/Unknown table|doesn't exist/i.test(e.message || '')) {
      console.error('ensureTiposGastoSchema ALTER:', e.message);
    }
  }
}

app.get('/api/tipos-gasto', requirePermiso('gastos'), async (req, res) => {
  try {
    const incluirInactivos = String(req.query.todos || '') === '1';
    const [rows] = await pool.query(
      `SELECT id, codigo, nombre, pide_galones, activo,
        CONVERT(creado_en, CHAR) AS creado_en
       FROM tipos_gasto
       ${incluirInactivos ? '' : 'WHERE activo = 1'}
       ORDER BY nombre ASC`
    );
    res.json({ data: rows });
  } catch (e) {
    console.error('GET tipos-gasto:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/tipos-gasto', requirePermiso('gastos_crear'), async (req, res) => {
  try {
    const { nombre, codigo, pide_galones } = validarTipoGastoBody(req.body);
    const [[dup]] = await pool.query(
      'SELECT id, activo FROM tipos_gasto WHERE codigo = ? LIMIT 1',
      [codigo]
    );
    if (dup) {
      if (Number(dup.activo) === 1) {
        return res.status(400).json({ message: `Ya existe el tipo con código ${codigo}` });
      }
      await pool.query(
        'UPDATE tipos_gasto SET nombre = ?, pide_galones = ?, activo = 1 WHERE id = ?',
        [nombre, pide_galones, dup.id]
      );
      return res.status(201).json({
        data: { id: dup.id, codigo, nombre, pide_galones },
        message: 'Tipo de gasto reactivado'
      });
    }

    const [r] = await pool.query(
      'INSERT INTO tipos_gasto (codigo, nombre, pide_galones) VALUES (?, ?, ?)',
      [codigo, nombre, pide_galones]
    );
    res.status(201).json({ data: { id: r.insertId, codigo, nombre, pide_galones }, message: 'Tipo de gasto creado' });
  } catch (e) {
    console.error('POST tipos-gasto:', e.message);
    res.status(400).json({ message: e.message });
  }
});

app.put('/api/tipos-gasto/:id', requirePermiso('gastos_crear'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[row]] = await pool.query('SELECT * FROM tipos_gasto WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ message: 'Tipo de gasto no encontrado' });

    const { nombre, codigo, pide_galones } = validarTipoGastoBody({
      ...req.body,
      codigo: req.body?.codigo != null && req.body.codigo !== '' ? req.body.codigo : row.codigo
    });

    const [[dup]] = await pool.query(
      'SELECT id FROM tipos_gasto WHERE codigo = ? AND id <> ? LIMIT 1',
      [codigo, id]
    );
    if (dup) return res.status(400).json({ message: `Ya existe el tipo con código ${codigo}` });

    // Si cambia el código, actualizar gastos que lo usan
    if (codigo !== row.codigo) {
      await pool.query('UPDATE gastos SET tipo = ? WHERE tipo = ?', [codigo, row.codigo]);
    }

    await pool.query(
      'UPDATE tipos_gasto SET codigo = ?, nombre = ?, pide_galones = ? WHERE id = ?',
      [codigo, nombre, pide_galones, id]
    );
    res.json({ message: 'Tipo de gasto actualizado' });
  } catch (e) {
    console.error('PUT tipos-gasto:', e.message);
    res.status(400).json({ message: e.message });
  }
});

app.delete('/api/tipos-gasto/:id', requirePermiso('gastos_crear'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[row]] = await pool.query('SELECT * FROM tipos_gasto WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ message: 'Tipo de gasto no encontrado' });

    const [[uso]] = await pool.query(
      'SELECT COUNT(*) AS n FROM gastos WHERE tipo = ? AND activo = 1',
      [row.codigo]
    );
    if (Number(uso?.n || 0) > 0) {
      // Baja lógica: sigue válido en historial
      await pool.query('UPDATE tipos_gasto SET activo = 0 WHERE id = ?', [id]);
      return res.json({ message: 'Tipo dado de baja (tiene gastos asociados)' });
    }
    await pool.query('UPDATE tipos_gasto SET activo = 0 WHERE id = ?', [id]);
    res.json({ message: 'Tipo de gasto eliminado' });
  } catch (e) {
    console.error('DELETE tipos-gasto:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// --- Gastos de maquinaria ---
app.get('/api/gastos', requirePermiso('gastos'), async (req, res) => {
  try {
    const { desde, hasta, id_maquinaria, tipo } = req.query;
    let sql = `
      SELECT g.id, g.id_maquinaria, g.tipo,
        CONVERT(g.fecha, CHAR) AS fecha,
        g.monto, g.horometro, g.galones, g.proveedor, g.descripcion,
        m.nombre AS maquinaria_nombre, m.codigo AS maquinaria_codigo,
        COALESCE(t.nombre, g.tipo) AS tipo_nombre,
        COALESCE(t.pide_galones, 0) AS pide_galones
      FROM gastos g
      INNER JOIN maquinaria m ON m.id = g.id_maquinaria
      LEFT JOIN tipos_gasto t ON t.codigo = g.tipo
      WHERE g.activo = 1
    `;
    const params = [];
    if (desde) { sql += ' AND g.fecha >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND g.fecha <= ?'; params.push(hasta); }
    if (id_maquinaria) { sql += ' AND g.id_maquinaria = ?'; params.push(id_maquinaria); }
    if (tipo) { sql += ' AND g.tipo = ?'; params.push(tipo); }
    sql += ' ORDER BY g.fecha DESC, g.id DESC LIMIT 500';
    const [rows] = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (e) {
    console.error('GET gastos:', e.message);
    res.status(500).json({ message: e.message });
  }
});

async function validarGasto(body) {
  const tipo = String(body?.tipo || '').trim().toUpperCase();
  if (!tipo) throw new Error('Seleccione el tipo de gasto');

  const [[tipoRow]] = await pool.query(
    'SELECT codigo, pide_galones, activo FROM tipos_gasto WHERE codigo = ? LIMIT 1',
    [tipo]
  );
  if (!tipoRow || !tipoRow.activo) throw new Error('Tipo de gasto inválido o inactivo');

  if (!body?.id_maquinaria) throw new Error('Seleccione la maquinaria');
  const monto = Number(body?.monto);
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('El monto debe ser mayor a 0');
  const horometro = body?.horometro != null && body?.horometro !== '' ? Number(body.horometro) : null;
  if (horometro != null && (!Number.isFinite(horometro) || horometro < 0)) throw new Error('Horómetro inválido');
  const galones = body?.galones != null && body?.galones !== '' ? Number(body.galones) : null;
  if (galones != null && (!Number.isFinite(galones) || galones < 0)) throw new Error('Galones inválido');
  return {
    tipo,
    monto,
    horometro,
    galones,
    pide_galones: !!tipoRow.pide_galones
  };
}

app.post('/api/gastos', requirePermiso('gastos_crear'), async (req, res) => {
  try {
    const { tipo, monto, horometro, galones, pide_galones } = await validarGasto(req.body);
    const { id_maquinaria, fecha, proveedor, descripcion } = req.body || {};

    const [[maq]] = await pool.query('SELECT id FROM maquinaria WHERE id = ? AND activo = 1', [id_maquinaria]);
    if (!maq) return res.status(404).json({ message: 'Maquinaria no encontrada' });

    const fechaVal = fecha && String(fecha).trim() ? String(fecha).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const [r] = await pool.query(
      `INSERT INTO gastos (id_maquinaria, tipo, fecha, monto, horometro, galones, proveedor, descripcion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id_maquinaria, tipo, fechaVal, monto, horometro, pide_galones ? galones : null,
       proveedor || null, descripcion || null]
    );
    res.status(201).json({ data: { id: r.insertId }, message: 'Gasto registrado' });
  } catch (e) {
    console.error('POST gastos:', e.message);
    res.status(400).json({ message: e.message });
  }
});

app.put('/api/gastos/:id', requirePermiso('gastos_crear'), async (req, res) => {
  try {
    const { tipo, monto, horometro, galones, pide_galones } = await validarGasto(req.body);
    const { id_maquinaria, fecha, proveedor, descripcion } = req.body || {};
    const fechaVal = fecha && String(fecha).trim() ? String(fecha).slice(0, 10) : new Date().toISOString().slice(0, 10);

    await pool.query(
      `UPDATE gastos SET id_maquinaria = ?, tipo = ?, fecha = ?, monto = ?, horometro = ?,
        galones = ?, proveedor = ?, descripcion = ?
       WHERE id = ? AND activo = 1`,
      [id_maquinaria, tipo, fechaVal, monto, horometro, pide_galones ? galones : null,
       proveedor || null, descripcion || null, req.params.id]
    );
    res.json({ message: 'Gasto actualizado' });
  } catch (e) {
    console.error('PUT gastos:', e.message);
    res.status(400).json({ message: e.message });
  }
});

app.delete('/api/gastos/:id', requirePermiso('gastos_crear'), async (req, res) => {
  try {
    await pool.query('UPDATE gastos SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Gasto eliminado' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// --- Usuarios (solo administrador) ---
function mapUsuarioRow(row) {
  if (!row) return null;
  let permisos = row.permisos;
  if (permisos && typeof permisos === 'string') {
    try { permisos = JSON.parse(permisos); } catch { permisos = []; }
  }
  return {
    id: row.id,
    usuario: row.usuario,
    nombre: row.nombre,
    email: row.email || null,
    rol: row.rol || 'operador',
    permisos: Array.isArray(permisos) ? permisos : [],
    activo: !!row.activo,
    creado_en: row.creado_en
  };
}

app.get('/api/usuarios', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, usuario, nombre, email, rol, permisos, activo,
              CONVERT(creado_en, CHAR) AS creado_en
       FROM usuarios ORDER BY nombre`
    );
    res.json({ data: rows.map(mapUsuarioRow) });
  } catch (e) {
    console.error('GET usuarios:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.post('/api/usuarios', adminMiddleware, async (req, res) => {
  try {
    const { usuario, nombre, email, password, rol, permisos, activo } = req.body || {};
    const userLogin = String(usuario || '').trim().toLowerCase();
    const userNombre = String(nombre || '').trim();
    const userEmail = normalizeEmail(email);
    const userRol = rol === 'admin' ? 'admin' : 'operador';

    if (!userLogin || !userNombre) {
      return res.status(400).json({ message: 'Usuario y nombre son obligatorios' });
    }
    if (!userEmail || !isValidEmail(userEmail)) {
      return res.status(400).json({ message: 'Ingrese un correo electrónico válido' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 4 caracteres' });
    }

    const permisosJson = userRol === 'admin' ? null : JSON.stringify(
      Array.isArray(permisos) ? permisos.filter(Boolean) : []
    );
    const hash = bcrypt.hashSync(String(password), 10);

    const [r] = await pool.query(
      `INSERT INTO usuarios (usuario, nombre, email, rol, permisos, password_hash, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userLogin, userNombre, userEmail, userRol, permisosJson, hash, activo === false ? 0 : 1]
    );
    res.status(201).json({ data: { id: r.insertId }, message: 'Usuario creado' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      const msg = String(e.message || '').includes('email')
        ? 'Ese correo electrónico ya está registrado'
        : 'Ese nombre de usuario ya existe';
      return res.status(400).json({ message: msg });
    }
    console.error('POST usuarios:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.put('/api/usuarios/:id', adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, email, password, rol, permisos, activo } = req.body || {};
    const userNombre = String(nombre || '').trim();
    const userEmail = normalizeEmail(email);
    const userRol = rol === 'admin' ? 'admin' : 'operador';

    if (!userNombre) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }
    if (!userEmail || !isValidEmail(userEmail)) {
      return res.status(400).json({ message: 'Ingrese un correo electrónico válido' });
    }

    const [[actual]] = await pool.query('SELECT id, rol FROM usuarios WHERE id = ?', [id]);
    if (!actual) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (actual.rol === 'admin' && userRol !== 'admin' && id === req.user.id) {
      return res.status(400).json({ message: 'No puede quitarse el rol de administrador a sí mismo' });
    }

    if (actual.rol === 'admin' && userRol !== 'admin') {
      const [[{ total }]] = await pool.query(
        "SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1"
      );
      if (total <= 1) {
        return res.status(400).json({ message: 'Debe existir al menos un administrador activo' });
      }
    }

    const permisosJson = userRol === 'admin' ? null : JSON.stringify(
      Array.isArray(permisos) ? permisos.filter(Boolean) : []
    );

    let sql = `UPDATE usuarios SET nombre = ?, email = ?, rol = ?, permisos = ?, activo = ?`;
    const params = [userNombre, userEmail, userRol, permisosJson, activo === false ? 0 : 1];

    if (password && String(password).trim()) {
      if (String(password).length < 4) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 4 caracteres' });
      }
      sql += ', password_hash = ?';
      params.push(bcrypt.hashSync(String(password), 10));
    }
    sql += ' WHERE id = ?';
    params.push(id);

    await pool.query(sql, params);
    res.json({ message: 'Usuario actualizado' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Ese correo electrónico ya está registrado' });
    }
    console.error('PUT usuarios:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.delete('/api/usuarios/:id', adminMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ message: 'No puede desactivar su propio usuario' });
    }

    const [[row]] = await pool.query('SELECT id, rol FROM usuarios WHERE id = ? AND activo = 1', [id]);
    if (!row) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (row.rol === 'admin') {
      const [[{ total }]] = await pool.query(
        "SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1"
      );
      if (total <= 1) {
        return res.status(400).json({ message: 'No puede desactivar el único administrador' });
      }
    }

    await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
    res.json({ message: 'Usuario desactivado' });
  } catch (e) {
    console.error('DELETE usuarios:', e.message);
    res.status(500).json({ message: e.message });
  }
});

// --- Reportes / ingresos ---
app.get('/api/reportes/resumen', requirePermiso('inicio'), async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const params = [];
    let filtro = "r.estado = 'CERRADO'";
    if (desde) { filtro += ' AND DATE(r.hora_inicio) >= ?'; params.push(desde); }
    if (hasta) { filtro += ' AND DATE(r.hora_inicio) <= ?'; params.push(hasta); }

    const [totales] = await pool.query(
      `SELECT
        COUNT(*) AS total_registros,
        COALESCE(SUM(r.horas), 0) AS total_horas,
        COALESCE(SUM(r.monto), 0) AS total_ingresos
       FROM registros_trabajo r WHERE ${filtro}`,
      params
    );

    const [porMaquina] = await pool.query(
      `SELECT m.id, m.nombre, m.codigo,
        COUNT(r.id) AS registros,
        COALESCE(SUM(r.horas), 0) AS horas,
        COALESCE(SUM(r.monto), 0) AS ingresos
       FROM maquinaria m
       LEFT JOIN registros_trabajo r ON r.id_maquinaria = m.id AND ${filtro}
       WHERE m.activo = 1
       GROUP BY m.id, m.nombre, m.codigo
       ORDER BY ingresos DESC`,
      params
    );

    const [enCurso] = await pool.query(
      `SELECT r.id, m.nombre AS maquinaria, c.nombre AS cliente, r.hora_inicio, r.ubicacion, r.latitud, r.longitud
       FROM registros_trabajo r
       INNER JOIN maquinaria m ON m.id = r.id_maquinaria
       LEFT JOIN clientes c ON c.id = r.id_cliente
       WHERE r.estado = 'EN_CURSO'`
    );

    res.json({
      data: {
        totales: totales[0],
        porMaquina,
        enCurso
      }
    });
  } catch (e) {
    console.error('reportes:', e.message);
    res.status(500).json({ message: e.message });
  }
});

/** Rentabilidad por máquina: ingresos − gastos en el período */
app.get('/api/reportes/rentabilidad', requirePermiso('reportes'), async (req, res) => {
  try {
    const desde = req.query.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);

    const [filas] = await pool.query(
      `SELECT m.id, m.nombre, m.codigo,
        COALESCE(ing.horas, 0) AS horas,
        COALESCE(ing.ingresos, 0) AS ingresos,
        COALESCE(gas.gastos_total, 0) AS gastos_total,
        COALESCE(ing.ingresos, 0) - COALESCE(gas.gastos_total, 0) AS utilidad
       FROM maquinaria m
       LEFT JOIN (
         SELECT id_maquinaria,
           SUM(horas) AS horas,
           SUM(monto) AS ingresos
         FROM registros_trabajo
         WHERE estado = 'CERRADO'
           AND DATE(hora_inicio) >= ? AND DATE(hora_inicio) <= ?
         GROUP BY id_maquinaria
       ) ing ON ing.id_maquinaria = m.id
       LEFT JOIN (
         SELECT id_maquinaria, SUM(monto) AS gastos_total
         FROM gastos
         WHERE activo = 1 AND fecha >= ? AND fecha <= ?
         GROUP BY id_maquinaria
       ) gas ON gas.id_maquinaria = m.id
       WHERE m.activo = 1
       ORDER BY utilidad DESC`,
      [desde, hasta, desde, hasta]
    );

    const [porTipo] = await pool.query(
      `SELECT g.id_maquinaria, g.tipo,
        COALESCE(t.nombre, g.tipo) AS tipo_nombre,
        SUM(g.monto) AS monto
       FROM gastos g
       LEFT JOIN tipos_gasto t ON t.codigo = g.tipo
       WHERE g.activo = 1 AND g.fecha >= ? AND g.fecha <= ?
       GROUP BY g.id_maquinaria, g.tipo, t.nombre
       ORDER BY monto DESC`,
      [desde, hasta]
    );

    const tiposPorMaq = new Map();
    for (const row of porTipo) {
      const key = String(row.id_maquinaria);
      if (!tiposPorMaq.has(key)) tiposPorMaq.set(key, []);
      tiposPorMaq.get(key).push({
        codigo: row.tipo,
        nombre: row.tipo_nombre,
        monto: Number(row.monto || 0)
      });
    }

    const porMaquina = filas.map((r) => {
      const gastosPorTipo = tiposPorMaq.get(String(r.id)) || [];
      const gastoComb = gastosPorTipo.find((x) => x.codigo === 'COMBUSTIBLE')?.monto || 0;
      const gastoMant = gastosPorTipo.find((x) => x.codigo === 'MANTENIMIENTO')?.monto || 0;
      return {
        ...r,
        gastos_por_tipo: gastosPorTipo,
        gastos_combustible: gastoComb,
        gastos_mantenimiento: gastoMant
      };
    });

    const totales = porMaquina.reduce((acc, r) => {
      acc.horas += Number(r.horas || 0);
      acc.ingresos += Number(r.ingresos || 0);
      acc.gastos_total += Number(r.gastos_total || 0);
      acc.gastos_combustible += Number(r.gastos_combustible || 0);
      acc.gastos_mantenimiento += Number(r.gastos_mantenimiento || 0);
      acc.utilidad += Number(r.utilidad || 0);
      return acc;
    }, { horas: 0, ingresos: 0, gastos_total: 0, gastos_combustible: 0, gastos_mantenimiento: 0, utilidad: 0 });

    res.json({
      data: {
        desde,
        hasta,
        totales,
        porMaquina
      }
    });
  } catch (e) {
    console.error('reportes/rentabilidad:', e.message);
    res.status(500).json({ message: e.message });
  }
});

/** Detalle de ingresos y egresos del período (para PDF / reportes) */
app.get('/api/reportes/detalle', requirePermiso('reportes'), async (req, res) => {
  try {
    const desde = req.query.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);

    const [ingresos] = await pool.query(
      `SELECT r.id,
        CONVERT(r.hora_inicio, CHAR) AS hora_inicio,
        CONVERT(r.hora_fin, CHAR) AS hora_fin,
        r.horas, r.tarifa_hora, r.monto,
        r.horometro_inicio, r.horometro_fin, r.ubicacion,
        m.nombre AS maquinaria_nombre, m.codigo AS maquinaria_codigo,
        c.nombre AS cliente_nombre
       FROM registros_trabajo r
       INNER JOIN maquinaria m ON m.id = r.id_maquinaria
       LEFT JOIN clientes c ON c.id = r.id_cliente
       WHERE r.estado = 'CERRADO'
         AND DATE(r.hora_inicio) >= ? AND DATE(r.hora_inicio) <= ?
       ORDER BY r.hora_inicio ASC
       LIMIT 1000`,
      [desde, hasta]
    );

    const [egresos] = await pool.query(
      `SELECT g.id,
        CONVERT(g.fecha, CHAR) AS fecha,
        g.tipo, g.monto, g.horometro, g.galones, g.proveedor, g.descripcion,
        m.nombre AS maquinaria_nombre, m.codigo AS maquinaria_codigo,
        COALESCE(t.nombre, g.tipo) AS tipo_nombre
       FROM gastos g
       INNER JOIN maquinaria m ON m.id = g.id_maquinaria
       LEFT JOIN tipos_gasto t ON t.codigo = g.tipo
       WHERE g.activo = 1 AND g.fecha >= ? AND g.fecha <= ?
       ORDER BY g.fecha ASC, g.id ASC
       LIMIT 1000`,
      [desde, hasta]
    );

    const totalIngresos = ingresos.reduce((s, r) => s + Number(r.monto || 0), 0);
    const totalEgresos = egresos.reduce((s, r) => s + Number(r.monto || 0), 0);

    res.json({
      data: {
        desde,
        hasta,
        ingresos,
        egresos,
        totales: {
          ingresos: Math.round(totalIngresos * 100) / 100,
          egresos: Math.round(totalEgresos * 100) / 100,
          utilidad: Math.round((totalIngresos - totalEgresos) * 100) / 100
        }
      }
    });
  } catch (e) {
    console.error('reportes/detalle:', e.message);
    res.status(500).json({ message: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function boot() {
  try {
    await ensureTiposGastoSchema();
  } catch (e) {
    console.error('ensureTiposGastoSchema:', e.message);
  }
  app.listen(PORT, () => {
    console.error(`MAQSIS Simple → http://localhost:${PORT}`);
  });
}

boot();
