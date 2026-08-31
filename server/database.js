const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

class Database {
  constructor() {
    this.isMongo = false;
    this.mongoClient = null;
    this.mongoDb = null;

    this.data = {
      adminPasswordHash: this.hashPassword('mk@123'),
      keys: [],
      logs: []
    };

    this.init();
  }

  hashPassword(password) {
    return crypto.createHash('sha256').update(password + 'FK_ADMIN_SALT_2026').digest('hex');
  }

  async init() {
    // 1. Check if Cloud MongoDB is provided via environment
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
      try {
        const { MongoClient } = require('mongodb');
        this.mongoClient = new MongoClient(mongoUri);
        await this.mongoClient.connect();
        this.mongoDb = this.mongoClient.db('flipkart_search_admin');
        this.isMongo = true;
        console.log('✅ Connected to Cloud MongoDB Atlas successfully (Permanent Lifetime Storage)!');

        // Load data from cloud
        const settingsDoc = await this.mongoDb.collection('settings').findOne({ _id: 'admin_config' });
        if (settingsDoc) {
          this.data.adminPasswordHash = settingsDoc.adminPasswordHash || this.data.adminPasswordHash;
        } else {
          await this.mongoDb.collection('settings').updateOne(
            { _id: 'admin_config' },
            { $set: { adminPasswordHash: this.data.adminPasswordHash } },
            { upsert: true }
          );
        }

        const keysDocs = await this.mongoDb.collection('keys').find({}).toArray();
        this.data.keys = keysDocs || [];

        const logsDocs = await this.mongoDb.collection('logs').find({}).sort({ timestamp: -1 }).limit(100).toArray();
        this.data.logs = logsDocs || [];
        return;
      } catch (err) {
        console.warn('MongoDB connection failed, falling back to local file storage:', err.message);
      }
    }

