const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Simple .env file loader if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...vals] = trimmed.split('=');
      const val = vals.join('=').trim().replace(/(^['"]|['"]$)/g, '');
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  });
}

const db = require('./database.js');
const ServerScraper = require('./server_scraper.js');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory session tokens for admin
const activeAdminSessions = new Set();

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || !activeAdminSessions.has(token.replace('Bearer ', ''))) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired admin session.' });
  }
  next();
}

// -------------------------------------------------------------
// CLIENT WEB & EXTENSION API ENDPOINTS
// -------------------------------------------------------------

/**
 * Live Web Search Scraper Endpoint
 */
app.post('/api/search/scrape', async (req, res) => {
  const {
    licenseKey,
    productUrl,
    queryNames = [],
    queryLocations = [],
    exactOnly = false,
    threshold = 0.75,
    maxPagesPerSection = 25,
    searchScope = 'ALL_SECTIONS'
  } = req.body;

  // 1. Verify License Key
  if (!licenseKey) {
    return res.status(401).json({ error: 'Membership License Key is required to search. Contact @mahabirgope7 on Telegram to buy.' });
  }

  const licCheck = db.verifyLicense({ key: licenseKey });
  if (!licCheck.isValid) {
    return res.status(403).json({ error: licCheck.error || 'Invalid or expired License Key.' });
  }

  // 2. Validate & Normalize ANY Flipkart URL (including short links and text shares)
  const norm = await ServerScraper.normalizeUniversalUrl(productUrl);
  if (!norm.isValid) {
    return res.status(400).json({ error: norm.error || 'Invalid Flipkart Product URL.' });
  }

  try {
    const results = await ServerScraper.searchReviews({
      reviewUrl: norm.reviewUrl,
      queryNames,
      queryLocations,
      exactOnly,
      threshold,
      maxPagesPerSection: Math.min(maxPagesPerSection, 100),
      searchScope
    });

    return res.json({
      success: true,
      productTitle: norm.productTitle,
      ...results
    });
  } catch (err) {
    console.error('Scraper error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch reviews: ' + err.message });
  }
});

/**
 * Activate a license key from the Chrome extension
 */
app.post('/api/license/activate', (req, res) => {
  const { key, deviceId, clientName } = req.body;
  const result = db.activateKey({ key, deviceId, clientName });
  if (result.success) {
    return res.json(result);
  } else {
    return res.status(400).json(result);
  }
});

/**
 * Verify license status from the Chrome extension
 */
app.post('/api/license/verify', (req, res) => {
  const { key, deviceId } = req.body;
  const result = db.verifyLicense({ key, deviceId });
  return res.json(result);
});

// -------------------------------------------------------------
// ADMIN API ENDPOINTS (Protected)
// -------------------------------------------------------------

/**
 * Admin Login
 */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (db.verifyAdmin(password)) {
    const token = 'adm_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    activeAdminSessions.add(token);
    return res.json({ success: true, token });
  } else {
    return res.status(401).json({ success: false, error: 'Incorrect Admin password.' });
  }
});

/**
 * Get Dashboard statistics & logs
 */
app.get('/api/admin/dashboard', authMiddleware, (req, res) => {
  const stats = db.getDashboardStats();
  res.json(stats);
});

/**
 * Get all license keys
 */
app.get('/api/admin/keys', authMiddleware, (req, res) => {
  const keys = db.getAllKeys();
  res.json({ keys });
});

/**
 * Generate a new license key
 */
app.post('/api/admin/generate-key', authMiddleware, (req, res) => {
  const { planType, days, clientName, maxDevices } = req.body;
  if (!planType) {
    return res.status(400).json({ error: 'planType is required.' });
  }
  const keyRecord = db.generateKey({ planType, days, clientName, maxDevices });
  res.json({ success: true, key: keyRecord });
});

/**
 * Revoke a key
 */
app.post('/api/admin/revoke-key', authMiddleware, (req, res) => {
  const { keyId } = req.body;
  const result = db.revokeKey(keyId);
  res.json(result);
});

/**
 * Restore a revoked key
 */
app.post('/api/admin/restore-key', authMiddleware, (req, res) => {
  const { keyId } = req.body;
  const result = db.restoreKey(keyId);
  res.json(result);
});

/**
 * Extend days on a key
 */
app.post('/api/admin/extend-key', authMiddleware, (req, res) => {
  const { keyId, days } = req.body;
  const result = db.extendKey(keyId, days);
  res.json(result);
});

/**
 * Delete a key
 */
app.post('/api/admin/delete-key', authMiddleware, (req, res) => {
  const { keyId } = req.body;
  const result = db.deleteKey(keyId);
  res.json(result);
});

/**
 * Change Admin Password
 */
app.post('/api/admin/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const result = db.updateAdminPassword(oldPassword, newPassword);
  res.json(result);
});

// Admin Web Portal Routes
app.get(['/admin', '/admin/', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Web Search App Routes
app.get(['/', '/search', '/app'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback to Web App (except /admin)
app.get('*', (req, res) => {
  if (req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Flipkart Review Search Backend Server Running!`);
  console.log(`🌐 Admin Panel URL: http://localhost:${PORT}`);
  console.log(`📡 API Base URL:    http://localhost:${PORT}/api`);
  console.log(`🔑 Default Admin Password: admin123`);
  console.log(`====================================================`);
});
