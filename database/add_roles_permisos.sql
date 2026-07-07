-- Migración: roles y permisos en usuarios
-- Ejecutar en phpMyAdmin si ya tenía la BD creada antes de esta versión

USE maqsislite;

ALTER TABLE usuarios
  ADD COLUMN rol VARCHAR(20) NOT NULL DEFAULT 'operador' AFTER nombre;

ALTER TABLE usuarios
  ADD COLUMN permisos JSON NULL COMMENT 'Permisos del operador' AFTER rol;

UPDATE usuarios SET rol = 'admin' WHERE LOWER(usuario) = 'admin';
