const nodemailer = require('nodemailer');

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

function isMailConfigured() {
  return !!getTransporter();
}

async function sendPasswordResetEmail(to, resetUrl, nombre) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('El servidor de correo no está configurado (SMTP)');
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const nombreSafe = nombre || 'Usuario';

  await transporter.sendMail({
    from,
    to,
    subject: 'Recuperación de contraseña — MAQSIS',
    text: [
      `Hola ${nombreSafe},`,
      '',
      'Recibimos una solicitud para restablecer tu contraseña en MAQSIS.',
      'Si fuiste tú, abre este enlace (válido 1 hora):',
      resetUrl,
      '',
      'Si no solicitaste este cambio, ignora este correo.',
      '',
      '— MAQSIS Simple'
    ].join('\n'),
    html: `
      <p>Hola <strong>${nombreSafe}</strong>,</p>
      <p>Recibimos una solicitud para restablecer tu contraseña en MAQSIS.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;">Restablecer contraseña</a></p>
      <p style="font-size:13px;color:#666;">O copia este enlace en tu navegador:<br><a href="${resetUrl}">${resetUrl}</a></p>
      <p style="font-size:13px;color:#666;">El enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
      <p>— MAQSIS Simple</p>
    `
  });
}

module.exports = { sendPasswordResetEmail, isMailConfigured };
