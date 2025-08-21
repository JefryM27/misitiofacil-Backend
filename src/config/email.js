// src/config/email.js
import nodemailer from 'nodemailer';
import { config } from './index.js';

// Configuración del transporter
const createTransporter = () => {
  // Para desarrollo (Ethereal Email - emails de prueba)
  if (process.env.NODE_ENV === 'development') {
    return nodemailer.createTransporter({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: process.env.ETHEREAL_USER || 'ethereal.user@ethereal.email',
        pass: process.env.ETHEREAL_PASS || 'ethereal.pass'
      }
    });
  }

  // Para producción (Gmail, SendGrid, etc.)
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false, // true para 465, false para otros puertos
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD // App Password para Gmail
    }
  });
};

export const transporter = createTransporter();

// Verificar configuración de email
export const verifyEmailConfig = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email transporter configurado correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error en configuración de email:', error.message);
    return false;
  }
};

// Templates de email
export const emailTemplates = {
  // Template para reset de contraseña
  passwordReset: (resetUrl, userName) => ({
    subject: 'Restablecer contraseña - MiSitioFácil',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">MiSitioFácil</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333; margin-bottom: 20px;">Hola ${userName},</h2>
          
          <p style="color: #666; line-height: 1.6;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta en MiSitioFácil.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #667eea; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;
                      font-weight: bold;">
              Restablecer Contraseña
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            Este enlace expirará en <strong>1 hora</strong> por seguridad.
          </p>
          
          <p style="color: #666; font-size: 14px;">
            Si no solicitaste este cambio, puedes ignorar este email de forma segura.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            © 2025 MiSitioFácil. Todos los derechos reservados.
          </p>
        </div>
      </div>
    `,
    text: `
      Hola ${userName},
      
      Recibimos una solicitud para restablecer tu contraseña en MiSitioFácil.
      
      Para continuar, visita este enlace: ${resetUrl}
      
      Este enlace expirará en 1 hora.
      
      Si no solicitaste este cambio, ignora este email.
      
      Saludos,
      Equipo MiSitioFácil
    `
  }),

  // Template para confirmación de cambio
  passwordChanged: (userName, loginUrl) => ({
    subject: 'Contraseña actualizada - MiSitioFácil',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">MiSitioFácil</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333;">¡Contraseña actualizada!</h2>
          
          <p style="color: #666; line-height: 1.6;">
            Hola ${userName}, tu contraseña ha sido cambiada exitosamente.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" 
               style="background: #28a745; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;
                      font-weight: bold;">
              Iniciar Sesión
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            Si no realizaste este cambio, contacta inmediatamente con soporte.
          </p>
        </div>
      </div>
    `,
    text: `
      Hola ${userName},
      
      Tu contraseña ha sido cambiada exitosamente en MiSitioFácil.
      
      Puedes iniciar sesión en: ${loginUrl}
      
      Si no realizaste este cambio, contacta con soporte inmediatamente.
    `
  })
};

// Función helper para enviar emails
export const sendEmail = async (to, template) => {
  try {
    const mailOptions = {
      from: `"MiSitioFácil" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email enviado:', {
      messageId: result.messageId,
      to: to,
      subject: template.subject
    });

    // En desarrollo, mostrar preview URL
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(result));
    }

    return {
      success: true,
      messageId: result.messageId,
      previewUrl: nodemailer.getTestMessageUrl(result)
    };

  } catch (error) {
    console.error('❌ Error enviando email:', error);
    throw new Error('No se pudo enviar el email');
  }
};

export default {
  transporter,
  verifyEmailConfig,
  emailTemplates,
  sendEmail
};