-- Migración: catálogo de tipos de gasto (CRUD)
-- Ejecutar en bases existentes. Instalaciones nuevas ya lo traen en maqsis_simple.sql

CREATE TABLE IF NOT EXISTS tipos_gasto (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  codigo        VARCHAR(40)  NOT NULL,
  nombre        VARCHAR(80)  NOT NULL,
  pide_galones  TINYINT(1)   NOT NULL DEFAULT 0,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tipos_gasto_codigo (codigo)
) ENGINE=InnoDB;

INSERT IGNORE INTO tipos_gasto (codigo, nombre, pide_galones) VALUES
  ('COMBUSTIBLE', 'Combustible', 1),
  ('MANTENIMIENTO', 'Mantenimiento', 0);

-- Permitir códigos nuevos más allá del ENUM original
ALTER TABLE gastos
  MODIFY COLUMN tipo VARCHAR(40) NOT NULL;
