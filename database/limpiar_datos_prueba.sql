-- Vacía datos de prueba / deja listo para producción.
-- Conserva solo el usuario admin.
-- IMPORTANTE: ejecuta esto solo cuando quieras borrar TODO el historial.

USE maqsislite;

START TRANSACTION;

DELETE FROM password_reset_tokens;
DELETE FROM gastos;
DELETE FROM registros_trabajo;
DELETE FROM clientes;
DELETE FROM maquinaria;
DELETE FROM usuarios WHERE LOWER(usuario) <> 'admin';

UPDATE usuarios
SET activo = 1, rol = 'admin', permisos = NULL
WHERE LOWER(usuario) = 'admin';

COMMIT;
