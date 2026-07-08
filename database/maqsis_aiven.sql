-- MAQSIS Lite — Importar en Aiven (base defaultdb)
-- No incluye CREATE DATABASE ni USE (Aiven ya tiene defaultdb)

-- Usuarios (login)
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  usuario       VARCHAR(50)  NOT NULL UNIQUE,
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NULL COMMENT 'Correo para recuperación de contraseña',
  rol           VARCHAR(20)  NOT NULL DEFAULT 'operador' COMMENT 'admin | operador',
  permisos      JSON         NULL COMMENT 'Permisos del operador (admin tiene todos)',
  password_hash VARCHAR(255) NOT NULL,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE UNIQUE INDEX uq_usuarios_email ON usuarios (email);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario  INT          NOT NULL,
  token_hash  VARCHAR(64)  NOT NULL COMMENT 'SHA-256 del token enviado por correo',
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL,
  creado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reset_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_reset_token_hash ON password_reset_tokens (token_hash);
CREATE INDEX idx_reset_usuario ON password_reset_tokens (id_usuario, used_at);

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

-- Registro de trabajo
CREATE TABLE IF NOT EXISTS registros_trabajo (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  id_maquinaria   INT          NOT NULL,
  id_cliente      INT          NULL,
  hora_inicio     DATETIME     NOT NULL,
  horometro_inicio DECIMAL(10,1) NULL,
  hora_fin        DATETIME     NULL,
  horometro_fin   DECIMAL(10,1) NULL,
  horas           DECIMAL(10,4) NULL,
  tarifa_hora     DECIMAL(12,2) NULL,
  monto           DECIMAL(12,2) NULL,
  ubicacion       VARCHAR(255) NULL,
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

-- Gastos
CREATE TABLE IF NOT EXISTS gastos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  id_maquinaria INT           NOT NULL,
  tipo          ENUM('COMBUSTIBLE','MANTENIMIENTO') NOT NULL,
  fecha         DATE          NOT NULL,
  monto         DECIMAL(12,2) NOT NULL DEFAULT 0,
  horometro     DECIMAL(10,1) NULL,
  galones       DECIMAL(10,2) NULL,
  proveedor     VARCHAR(150)  NULL,
  descripcion   VARCHAR(300)  NULL,
  activo        TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gasto_maquinaria FOREIGN KEY (id_maquinaria) REFERENCES maquinaria(id)
) ENGINE=InnoDB;

CREATE INDEX idx_gasto_maquinaria ON gastos(id_maquinaria, fecha);
CREATE INDEX idx_gasto_tipo       ON gastos(tipo);

-- Sin datos de ejemplo: solo queda el admin (admin / admin123).
-- Tras el primer login, edita el admin y asígnale un correo para recuperación de contraseña.