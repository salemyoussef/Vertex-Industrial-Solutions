const nodemailer = require('nodemailer');

// Initialize transporter
let transporter;

async function setupTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    // Professional SMTP setup (e.g. Corporate SMTP server)
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true', 
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('✉️ Professional SMTP email configured.');
  } else {
    // Development Fallback: Ethereal Email
    console.log('✉️ No SMTP credentials found. Using development fallback (Ethereal).');
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }
}

setupTransporter().catch(console.error);

/**
 * Send an email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Email body (plaintext)
 * @param {string} html - Email body (HTML)
 */
async function sendEmail(to, subject, text, html) {
  if (!transporter) {
    console.error('Email transporter not ready.');
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Smart Factory Admin" <admin@smartfactory.local>',
    to,
    subject,
    text,
    html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email sent to ${to}: ${info.messageId}`);
    
    // If using Ethereal, print the preview URL so the developer can see it
    if (!process.env.SMTP_HOST) {
      console.log(`🔗 Preview Email: ${nodemailer.getTestMessageUrl(info)}`);
    }
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

module.exports = { sendEmail };
