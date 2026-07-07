const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'maqsis-simple-cambiar-en-produccion';
const COOKIE_NAME = 'maqsis_token';
const TOKEN_HOURS = 12;

/** Permisos asignables a operadores (usuarios no admin). */
const PERMISOS_OPERADOR = {
  inicio: 'Ver inicio',
  registrar: 'Registrar horas',
  historial: 'Ver historial',
  clientes: 'Ver clientes',
  clientes_crear: 'Crear/editar clientes',
  maquinaria: 'Ver máquinas',
  maquinaria_crear: 'Crear/editar máquinas',
  gastos: 'Ver gastos',
  gastos_crear: 'Registrar/editar gastos',
  reportes: 'Ver reportes'
};

const PERMISOS_ADMIN_EXTRA = { usuarios: 'Administrar usuarios' };

function parsePermisos(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function permisosEfectivos(user) {
  if (!user) return [];
  if (user.rol === 'admin') {
    return [...Object.keys(PERMISOS_OPERADOR), 'usuarios'];
  }
  return parsePermisos(user.permisos);
}

function tienePermiso(user, permiso) {
  return permisosEfectivos(user).includes(permiso);
}

function esAdmin(user) {
  return user && user.rol === 'admin';
}

function signToken(user) {
  const permisos = permisosEfectivos(user);
  return jwt.sign(
    {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre,
      rol: user.rol || 'operador',
      permisos
    },
    JWT_SECRET,
    { expiresIn: `${TOKEN_HOURS}h` }
  );
}

function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ message: 'No autenticado' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Sesión expirada' });
  }
}

function adminMiddleware(req, res, next) {
  if (!esAdmin(req.user)) {
    return res.status(403).json({ message: 'Solo administradores pueden realizar esta acción' });
  }
  next();
}

function requirePermiso(permiso) {
  return (req, res, next) => {
    if (!tienePermiso(req.user, permiso)) {
      return res.status(403).json({ message: 'No tiene permiso para esta acción' });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  COOKIE_NAME,
  TOKEN_HOURS,
  PERMISOS_OPERADOR,
  PERMISOS_ADMIN_EXTRA,
  parsePermisos,
  permisosEfectivos,
  tienePermiso,
  esAdmin,
  signToken,
  authMiddleware,
  adminMiddleware,
  requirePermiso
};
