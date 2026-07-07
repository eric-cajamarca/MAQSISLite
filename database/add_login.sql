-- Si ya importó maqsis_simple.sql antes del login, ejecute solo este archivo en phpMyAdmin

USE maqsislite;

CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  usuario       VARCHAR(50)  NOT NULL UNIQUE,
  nombre        VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO usuarios (usuario, nombre, password_hash) VALUES
  ('admin', 'Administrador', '$2b$10$pDawaEvO0zB9BxA2JkprtutSgaIedCkpkB1SAo05sY.uIwK3tHJg2')
ON DUPLICATE KEY UPDATE usuario = usuario;
