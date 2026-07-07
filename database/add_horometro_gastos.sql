-- Migración: horómetro en registros de trabajo + gastos de maquinaria
-- Ejecutar en phpMyAdmin si ya tenía la BD creada antes de esta versión

USE maqsislite;

-- Horómetro en registros de trabajo
ALTER TABLE registros_trabajo
  ADD COLUMN horometro_inicio DECIMAL(10,1) NULL COMMENT 'Lectura del horómetro al iniciar' AFTER hora_inicio;

ALTER TABLE registros_trabajo
  ADD COLUMN horometro_fin DECIMAL(10,1) NULL COMMENT 'Lectura del horómetro al cerrar' AFTER hora_fin;

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
