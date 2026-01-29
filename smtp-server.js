const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const db = require('./db');
const { v4: uuid } = require('uuid');

class SMTPServerManager {
  constructor(port = 25) {
    this.port = port;
    this.server = null;
  }

  async start() {
    this.server = new SMTPServer({
      secure: false,
      authOptional: true,
      onConnect: (session, callback) => {
        callback();
      },
      onAuth: (auth, session, callback) => {
        // Allow any authentication
        callback(null, { user: auth.username });
      },
      onMailFrom: (address, session, callback) => {
        callback();
      },
      onRcptTo: (address, session, callback) => {
        callback();
      },
      onData: async (stream, session, callback) => {
        try {
          const parsed = await simpleParser(stream);
          
          // Extract recipient email domain to find account
          let toEmail = session.envelope.rcptTo[0]?.address || '';
          let subject = parsed.subject || '(no subject)';
          let text = parsed.text || '';
          let html = parsed.html || '';
          let fromEmail = session.envelope.mailFrom?.address || parsed.from?.text || 'unknown';

          // Find account by email address
          const account = await db.getAccount(toEmail);
          
          if (account) {
            // Save email to database
            const emailId = uuid();
            await db.saveEmail(
              emailId,
              account.id,
              fromEmail,
              toEmail,
              subject,
              text,
              html,
              'received'
            );
            console.log(`Email received: ${fromEmail} -> ${toEmail}`);
          } else {
            console.log(`Account not found for: ${toEmail}`);
          }

          callback();
        } catch (err) {
          console.error('Error parsing email:', err);
          callback(new Error('Failed to parse email'));
        }
      }
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`SMTP Server listening on port ${this.port}`);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('SMTP Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = SMTPServerManager;
