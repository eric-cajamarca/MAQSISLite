# MAQSIS Simple

Versión **mínima** para el cliente: control de horas de maquinaria, clientes, ubicación e ingresos.

| Versión compleja (`backAppC` + `adminSPA`) | Esta versión (`simple/`) |
|-------------------------------------------|--------------------------|
| SQL Server, Angular, multi-tenant, SaaS | **MySQL + phpMyAdmin** |
| Decenas de módulos | **5 pantallas en una sola página** |
| Semanas de implementación | Listo para usar en minutos |

## Qué hace

1. **Registrar maquinaria** con tarifa por hora (S/)
2. **Registrar clientes**
3. **Registrar horas** de trabajo:
   - Iniciar turno (solo hora inicio) y cerrar después
   - O cargar inicio + fin de una vez
4. **Ubicación** (texto de obra + GPS opcional del celular)
5. **Ver cuánto gana cada máquina** (horas × tarifa = ingreso)

## Requisitos

- Node.js 18+
- MySQL (XAMPP, WAMP o servidor con **phpMyAdmin**)

## Instalación

### 1. Base de datos (phpMyAdmin)

1. Abra phpMyAdmin → **Importar**
2. Seleccione `database/maqsis_simple.sql`
3. Ejecutar

O en consola MySQL:

```sql
SOURCE C:/MAQSIS/simple/database/maqsis_simple.sql;
```

### 2. Backend

```powershell
cd c:\MAQSIS\simple
copy .env.example .env
# Editar .env: DB_USER, DB_PASSWORD (XAMPP suele ser root sin contraseña)

npm install
npm start
```

### 3. Abrir en el navegador

```
http://localhost:3080
```

Se abrirá la pantalla de **login**. Credenciales por defecto:

| Usuario | Contraseña |
|---------|------------|
| `admin` | `admin123` |

> Cambie la contraseña en producción y defina `JWT_SECRET` en `.env`.

Si ya tenía la base de datos creada **antes** del login, importe también `database/add_login.sql` en phpMyAdmin.

## Estructura

```
simple/
├── database/maqsis_simple.sql   ← importar en phpMyAdmin
├── server.js                    ← API + sirve la web
├── db.js
├── public/
│   ├── login.html               ← pantalla de acceso
│   ├── index.html               ← toda la interfaz
│   ├── app.js
│   └── styles.css
└── package.json
```

## API (referencia)

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/auth/login` | Iniciar sesión (cookie JWT) |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Usuario actual |
| GET | `/api/maquinaria` | Listar máquinas |
| POST | `/api/maquinaria` | Alta máquina + tarifa/hora |
| GET | `/api/clientes` | Listar clientes |
| POST | `/api/clientes` | Alta cliente |
| POST | `/api/registros/iniciar` | Empezar turno |
| POST | `/api/registros/:id/cerrar` | Terminar turno (calcula horas y monto) |
| POST | `/api/registros` | Registro manual inicio+fin |
| GET | `/api/reportes/resumen` | Ingresos por máquina |

## Fórmula de ingreso

```
monto = horas_trabajadas × tarifa_hora
```

La tarifa se toma de la máquina al iniciar el turno.

## Próximos pasos opcionales

- Exportar a Excel
- Mapa con última ubicación GPS
- App móvil PWA offline

La versión completa en `backAppC/` sigue disponible si el cliente crece después.
