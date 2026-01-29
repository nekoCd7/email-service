require('dotenv').config();
const express = require('express');
const path = require('path');
const dns = require('dns').promises;
const db = require('./db');
const SMTPServerManager = require('./smtp-server');
const apiRoutes = require('./api-routes');

const app = express();
const PORT = process.env.PORT || 3000;
const SMTP_PORT = process.env.SMTP_PORT || 25;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// API Routes (existing)
app.use('/api', apiRoutes);

// Render auth pages
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.render('login', {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    BASE_URL: baseUrl
  });
});

app.get('/signup', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.render('signup', {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    BASE_URL: baseUrl
  });
});

// Helper function to pass DNS config to views
const getDnsConfig = () => ({
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  MAIL_SERVER_HOST: process.env.MAIL_SERVER_HOST || 'mail.example.com',
  MAIL_SERVER_IP: process.env.MAIL_SERVER_IP || '192.0.2.1',
  SPF_RECORD: process.env.SPF_RECORD || 'v=spf1 -all',
  DKIM_SELECTOR: process.env.DKIM_SELECTOR || 'default',
  DKIM_PUBLIC_KEY: process.env.DKIM_PUBLIC_KEY || '',
  DMARC_RECORD: process.env.DMARC_RECORD || '',
  MX_PRIORITY: process.env.MX_PRIORITY || '10'
});

// Render app pages (all require auth middleware in real app)
app.get('/app/inbox', (req, res) => {
  res.render('inbox', getDnsConfig());
});

app.get('/app/sent', (req, res) => {
  res.render('sent', getDnsConfig());
});

app.get('/app/drafts', (req, res) => {
  res.render('drafts', getDnsConfig());
});

app.get('/app/compose', (req, res) => {
  res.render('compose', getDnsConfig());
});

app.get('/app/domains', (req, res) => {
  res.render('domains', getDnsConfig());
});

app.get('/app/account', (req, res) => {
  res.render('account', getDnsConfig());
});

app.get('/app/settings', (req, res) => {
  res.render('settings', getDnsConfig());
});

app.get('/app/mailboxes', (req, res) => {
  res.render('mailboxes', getDnsConfig());
});

app.get('/app/forwarding', (req, res) => {
  res.render('forwarding', getDnsConfig());
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// DNS check endpoint
app.get('/api/check-dns', async (req, res, next) => {
  try {
    const domain = (req.query.domain || '').trim();
    if (!domain) return res.status(400).json({ error: 'domain query required' });

    const results = {};

    try {
      results.mx = await dns.resolveMx(domain);
    } catch (e) {
      results.mx = { error: e.message };
    }

    try {
      const txt = await dns.resolveTxt(domain);
      results.txt = txt.map(r => r.join(''));
    } catch (e) {
      results.txt = { error: e.message };
    }

    try {
      const dmarc = await dns.resolveTxt(`_dmarc.${domain}`);
      results.dmarc = dmarc.map(r => r.join(''));
    } catch (e) {
      results.dmarc = { error: e.message };
    }

    try {
      const dkim = await dns.resolveTxt(`${process.env.DKIM_SELECTOR || 'default'}._domainkey.${domain}`);
      results.dkim = dkim.map(r => r.join(''));
    } catch (e) {
      results.dkim = { error: e.message };
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// Forwarding rules API
app.get('/api/forwarding-rules', async (req, res) => {
  try {
    // In production, fetch from database
    const rules = [
      { id: 1, from: 'info@example.com', to: 'external@gmail.com', enabled: true, keepCopy: true },
      { id: 2, from: 'support@example.com', to: 'support@company.com', enabled: true, keepCopy: false }
    ];
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/forwarding-rules', (req, res) => {
  try {
    const { from, to, enabled, keepCopy } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });
    
    // In production, save to database
    res.json({ id: Date.now(), from, to, enabled: enabled !== false, keepCopy: keepCopy !== false, created: new Date() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/forwarding-rules/:id', (req, res) => {
  try {
    // In production, delete from database
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mailboxes API
app.get('/api/mailboxes', async (req, res) => {
  try {
    // In production, fetch from database
    const mailboxes = [
      { id: 1, email: 'admin@example.com', name: 'Admin', status: 'active', created: '2024-01-01', quota: 512, used: 245 },
      { id: 2, email: 'user@example.com', name: 'User', status: 'active', created: '2024-01-05', quota: 512, used: 128 }
    ];
    res.json(mailboxes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mailboxes', (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    
    // In production, save to database and configure mail server
    res.json({ id: Date.now(), email, name: name || email.split('@')[0], status: 'active', created: new Date(), quota: 512, used: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// Start servers
async function start() {
  try {
    console.log('Initializing database...');
    await db.init();

    console.log('Starting SMTP server...');
    const smtpServer = new SMTPServerManager(SMTP_PORT);
    await smtpServer.start();

    const httpServer = app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`Email Service is running!`);
      console.log(`Web Interface: http://localhost:${PORT}`);
      console.log(`SMTP Server: localhost:${SMTP_PORT}`);
      console.log(`========================================\n`);
    });

    // Store server references globally for graceful shutdown
    global.httpServer = httpServer;
    global.smtpServer = smtpServer;
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown - close all ports
const shutdown = async (signal) => {
  console.log(`\n${signal} received, closing all ports...`);
  
  try {
    // Close HTTP server
    if (global.httpServer) {
      global.httpServer.close(() => {
        console.log(`✓ HTTP server closed (port ${PORT})`);
      });
    }
    
    // Close SMTP server
    if (global.smtpServer) {
      await global.smtpServer.stop();
      console.log(`✓ SMTP server closed (port ${SMTP_PORT})`);
    }
    
    // Close database
    await db.close();
    console.log('✓ Database closed');
    
    // Force exit after 5 seconds if cleanup hangs
    setTimeout(() => {
      console.log('Force exit...');
      process.exit(0);
    }, 5000);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
