-- MAQSIS Simple — MySQL / phpMyAdmin
-- 1. Crear BD en phpMyAdmin o: CREATE DATABASE maqsislite;
-- 2. Seleccionar la BD e importar este archivo

CREATE DATABASE IF NOT EXISTS maqsislite
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE maqsislite;

-- Usuarios (login)
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  usuario       VARCHAR(50)  NOT NULL UNIQUE,
  nombre        VARCHAR(100) NOT NULL,
  rol           VARCHAR(20)  NOT NULL DEFAULT 'operador' COMMENT 'admin | operador',
  permisos      JSON         NULL COMMENT 'Permisos del operador (admin tiene todos)',
  password_hash VARCHAR(255) NOT NULL,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Usuario inicial: admin / admin123  (cambiar contraseña en producción)
INSERT INTO usuarios (usuario, nombre, rol, password_hash) VALUES
  ('admin', 'Administrador', 'admin', '$2b$10$pDawaEvO0zB9BxA2JkprtutSgaIedCkpkB1SAo05sY.uIwK3tHJg2')
ON DUPLICATE KEY UPDATE usuario = usuario;

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  documento     VARCHAR(20)  NULL COMMENT 'RUC o DNI',
  telefono      VARCHAR(30)  NULL,
  direccion     VARCHAR(255) NULL,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Maquinaria / vehículos
CREATE TABLE IF NOT EXISTS maquinaria (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  codigo        VARCHAR(30)  NULL COMMENT 'Placa o código interno',
  nombre        VARCHAR(150) NOT NULL,
  tipo          VARCHAR(80)  NULL COMMENT 'Excavadora, retro, grúa...',
  tarifa_hora   DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Soles por hora',
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Registro de trabajo (inicio, fin, ubicación, ingreso)
CREATE TABLE IF NOT EXISTS registros_trabajo (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  id_maquinaria   INT          NOT NULL,
  id_cliente      INT          NULL,
  hora_inicio     DATETIME     NOT NULL,
  horometro_inicio DECIMAL(10,1) NULL COMMENT 'Lectura del horómetro al iniciar',
  hora_fin        DATETIME     NULL,
  horometro_fin   DECIMAL(10,1) NULL COMMENT 'Lectura del horómetro al cerrar',
  horas           DECIMAL(10,4) NULL COMMENT 'Calculado al cerrar',
  tarifa_hora     DECIMAL(12,2) NULL COMMENT 'Tarifa al momento del registro',
  monto           DECIMAL(12,2) NULL COMMENT 'horas × tarifa',
  ubicacion       VARCHAR(255) NULL COMMENT 'Obra, dirección o referencia',
  latitud         DECIMAL(10,7) NULL,
  longitud        DECIMAL(10,7) NULL,
  observaciones   VARCHAR(500) NULL,
  estado          ENUM('EN_CURSO','CERRADO') NOT NULL DEFAULT 'EN_CURSO',
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reg_maquinaria FOREIGN KEY (id_maquinaria) REFERENCES maquinaria(id),
  CONSTRAINT fk_reg_cliente    FOREIGN KEY (id_cliente)    REFERENCES clientes(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_reg_maquinaria ON registros_trabajo(id_maquinaria, hora_inicio);
CREATE INDEX idx_reg_cliente    ON registros_trabajo(id_cliente);
CREATE INDEX idx_reg_estado     ON registros_trabajo(estado);

-- Gastos de maquinaria (combustible / mantenimiento)
CREATE TABLE IF NOT EXISTS gastos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  id_maquinaria INT           NOT NULL,
  tipo          ENUM('COMBUSTIBLE','MANTENIMIENTO') NOT NULL,
  fecha         DATE          NOT NULL,
  monto         DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Costo en soles',
  horometro     DECIMAL(10,1) NULL COMMENT 'Lectura del horómetro al momento del gasto',
  galones       DECIMAL(10,2) NULL COMMENT 'Solo combustible',
  proveedor     VARCHAR(150)  NULL,
  descripcion   VARCHAR(300)  NULL,
  activo        TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gasto_maquinaria FOREIGN KEY (id_maquinaria) REFERENCES maquinaria(id)
) ENGINE=InnoDB;

CREATE INDEX idx_gasto_maquinaria ON gastos(id_maquinaria, fecha);
CREATE INDEX idx_gasto_tipo       ON gastos(tipo);

-- Datos de ejemplo (opcional)
INSERT INTO maquinaria (codigo, nombre, tipo, tarifa_hora) VALUES
  ('ABC-123', 'Retroexcavadora CAT 320', 'Retroexcavadora', 180.00),
  ('XYZ-456', 'Minicargador Bobcat', 'Minicargador', 120.00);

INSERT INTO clientes (nombre, documento, telefono) VALUES
  ('Constructora Los Andes SAC', '20123456789', '999888777'),
  ('Juan Pérez', '12345678', '987654321');
