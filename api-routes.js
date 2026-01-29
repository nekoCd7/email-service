const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { v4: uuid } = require('uuid');
const dns = require('dns').promises;
const db = require('./db');
const emailSender = require('./email-sender');

const router = express.Router();
router.use(bodyParser.json());
router.use(cors());

// Auth Routes
router.post('/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('[SIGNUP] Attempt for email:', email);
    
    if (!email || !password) {
      console.warn('[SIGNUP] Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!email.includes('@')) {
      console.warn('[SIGNUP] Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 6) {
      console.warn('[SIGNUP] Password too short');
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const data = await db.signup(email, password);
    console.log('[SIGNUP] Success for email:', email);
    
    res.json({
      success: true,
      user: data.user,
      session: data.session,
      message: 'Account created successfully'
    });
  } catch (err) {
    console.error('[SIGNUP] Error:', err.message || err);
    const errorMessage = err.message || 'Failed to create account';
    const status = errorMessage.includes('already exists') ? 400 : 500;
    res.status(status).json({ error: errorMessage, details: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('[LOGIN] Attempt for email:', email);
    
    if (!email || !password) {
      console.warn('[LOGIN] Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const data = await db.login(email, password);
    console.log('[LOGIN] Success for email:', email);

    res.json({
      success: true,
      user: data.user,
      session: data.session,
      message: 'Logged in successfully'
    });
  } catch (err) {
    console.error('[LOGIN] Error:', err.message || err);
    res.status(401).json({ error: 'Invalid email or password', details: err.message });
  }
});

router.post('/auth/logout', async (req, res) => {
  try {
    await db.logout(req.body.accessToken);
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Domain Routes
router.post('/domains', async (req, res) => {
  try {
    const { userId, domain } = req.body;
    
    if (!userId || !domain) {
      return res.status(400).json({ error: 'User ID and domain required' });
    }

    const data = await db.createDomain(userId, domain);
    res.json({ success: true, domain: data });
  } catch (err) {
    console.error('Error creating domain:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/domains/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const domains = await db.getDomains(userId);
    res.json(domains);
  } catch (err) {
    console.error('Error fetching domains:', err);
    res.status(500).json({ error: err.message });
  }
});

// DNS Checker
router.post('/dns/check', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain required' });
    }

    const results = {
      domain,
      mx: null,
      spf: null,
      dkim: null,
      dmarc: null,
      errors: []
    };

    try {
      // Check MX records
      const mxRecords = await dns.resolveMx(domain);
      results.mx = mxRecords;
    } catch (err) {
      results.errors.push(`MX: ${err.message}`);
    }

    try {
      // Check TXT records for SPF
      const txtRecords = await dns.resolveTxt(domain);
      results.spf = txtRecords.find(record => record.join('').startsWith('v=spf1'));
      results.dmarc = txtRecords.find(record => record.join('').startsWith('v=DMARC1'));
    } catch (err) {
      results.errors.push(`TXT: ${err.message}`);
    }

    res.json(results);
  } catch (err) {
    console.error('Error checking DNS:', err);
    res.status(500).json({ error: err.message });
  }
});

// Inbox Routes
router.get('/emails/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const emails = await db.getEmails(userId, parseInt(limit), parseInt(offset));
    const stats = await db.getEmailStats(userId);

    res.json({
      emails,
      total: stats.total,
      unread: stats.unread
    });
  } catch (err) {
    console.error('Error fetching emails:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/email/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    const email = await db.getEmail(emailId);

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    await db.markAsRead(emailId);
    res.json(email);
  } catch (err) {
    console.error('Error fetching email:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/email/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    await db.deleteEmail(emailId);
    res.json({ success: true, message: 'Email deleted' });
  } catch (err) {
    console.error('Error deleting email:', err);
    res.status(500).json({ error: err.message });
  }
});

// Send Email Routes
router.post('/send', async (req, res) => {
  try {
    const { userId, to, subject, body, html } = req.body;

    if (!userId || !to || !subject) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await db.getCurrentUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      await emailSender.sendEmail(user.email, to, subject, body, html);
      
      const emailId = uuid();
      await db.saveEmail(emailId, userId, user.email, to, subject, body, html, 'sent');

      res.json({
        success: true,
        message: 'Email sent successfully',
        emailId
      });
    } catch (sendErr) {
      const draftId = uuid();
      await db.saveDraft(draftId, userId, to, subject, body);
      
      res.status(500).json({
        error: 'Failed to send email, saved as draft',
        draftId
      });
    }
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: err.message });
  }
});

// Draft Routes
router.post('/drafts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { to, subject, body } = req.body;

    const draftId = uuid();
    await db.saveDraft(draftId, userId, to, subject, body);

    res.json({
      success: true,
      draftId,
      message: 'Draft saved'
    });
  } catch (err) {
    console.error('Error saving draft:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/drafts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const drafts = await db.getDrafts(userId);
    res.json(drafts);
  } catch (err) {
    console.error('Error fetching drafts:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/drafts/:draftId', async (req, res) => {
  try {
    const { draftId } = req.params;
    await db.deleteDraft(draftId);
    res.json({ success: true, message: 'Draft deleted' });
  } catch (err) {
    console.error('Error deleting draft:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
