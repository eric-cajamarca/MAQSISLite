-- Actualiza la contraseña del admin a admin123 (si el hash anterior no funcionaba)
USE maqsislite;

UPDATE usuarios
SET password_hash = '$2b$10$pDawaEvO0zB9BxA2JkprtutSgaIedCkpkB1SAo05sY.uIwK3tHJg2'
WHERE usuario = 'admin';
