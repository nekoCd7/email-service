const nodemailer = require('nodemailer');

class EmailSender {
  constructor() {
    this.transporters = new Map();
  }

  // Create transporter for sending emails
  getTransporter(provider = 'local') {
    if (this.transporters.has(provider)) {
      return this.transporters.get(provider);
    }

    // Local transporter (catches emails locally for now, or uses sendmail)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: process.env.SMTP_USER && {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    this.transporters.set(provider, transporter);
    return transporter;
  }

  async sendEmail(from, to, subject, text, html) {
    try {
      const transporter = this.getTransporter();
      
      const result = await transporter.sendMail({
        from: from,
        to: to,
        subject: subject,
        text: text,
        html: html || text
      });

      console.log(`Email sent: ${from} -> ${to}, Message ID: ${result.messageId}`);
      return result;
    } catch (err) {
      console.error('Failed to send email:', err);
      throw err;
    }
  }

  async verifyTransporter() {
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      console.log('SMTP connection verified');
      return true;
    } catch (err) {
      console.error('SMTP connection failed:', err);
      return false;
    }
  }
}

module.exports = new EmailSender();
