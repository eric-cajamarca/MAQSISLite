-- Agrega email a usuarios y tabla de tokens para recuperación de contraseña
USE maqsislite;

ALTER TABLE usuarios
  ADD COLUMN email VARCHAR(150) NULL COMMENT 'Correo para recuperación de contraseña' AFTER nombre;

ALTER TABLE usuarios
  ADD UNIQUE INDEX uq_usuarios_email (email);

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
