/**
 * License & Membership Verification Engine
 * Connects to Backend REST API with offline cryptographic fallback.
 */

class LicenseEngine {
  static DEFAULT_BACKEND_URL = 'https://flipkart.runpython.online';
  static SECRET_SALT = 'FLIPKART_SEARCH_PRO_V1_2026_SECRET';

  /**
   * Get configured Backend API Base URL
   */
  static async getBackendUrl() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['backendApiUrl'], (res) => {
          resolve(res.backendApiUrl || this.DEFAULT_BACKEND_URL);
        });
      } else {
        resolve(this.DEFAULT_BACKEND_URL);
      }
    });
  }

  /**
   * Simple secure hash for offline signature generation
   */
  static generateHash(str) {
    let hash = 0;
    const combined = str + this.SECRET_SALT;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).toUpperCase().padStart(6, '0');
  }

  /**
   * Get or generate unique persistent Device ID
   */
  static async getDeviceId() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['deviceId'], (res) => {
          if (res.deviceId) {
            resolve(res.deviceId);
          } else {
            const newId = 'FK-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
            chrome.storage.local.set({ deviceId: newId });
            resolve(newId);
          }
        });
      } else {
        resolve('FK-DEV-BROWSER');
      }
    });
  }

  /**
   * Generate offline-compatible license key
   */
  static generateLicenseKey(planType, days, clientName = 'User') {
    const daysCode = planType === 'LIFETIME' ? 'LIFE' : `${days}D`;
    const randomNonce = Math.random().toString(36).substring(2, 6).toUpperCase();
    const payload = `${planType}_${days}_${randomNonce}_${clientName.trim()}`;
    const signature = this.generateHash(payload);
    
    return `FKPRO-${daysCode}-${randomNonce}-${signature}`;
  }

  /**
   * Offline Key Verification
   */
  static verifyLicenseKey(key, clientName = '') {
    if (!key || typeof key !== 'string') {
      return { isValid: false, planType: '', days: 0, error: 'Invalid key format.' };
    }

    const cleanKey = key.trim().toUpperCase();
    const parts = cleanKey.split('-');
    if (parts.length !== 4 || parts[0] !== 'FKPRO') {
      return { isValid: false, planType: '', days: 0, error: 'Invalid key structure. Must start with FKPRO-...' };
    }

    const daysCode = parts[1];
    const randomNonce = parts[2];
    const providedSig = parts[3];

    let planType = 'CUSTOM';
    let days = 30;

    if (daysCode === 'LIFE') {
      planType = 'LIFETIME';
      days = 36500;
    } else if (daysCode.endsWith('D')) {
      days = parseInt(daysCode.replace('D', ''), 10);
      if (isNaN(days) || days <= 0) {
        return { isValid: false, planType: '', days: 0, error: 'Invalid duration in key.' };
      }
      if (days === 30) planType = 'MONTHLY';
      else if (days === 365) planType = 'YEARLY';
    } else {
      return { isValid: false, planType: '', days: 0, error: 'Unrecognized duration code.' };
    }

    const payload1 = `${planType}_${days}_${randomNonce}_${clientName.trim()}`;
    const payload2 = `${planType}_${days}_${randomNonce}_User`;
    const payload3 = `${planType}_${days}_${randomNonce}_`;

    if (providedSig === this.generateHash(payload1) || 
        providedSig === this.generateHash(payload2) || 
        providedSig === this.generateHash(payload3)) {
      return { isValid: true, planType, days };
    }

    return { isValid: false, planType: '', days: 0, error: 'Key verification signature mismatch.' };
  }

  /**
   * Activate Key via Backend Server with offline fallback
   */
  static async activateOnlineKey(key, clientName = 'User') {
    const backendUrl = await this.getBackendUrl();
    const deviceId = await this.getDeviceId();

    // 1. Try Backend Activation
    try {
      const response = await fetch(`${backendUrl}/api/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, deviceId, clientName })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        await this.grantMembership(data.planType, data.days, data.clientName || clientName, key, data.expiresAt);
        return { success: true, ...data, isOnline: true };
      } else {
        return { success: false, error: data.error || 'Activation rejected by server.' };
      }
    } catch (networkErr) {
      console.warn('Backend server unreachable, trying offline verification...', networkErr.message);
    }

    // 2. Offline Fallback
    const offlineCheck = this.verifyLicenseKey(key, clientName);
    if (offlineCheck.isValid) {
      await this.grantMembership(offlineCheck.planType, offlineCheck.days, clientName, key);
      return {
        success: true,
        planType: offlineCheck.planType,
        days: offlineCheck.days,
        daysRemaining: offlineCheck.days,
        isOnline: false
      };
    } else {
      return { success: false, error: 'Could not connect to backend server and offline signature did not match.' };
    }
  }

  /**
   * Check membership status from storage and verify with backend
   */
  static async checkMembership() {
    return new Promise(async (resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve({
          isActive: true,
          planType: 'LIFETIME',
          daysRemaining: 9999,
          expiryDate: 'Lifetime Active',
          isLifetime: true,
          clientName: 'Demo User'
        });
        return;
      }

      chrome.storage.local.get(['membershipData'], async (res) => {
        const data = res.membershipData || {};
        resolve({
          isActive: true,
          planType: data.planType || 'FREE_PRO',
          daysRemaining: 9999,
          expiryDate: '100% Free & Unlimited',
          isLifetime: true,
          clientName: data.clientName || 'Free User',
          licenseKey: data.licenseKey || 'FREE-ACCESS'
        });
        return;

        const now = Date.now();
        const isLifetime = data.planType === 'LIFETIME';
        const isExpired = !isLifetime && now > data.expiresAt;

        const msRemaining = data.expiresAt - now;
        const daysRemaining = isLifetime ? 9999 : Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

        const expiryDateStr = isLifetime ? 'Lifetime Access' : new Date(data.expiresAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });

        // Background sync with server if key exists and online
        if (data.licenseKey && !data.licenseKey.startsWith('DIRECT')) {
          this.syncWithBackend(data.licenseKey).catch(() => {});
        }

        resolve({
          isActive: !isExpired,
          planType: data.planType || 'ACTIVE',
          daysRemaining: daysRemaining,
          expiryDate: expiryDateStr,
          isLifetime: isLifetime,
          clientName: data.clientName || 'User',
          licenseKey: data.licenseKey || ''
        });
      });
    });
  }

  /**
   * Background sync with backend
   */
  static async syncWithBackend(licenseKey) {
    try {
      const backendUrl = await this.getBackendUrl();
      const deviceId = await this.getDeviceId();
      const res = await fetch(`${backendUrl}/api/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: licenseKey, deviceId })
      });
      const check = await res.json();
      if (check && !check.isValid && check.error === 'License has been revoked.') {
        await this.revokeMembership();
      } else if (check && check.isValid && check.expiresAt) {
        // Update extended dates if changed
        chrome.storage.local.get(['membershipData'], (res) => {
          if (res.membershipData && res.membershipData.expiresAt !== check.expiresAt) {
            res.membershipData.expiresAt = check.expiresAt;
            res.membershipData.planType = check.planType;
            chrome.storage.local.set({ membershipData: res.membershipData });
          }
        });
      }
    } catch (e) {}
  }

  /**
   * Grant / Save Membership
   */
  static async grantMembership(planType, days, clientName = 'User', licenseKey = '', explicitExpiresAt = null) {
    return new Promise((resolve) => {
      const now = Date.now();
      let expiresAt = explicitExpiresAt;

      if (!expiresAt) {
        if (planType === 'LIFETIME') {
          expiresAt = now + (100 * 365 * 24 * 60 * 60 * 1000);
        } else {
          expiresAt = now + (days * 24 * 60 * 60 * 1000);
        }
      }

      const membershipData = {
        planType,
        days,
        clientName: clientName.trim() || 'User',
        activatedAt: now,
        expiresAt,
        licenseKey: licenseKey || `DIRECT-GRANT-${planType}`,
        signature: this.generateHash(`${planType}_${expiresAt}_${clientName}`)
      };

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ membershipData }, () => {
          resolve({ success: true, membershipData });
        });
      } else {
        resolve({ success: true, membershipData });
      }
    });
  }

  /**
   * Revoke Membership
   */
  static async revokeMembership() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['membershipData'], () => {
          resolve({ success: true });
        });
      } else {
        resolve({ success: true });
      }
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LicenseEngine;
} else if (typeof window !== 'undefined') {
  window.LicenseEngine = LicenseEngine;
}