    // 2. Local File fallback
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.error('Error loading local database:', err.message);
        this.save();
      }
    } else {
      this.save();
    }
  }

  async save() {
    // Save to Cloud MongoDB if connected
    if (this.isMongo && this.mongoDb) {
      try {
        await this.mongoDb.collection('settings').updateOne(
          { _id: 'admin_config' },
          { $set: { adminPasswordHash: this.data.adminPasswordHash } },
          { upsert: true }
        );
      } catch (err) {
        console.error('MongoDB save error:', err.message);
      }
    }

    // Always keep local copy updated
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Local save error:', err.message);
    }
  }

  async logActivity(action, details) {
    const logItem = {
      id: 'log_' + Date.now(),
      action,
      details,
      timestamp: new Date().toISOString()
    };
    this.data.logs.unshift(logItem);
    if (this.data.logs.length > 500) {
      this.data.logs = this.data.logs.slice(0, 500);
    }

    if (this.isMongo && this.mongoDb) {
      this.mongoDb.collection('logs').insertOne(logItem).catch(() => {});
    }

    this.save();
  }

  verifyAdmin(password) {
    return this.hashPassword(password) === this.data.adminPasswordHash;
  }

  async updateAdminPassword(oldPassword, newPassword) {
    if (!this.verifyAdmin(oldPassword)) {
      return { success: false, error: 'Current password is incorrect.' };
    }
    if (!newPassword || newPassword.length < 4) {
      return { success: false, error: 'New password must be at least 4 characters.' };
    }
    this.data.adminPasswordHash = this.hashPassword(newPassword);
    await this.logActivity('ADMIN_PASSWORD_CHANGED', 'Admin password updated.');
    await this.save();
    return { success: true };
  }

  /**
   * Generate a unique license key
   */
  generateKey({ planType, days, clientName = 'User', maxDevices = 1 }) {
    const daysCode = planType === 'LIFETIME' ? 'LIFE' : `${days}D`;
    const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const sigPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const key = `FKPRO-${daysCode}-${randPart}-${sigPart}`;

    const newKeyRecord = {
      id: 'key_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      key,
      planType,
      days: planType === 'LIFETIME' ? 36500 : parseInt(days, 10),
      clientName: clientName.trim() || 'User',
      maxDevices: parseInt(maxDevices, 10) || 1,
      createdAt: Date.now(),
      expiresAt: null,
      status: 'ACTIVE',
      activatedDevices: [],
      firstActivatedAt: null
    };

    this.data.keys.unshift(newKeyRecord);

    if (this.isMongo && this.mongoDb) {
      this.mongoDb.collection('keys').insertOne({ ...newKeyRecord, _id: newKeyRecord.id }).catch(() => {});
    }

    this.logActivity('KEY_GENERATED', `Key generated for ${clientName} (${planType} - ${daysCode})`);
    this.save();

    return newKeyRecord;
  }

  /**
   * Activate / Redeem a license key from client device
   */
  activateKey({ key, deviceId, clientName = '' }) {
    if (!key) return { success: false, error: 'License key is required.' };
    const cleanKey = key.trim().toUpperCase();

    const record = this.data.keys.find(k => k.key.toUpperCase() === cleanKey);
    if (!record) {
      return { success: false, error: 'Invalid license key. Key not found in database.' };
    }

    if (record.status === 'REVOKED') {
      return { success: false, error: 'This license key has been revoked by the administrator.' };
    }

    const now = Date.now();

    if (record.expiresAt && now > record.expiresAt && record.planType !== 'LIFETIME') {
      record.status = 'EXPIRED';
      this.syncKeyToMongo(record);
      this.save();
      return { success: false, error: 'This license key has expired.' };
    }

    if (deviceId) {
      if (!record.activatedDevices.includes(deviceId)) {
        if (record.activatedDevices.length >= record.maxDevices) {
          return { success: false, error: `Device limit reached (Max: ${record.maxDevices}). Key is already bound to another device.` };
        }
        record.activatedDevices.push(deviceId);
      }
    }

    if (!record.firstActivatedAt) {
      record.firstActivatedAt = now;
      if (record.planType === 'LIFETIME') {
        record.expiresAt = now + (100 * 365 * 24 * 60 * 60 * 1000);
      } else {
        record.expiresAt = now + (record.days * 24 * 60 * 60 * 1000);
      }
    }

    if (clientName && record.clientName === 'User') {
      record.clientName = clientName;
    }

    this.syncKeyToMongo(record);
    this.logActivity('KEY_ACTIVATED', `Key ${cleanKey} activated by device ${deviceId}`);
    this.save();

    const daysRemaining = record.planType === 'LIFETIME' ? 9999 : Math.max(0, Math.ceil((record.expiresAt - now) / (1000 * 60 * 60 * 24)));

    return {
      success: true,
      planType: record.planType,
      days: record.days,
      daysRemaining,
      expiresAt: record.expiresAt,
      expiryDate: record.planType === 'LIFETIME' ? 'Lifetime Access' : new Date(record.expiresAt).toLocaleDateString(),
      clientName: record.clientName
    };
  }

  /**
   * Verify license validity
   */
  verifyLicense({ key, deviceId }) {
    if (!key) return { isValid: false, error: 'No key provided.' };
    const cleanKey = key.trim().toUpperCase();

    const record = this.data.keys.find(k => k.key.toUpperCase() === cleanKey);
    if (!record) {
      return { isValid: false, error: 'License key not found.' };
    }

    if (record.status === 'REVOKED') {
      return { isValid: false, error: 'License has been revoked.' };
    }

    const now = Date.now();
    if (record.expiresAt && now > record.expiresAt && record.planType !== 'LIFETIME') {
      record.status = 'EXPIRED';
      this.syncKeyToMongo(record);
      this.save();
      return { isValid: false, error: 'License has expired.' };
    }

    const daysRemaining = record.planType === 'LIFETIME' ? 9999 : Math.max(0, Math.ceil((record.expiresAt - now) / (1000 * 60 * 60 * 24)));

    return {
      isValid: true,
      planType: record.planType,
      daysRemaining,
      expiresAt: record.expiresAt,
      expiryDate: record.planType === 'LIFETIME' ? 'Lifetime Access' : new Date(record.expiresAt).toLocaleDateString(),
      clientName: record.clientName
    };
  }

  revokeKey(keyId) {
    const record = this.data.keys.find(k => k.id === keyId || k.key === keyId);
    if (!record) return { success: false, error: 'Key not found.' };

    record.status = 'REVOKED';
    this.syncKeyToMongo(record);
    this.logActivity('KEY_REVOKED', `License key ${record.key} revoked.`);
    this.save();
    return { success: true };
  }

  restoreKey(keyId) {
    const record = this.data.keys.find(k => k.id === keyId || k.key === keyId);
    if (!record) return { success: false, error: 'Key not found.' };

    record.status = 'ACTIVE';
    this.syncKeyToMongo(record);
    this.logActivity('KEY_RESTORED', `License key ${record.key} restored to ACTIVE.`);
    this.save();
    return { success: true };
  }

  extendKey(keyId, extraDays) {
    const record = this.data.keys.find(k => k.id === keyId || k.key === keyId);
    if (!record) return { success: false, error: 'Key not found.' };

    const daysToAdd = parseInt(extraDays, 10);
    if (isNaN(daysToAdd) || daysToAdd <= 0) return { success: false, error: 'Invalid days count.' };

    const now = Date.now();
    const baseTime = (record.expiresAt && record.expiresAt > now) ? record.expiresAt : now;
    record.expiresAt = baseTime + (daysToAdd * 24 * 60 * 60 * 1000);
    record.days += daysToAdd;
    record.status = 'ACTIVE';

    this.syncKeyToMongo(record);
    this.logActivity('KEY_EXTENDED', `License key ${record.key} extended by ${daysToAdd} days.`);
    this.save();
    return { success: true, newExpiresAt: record.expiresAt };
  }

  deleteKey(keyId) {
    const idx = this.data.keys.findIndex(k => k.id === keyId || k.key === keyId);
    if (idx === -1) return { success: false, error: 'Key not found.' };

    const removed = this.data.keys.splice(idx, 1)[0];
    if (this.isMongo && this.mongoDb) {
      this.mongoDb.collection('keys').deleteOne({ _id: removed.id }).catch(() => {});
    }
    this.logActivity('KEY_DELETED', `License key ${removed.key} permanently deleted.`);
    this.save();
    return { success: true };
  }

  syncKeyToMongo(record) {
    if (this.isMongo && this.mongoDb) {
      this.mongoDb.collection('keys').updateOne(
        { _id: record.id },
        { $set: record },
        { upsert: true }
      ).catch(() => {});
    }
  }

  getAllKeys() {
    const now = Date.now();
    return this.data.keys.map(k => {
      let currentStatus = k.status;
      let daysRemaining = 0;

      if (k.planType === 'LIFETIME') {
        daysRemaining = 9999;
      } else if (k.expiresAt) {
        if (now > k.expiresAt && currentStatus !== 'REVOKED') {
          currentStatus = 'EXPIRED';
        }
        daysRemaining = Math.max(0, Math.ceil((k.expiresAt - now) / (1000 * 60 * 60 * 24)));
      } else {
        daysRemaining = k.days;
      }

      return {
        ...k,
        currentStatus,
        daysRemaining,
        expiryDateFormatted: k.expiresAt ? (k.planType === 'LIFETIME' ? 'Lifetime' : new Date(k.expiresAt).toLocaleDateString()) : 'Not Yet Activated',
        createdAtFormatted: new Date(k.createdAt).toLocaleDateString()
      };
    });
  }

  getDashboardStats() {
    const keys = this.getAllKeys();
    const totalKeys = keys.length;
    const activeKeys = keys.filter(k => k.currentStatus === 'ACTIVE').length;
    const expiredKeys = keys.filter(k => k.currentStatus === 'EXPIRED').length;
    const revokedKeys = keys.filter(k => k.currentStatus === 'REVOKED').length;
    const totalActivatedDevices = keys.reduce((acc, k) => acc + (k.activatedDevices ? k.activatedDevices.length : 0), 0);

    return {
      totalKeys,
      activeKeys,
      expiredKeys,
      revokedKeys,
      totalActivatedDevices,
      recentLogs: this.data.logs.slice(0, 10)
    };
  }
}

module.exports = new Database();
